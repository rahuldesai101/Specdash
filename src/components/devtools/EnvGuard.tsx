import { useEffect, useMemo, useState } from "react";
import { fetchRaw, ghFetch, type TreeItem } from "@/lib/github-db";
import {
  isEnvExamplePath,
  isScannablePath,
  parseEnvFile,
  referencedEnvKeys,
  scanSecrets,
  type EnvKey,
  type SecretHit,
} from "@/lib/env-guard";
import { DevModal, Tab } from "./Shell";

type Phase = "SCANNING" | "READY" | "ERROR";

export function EnvGuard({
  owner,
  repo,
  branch,
  onClose,
  onOpenFile,
}: {
  owner: string;
  repo: string;
  branch: string;
  onClose: () => void;
  onOpenFile?: (p: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("SCANNING");
  const [err, setErr] = useState<string | null>(null);
  const [envFiles, setEnvFiles] = useState<Array<{ path: string; keys: EnvKey[] }>>([]);
  const [hits, setHits] = useState<SecretHit[]>([]);
  const [refKeys, setRefKeys] = useState<string[]>([]);
  const [scanned, setScanned] = useState(0);
  const [tab, setTab] = useState<"secrets" | "env" | "missing">("secrets");
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setPhase("SCANNING");
      try {
        const tree = await ghFetch<{ tree: TreeItem[] }>(
          `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        );
        const blobs = tree.data.tree.filter((i) => i.type === "blob");

        const envs: Array<{ path: string; keys: EnvKey[] }> = [];
        for (const f of blobs.filter((b) => isEnvExamplePath(b.path)).slice(0, 6)) {
          try {
            const t = await fetchRaw(owner, repo, branch, f.path);
            envs.push({ path: f.path, keys: parseEnvFile(t) });
          } catch {
            /* skip */
          }
        }
        if (cancelled) return;
        setEnvFiles(envs);

        const targets = blobs
          .filter((b) => isScannablePath(b.path) && (b.size ?? 0) < 200_000)
          .sort((a, b) => (a.path.split("/").length - b.path.split("/").length))
          .slice(0, 60);

        const found: SecretHit[] = [];
        const refs = new Set<string>();
        let n = 0;
        for (const f of targets) {
          if (cancelled) return;
          try {
            const text = await fetchRaw(owner, repo, branch, f.path);
            found.push(...scanSecrets(f.path, text));
            referencedEnvKeys(text).forEach((k) => refs.add(k));
          } catch {
            /* unreadable */
          }
          n += 1;
          if (!cancelled) setScanned(n);
        }
        if (cancelled) return;
        setHits(found);
        setRefKeys([...refs]);
        setPhase("READY");
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "SCAN_ERR");
        setPhase("ERROR");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch]);

  const declared = useMemo(
    () => new Set(envFiles.flatMap((f) => f.keys.map((k) => k.key))),
    [envFiles],
  );
  const missing = useMemo(() => refKeys.filter((k) => !declared.has(k)).sort(), [refKeys, declared]);
  const high = hits.filter((h) => h.severity === "high").length;

  return (
    <DevModal
      title="ENV_INSPECTOR // SECRET_GUARD"
      accent={high ? "var(--t-orange)" : "var(--t-green)"}
      onClose={onClose}
      wide
      toolbar={
        <>
          <Tab active={tab === "secrets"} onClick={() => setTab("secrets")}>
            [ HARDCODED {String(hits.length).padStart(2, "0")} ]
          </Tab>
          <Tab active={tab === "env"} onClick={() => setTab("env")}>
            [ .ENV KEYS {String(declared.size).padStart(2, "0")} ]
          </Tab>
          <Tab active={tab === "missing"} onClick={() => setTab("missing")}>
            [ UNDECLARED {String(missing.length).padStart(2, "0")} ]
          </Tab>
          <button
            onClick={() => setReveal((v) => !v)}
            className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim)] hover:text-[var(--t-green)]"
          >
            {reveal ? "🙈 MASK VALUES" : "👁 SHOW EXAMPLES"}
          </button>
          <span className="ml-auto" style={{ color: phase === "READY" ? (high ? "var(--t-orange)" : "var(--t-green)") : "var(--t-amber)" }}>
            [ {phase === "READY" ? (high ? `${high} HIGH_RISK` : "NO_HIGH_RISK") : `${phase} ${scanned}`} ]
          </span>
        </>
      }
      footer="Scans up to 60 shallow source files via the GitHub raw CDN · values are masked before render · nothing is uploaded"
    >
      {phase === "SCANNING" && (
        <div className="p-6 text-center text-[var(--t-dim-2)]">&gt; SCANNING_REPOSITORY… {scanned} files</div>
      )}
      {phase === "ERROR" && <div className="p-6 text-center text-[var(--t-orange)]">ERR: {err}</div>}

      {phase !== "ERROR" && tab === "secrets" && (
        hits.length === 0 ? (
          phase === "READY" && (
            <div className="p-8 text-center uppercase tracking-widest text-[var(--t-green)]">
              &gt; NO_HARDCODED_CREDENTIALS_DETECTED across {scanned} files
            </div>
          )
        ) : (
          hits.map((h) => (
            <div
              key={h.id}
              className="mb-2 border p-3"
              style={{ borderColor: h.severity === "high" ? "var(--t-orange)" : "var(--t-dim-2)" }}
            >
              <div className="text-[11px]" style={{ color: h.severity === "high" ? "var(--t-orange)" : "var(--t-amber)" }}>
                [ ⚠️ {h.severity === "high" ? "Warning" : "Advisory"}: Potential {h.kind.replace(/_/g, " ")} in /{h.file}:{h.line} ]
              </div>
              <div className="mt-2 overflow-x-auto border-l-2 border-[var(--t-line)] pl-2 font-mono text-[11px] text-[var(--t-fg-2)]">
                {h.snippet}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
                <span>MASKED: <span className="text-[var(--t-amber)]">{h.masked}</span></span>
                {onOpenFile && /\.(md|markdown)$/i.test(h.file) && (
                  <button onClick={() => onOpenFile(h.file)} className="text-[var(--t-green)]">
                    📄 OPEN
                  </button>
                )}
                <a
                  href={`https://github.com/${owner}/${repo}/blob/${branch}/${h.file}#L${h.line}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--t-green)]"
                >
                  ↗ GITHUB
                </a>
              </div>
            </div>
          ))
        )
      )}

      {phase !== "ERROR" && tab === "env" && (
        envFiles.length === 0 ? (
          <div className="p-8 text-center uppercase tracking-widest text-[var(--t-dim-3)]">&gt; NO_.ENV.EXAMPLE_FOUND</div>
        ) : (
          envFiles.map((f) => (
            <div key={f.path} className="mb-3 border border-[var(--t-surface-2)]">
              <div className="border-b border-[var(--t-surface-2)] px-2 py-1.5 text-[10px] uppercase tracking-widest text-[var(--t-green)]">
                /{f.path} · {f.keys.length} keys
              </div>
              {f.keys.map((k) => {
                const used = refKeys.includes(k.key);
                return (
                  <div key={k.key} className="flex flex-wrap items-center gap-2 border-b border-[var(--t-surface)] px-2 py-1.5 last:border-b-0">
                    <span className="min-w-[180px] flex-1 truncate font-mono text-[11px] text-[var(--t-fg-2)]">{k.key}</span>
                    <span className="truncate font-mono text-[10px] text-[var(--t-amber)]">
                      {k.example ? (reveal ? k.example : maskExample(k.example)) : "<empty>"}
                    </span>
                    <span
                      className="border px-1 text-[9px] uppercase tracking-widest"
                      style={{ borderColor: used ? "var(--t-green)" : "var(--t-line)", color: used ? "var(--t-green)" : "var(--t-dim-3)" }}
                    >
                      {used ? "USED_IN_CODE" : "UNREFERENCED"}
                    </span>
                    {k.required && (
                      <span className="border border-[var(--t-amber)] px-1 text-[9px] uppercase tracking-widest text-[var(--t-amber)]">
                        REQUIRED
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )
      )}

      {phase !== "ERROR" && tab === "missing" && (
        missing.length === 0 ? (
          <div className="p-8 text-center uppercase tracking-widest text-[var(--t-green)]">
            &gt; ALL_REFERENCED_KEYS_DECLARED
          </div>
        ) : (
          <div className="border border-[var(--t-orange)]">
            <div className="border-b border-[var(--t-tint-warm)] px-2 py-1.5 text-[10px] uppercase tracking-widest text-[var(--t-orange)]">
              REFERENCED IN CODE BUT MISSING FROM .ENV.EXAMPLE
            </div>
            {missing.map((k) => (
              <div key={k} className="border-b border-[var(--t-surface)] px-2 py-1.5 font-mono text-[11px] text-[var(--t-fg-2)] last:border-b-0">
                {k}=
              </div>
            ))}
          </div>
        )
      )}
    </DevModal>
  );
}

function maskExample(v: string) {
  if (v.length <= 4) return "****";
  return `${v.slice(0, 2)}****${v.slice(-2)}`;
}