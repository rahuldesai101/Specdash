import { useEffect, useMemo, useState } from "react";
import { fetchRaw, ghFetch, type TreeItem } from "@/lib/github-db";
import {
  COPYLEFT,
  isManifestPath,
  licenseFamily,
  parseManifest,
  type Dep,
  type Manifest,
} from "@/lib/deps";
import { DevModal, Tab } from "./Shell";

type Phase = "SCANNING" | "READY" | "ERROR";

export function DependencyRadar({
  owner,
  repo,
  branch,
  onClose,
}: {
  owner: string;
  repo: string;
  branch: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("SCANNING");
  const [err, setErr] = useState<string | null>(null);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [repoLicense, setRepoLicense] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | Dep["scope"]>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setPhase("SCANNING");
      try {
        const tree = await ghFetch<{ tree: TreeItem[] }>(
          `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        );
        const targets = tree.data.tree
          .filter((i) => i.type === "blob" && isManifestPath(i.path))
          .slice(0, 8);
        const out: Manifest[] = [];
        for (const t of targets) {
          try {
            const text = await fetchRaw(owner, repo, branch, t.path);
            const m = parseManifest(t.path, text);
            if (m) out.push(m);
          } catch {
            /* unreadable manifest */
          }
        }
        try {
          const meta = await ghFetch<{ license?: { spdx_id?: string } | null }>(`/repos/${owner}/${repo}`);
          if (!cancelled) setRepoLicense(meta.data.license?.spdx_id ?? null);
        } catch {
          /* no license metadata */
        }
        if (cancelled) return;
        setManifests(out);
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

  const all = useMemo(() => manifests.flatMap((m) => m.deps), [manifests]);
  const counts = useMemo(
    () => ({
      all: all.length,
      direct: all.filter((d) => d.scope === "direct").length,
      dev: all.filter((d) => d.scope === "dev").length,
      peer: all.filter((d) => d.scope === "peer").length,
      optional: all.filter((d) => d.scope === "optional").length,
    }),
    [all],
  );
  const risky = all.filter((d) => d.risk);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all
      .filter((d) => (scope === "all" || d.scope === scope) && (!n || d.name.toLowerCase().includes(n)))
      .sort((a, b) => (a.risk ? -1 : b.risk ? 1 : 0) || a.name.localeCompare(b.name))
      .slice(0, 600);
  }, [all, scope, q]);

  const licenses = useMemo(() => {
    const m = new Map<string, number>();
    for (const man of manifests) {
      const fam = licenseFamily(man.license);
      if (man.license) m.set(fam, (m.get(fam) ?? 0) + 1);
    }
    if (repoLicense) {
      const fam = licenseFamily(repoLicense);
      m.set(fam, (m.get(fam) ?? 0) + 1);
    }
    return [...m.entries()];
  }, [manifests, repoLicense]);

  return (
    <DevModal
      title="DEPENDENCY_RADAR // SUPPLY_CHAIN"
      accent={risky.length ? "var(--t-amber)" : "var(--t-green)"}
      onClose={onClose}
      wide
      toolbar={
        <>
          {(["all", "direct", "dev", "peer", "optional"] as const).map((s) => (
            <Tab key={s} active={scope === s} onClick={() => setScope(s)}>
              [ {s} {String(counts[s]).padStart(2, "0")} ]
            </Tab>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter packages…"
            className="ml-auto w-40 border border-[var(--t-line)] bg-[var(--t-bg)] px-2 py-1 font-mono text-[10px] normal-case text-[var(--t-fg-2)] outline-none focus:border-[var(--t-green)]"
          />
        </>
      }
      footer="Parses package.json · requirements.txt · Cargo.toml · go.mod · pyproject.toml at depth ≤ 3"
    >
      {phase === "SCANNING" && <div className="p-6 text-center text-[var(--t-dim-2)]">&gt; PARSING_MANIFESTS…</div>}
      {phase === "ERROR" && <div className="p-6 text-center text-[var(--t-orange)]">ERR: {err}</div>}

      {phase === "READY" && manifests.length === 0 && (
        <div className="p-8 text-center uppercase tracking-widest text-[var(--t-dim-3)]">&gt; NO_MANIFESTS_FOUND</div>
      )}

      {phase === "READY" && manifests.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="TOTAL DEPS" value={String(counts.all)} tone="var(--t-green)" />
            <Stat label="DIRECT / DEV" value={`${counts.direct} / ${counts.dev}`} tone="var(--t-blue)" />
            <Stat label="PEER / OPT" value={`${counts.peer} / ${counts.optional}`} tone="var(--t-purple)" />
            <Stat label="FLAGGED" value={String(risky.length)} tone={risky.length ? "var(--t-amber)" : "var(--t-dim-2)"} />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 border border-[var(--t-surface-2)] p-2 text-[10px] uppercase tracking-widest">
            <span className="text-[var(--t-dim-2)]">LICENSES</span>
            {licenses.length === 0 && <span className="text-[var(--t-dim-3)]">UNKNOWN</span>}
            {licenses.map(([fam, n]) => (
              <span
                key={fam}
                className="border px-1.5 py-0.5"
                style={{ borderColor: COPYLEFT.has(fam) ? "var(--t-amber)" : "var(--t-line)", color: COPYLEFT.has(fam) ? "var(--t-amber)" : "var(--t-green)" }}
              >
                {fam} ×{n} {COPYLEFT.has(fam) ? "· COPYLEFT" : ""}
              </span>
            ))}
            <span className="ml-auto text-[var(--t-dim-3)]">
              {manifests.map((m) => `/${m.path}`).join(" · ")}
            </span>
          </div>

          <div className="border border-[var(--t-surface-2)]">
            <div className="grid grid-cols-[minmax(0,1fr)_90px_80px_70px] gap-2 border-b border-[var(--t-surface-2)] px-2 py-1.5 text-[9px] uppercase tracking-widest text-[var(--t-dim-3)]">
              <span>PACKAGE</span>
              <span>VERSION</span>
              <span>SCOPE</span>
              <span>ECO</span>
            </div>
            {list.map((d) => (
              <div key={`${d.ecosystem}:${d.scope}:${d.name}`} className="border-b border-[var(--t-surface)] last:border-b-0">
                <div className="grid grid-cols-[minmax(0,1fr)_90px_80px_70px] items-center gap-2 px-2 py-1.5">
                  <span className="truncate font-mono text-[11px] text-[var(--t-fg-2)]">{d.name}</span>
                  <span className="truncate font-mono text-[10px] text-[var(--t-amber)]">{d.range}</span>
                  <span className="text-[9px] uppercase tracking-widest text-[var(--t-dim-2)]">{d.scope}</span>
                  <span className="text-[9px] uppercase tracking-widest text-[var(--t-line)]">{d.ecosystem}</span>
                </div>
                {d.risk && (
                  <div className="px-2 pb-1.5 text-[9px] uppercase tracking-widest text-[var(--t-amber)]">⚠ {d.risk}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </DevModal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="border border-[var(--t-surface-2)] p-2">
      <div className="text-[9px] uppercase tracking-widest text-[var(--t-dim-3)]">{label}</div>
      <div className="text-[16px]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}