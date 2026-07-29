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
      accent={high ? "#ff5500" : "#00ff66"}
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
            className="border border-[#333] px-2 py-1 text-[#888] hover:text-[#00ff66]"
          >
            {reveal ? "🙈 MASK VALUES" : "👁 SHOW EXAMPLES"}
          </button>
          <span className="ml-auto" style={{ color: phase === "READY" ? (high ? "#ff5500" : "#00ff66") : "#ffaa00" }}>
            [ {phase === "READY" ? (high ? `${high} HIGH_RISK` : "NO_HIGH_RISK") : `${phase} ${scanned}`} ]
          </span>
        </>
      }
      footer="Scans up to 60 shallow source files via the GitHub raw CDN · values are masked before render · nothing is uploaded"
    >
      {phase === "SCANNING" && (
        <div className="p-6 text-center text-[#666]">&gt; SCANNING_REPOSITORY… {scanned} files</div>
      )}
      {phase === "ERROR" && <div className="p-6 text-center text-[#ff5500]">ERR: {err}</div>}

      {phase !== "ERROR" && tab === "secrets" && (
        hits.length === 0 ? (
          phase === "READY" && (
            <div className="p-8 text-center uppercase tracking-widest text-[#00ff66]">
              &gt; NO_HARDCODED_CREDENTIALS_DETECTED across {scanned} files
            </div>
          )
        ) : (
          hits.map((h) => (
            <div
              key={h.id}
              className="mb-2 border p-3"
              style={{ borderColor: h.severity === "high" ? "#ff5500" : "#666" }}
            >
              <div className="text-[11px]" style={{ color: h.severity === "high" ? "#ff5500" : "#ffaa00" }}>
                [ ⚠️ {h.severity === "high" ? "Warning" : "Advisory"}: Potential {h.kind.replace(/_/g, " ")} in /{h.file}:{h.line} ]
              </div>
              <div className="mt-2 overflow-x-auto border-l-2 border-[#333] pl-2 font-mono text-[11px] text-[#ccc]">
                {h.snippet}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest text-[#666]">
                <span>MASKED: <span className="text-[#ffcc66]">{h.masked}</span></span>
                {onOpenFile && /\.(md|markdown)$/i.test(h.file) && (
                  <button onClick={() => onOpenFile(h.file)} className="text-[#00ff66]">
                    📄 OPEN
                  </button>
                )}
                <a
                  href={`https://github.com/${owner}/${repo}/blob/${branch}/${h.file}#L${h.line}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00ff66]"
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
          <div className="p-8 text-center uppercase tracking-widest text-[#555]">&gt; NO_.ENV.EXAMPLE_FOUND</div>
        ) : (
          envFiles.map((f) => (
            <div key={f.path} className="mb-3 border border-[#1a1a1a]">
              <div className="border-b border-[#1a1a1a] px-2 py-1.5 text-[10px] uppercase tracking-widest text-[#00ff66]">
                /{f.path} · {f.keys.length} keys
              </div>
              {f.keys.map((k) => {
                const used = refKeys.includes(k.key);
                return (
                  <div key={k.key} className="flex flex-wrap items-center gap-2 border-b border-[#121212] px-2 py-1.5 last:border-b-0">
                    <span className="min-w-[180px] flex-1 truncate font-mono text-[11px] text-[#ccc]">{k.key}</span>
                    <span className="truncate font-mono text-[10px] text-[#ffcc66]">
                      {k.example ? (reveal ? k.example : maskExample(k.example)) : "<empty>"}
                    </span>
                    <span
                      className="border px-1 text-[9px] uppercase tracking-widest"
                      style={{ borderColor: used ? "#00ff66" : "#333", color: used ? "#00ff66" : "#555" }}
                    >
                      {used ? "USED_IN_CODE" : "UNREFERENCED"}
                    </span>
                    {k.required && (
                      <span className="border border-[#ffaa00] px-1 text-[9px] uppercase tracking-widest text-[#ffaa00]">
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
          <div className="p-8 text-center uppercase tracking-widest text-[#00ff66]">
            &gt; ALL_REFERENCED_KEYS_DECLARED
          </div>
        ) : (
          <div className="border border-[#ff5500]">
            <div className="border-b border-[#331000] px-2 py-1.5 text-[10px] uppercase tracking-widest text-[#ff5500]">
              REFERENCED IN CODE BUT MISSING FROM .ENV.EXAMPLE
            </div>
            {missing.map((k) => (
              <div key={k} className="border-b border-[#121212] px-2 py-1.5 font-mono text-[11px] text-[#ccc] last:border-b-0">
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