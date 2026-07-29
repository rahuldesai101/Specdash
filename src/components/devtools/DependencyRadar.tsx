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
      accent={risky.length ? "#ffaa00" : "#00ff66"}
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
            className="ml-auto w-40 border border-[#333] bg-black px-2 py-1 font-mono text-[10px] normal-case text-[#ccc] outline-none focus:border-[#00ff66]"
          />
        </>
      }
      footer="Parses package.json · requirements.txt · Cargo.toml · go.mod · pyproject.toml at depth ≤ 3"
    >
      {phase === "SCANNING" && <div className="p-6 text-center text-[#666]">&gt; PARSING_MANIFESTS…</div>}
      {phase === "ERROR" && <div className="p-6 text-center text-[#ff5500]">ERR: {err}</div>}

      {phase === "READY" && manifests.length === 0 && (
        <div className="p-8 text-center uppercase tracking-widest text-[#555]">&gt; NO_MANIFESTS_FOUND</div>
      )}

      {phase === "READY" && manifests.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="TOTAL DEPS" value={String(counts.all)} tone="#00ff66" />
            <Stat label="DIRECT / DEV" value={`${counts.direct} / ${counts.dev}`} tone="#66b3ff" />
            <Stat label="PEER / OPT" value={`${counts.peer} / ${counts.optional}`} tone="#c07cff" />
            <Stat label="FLAGGED" value={String(risky.length)} tone={risky.length ? "#ffaa00" : "#666"} />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 border border-[#1a1a1a] p-2 text-[10px] uppercase tracking-widest">
            <span className="text-[#666]">LICENSES</span>
            {licenses.length === 0 && <span className="text-[#555]">UNKNOWN</span>}
            {licenses.map(([fam, n]) => (
              <span
                key={fam}
                className="border px-1.5 py-0.5"
                style={{ borderColor: COPYLEFT.has(fam) ? "#ffaa00" : "#333", color: COPYLEFT.has(fam) ? "#ffaa00" : "#00ff66" }}
              >
                {fam} ×{n} {COPYLEFT.has(fam) ? "· COPYLEFT" : ""}
              </span>
            ))}
            <span className="ml-auto text-[#555]">
              {manifests.map((m) => `/${m.path}`).join(" · ")}
            </span>
          </div>

          <div className="border border-[#1a1a1a]">
            <div className="grid grid-cols-[minmax(0,1fr)_90px_80px_70px] gap-2 border-b border-[#1a1a1a] px-2 py-1.5 text-[9px] uppercase tracking-widest text-[#555]">
              <span>PACKAGE</span>
              <span>VERSION</span>
              <span>SCOPE</span>
              <span>ECO</span>
            </div>
            {list.map((d) => (
              <div key={`${d.ecosystem}:${d.scope}:${d.name}`} className="border-b border-[#121212] last:border-b-0">
                <div className="grid grid-cols-[minmax(0,1fr)_90px_80px_70px] items-center gap-2 px-2 py-1.5">
                  <span className="truncate font-mono text-[11px] text-[#ccc]">{d.name}</span>
                  <span className="truncate font-mono text-[10px] text-[#ffcc66]">{d.range}</span>
                  <span className="text-[9px] uppercase tracking-widest text-[#666]">{d.scope}</span>
                  <span className="text-[9px] uppercase tracking-widest text-[#444]">{d.ecosystem}</span>
                </div>
                {d.risk && (
                  <div className="px-2 pb-1.5 text-[9px] uppercase tracking-widest text-[#ffaa00]">⚠ {d.risk}</div>
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
    <div className="border border-[#1a1a1a] p-2">
      <div className="text-[9px] uppercase tracking-widest text-[#555]">{label}</div>
      <div className="text-[16px]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}