import { useEffect, useMemo, useState } from "react";
import { ghFetch, fetchRaw } from "@/lib/github-db";
import {
  detectDrift,
  extractRules,
  isRuleSource,
  type CommitRecord,
  type DriftFinding,
  type SpecRule,
} from "@/lib/spec-drift";

type Props = {
  owner: string;
  repo: string;
  branch: string;
  ruleFiles: string[];
  onClose: () => void;
  onOpenFile: (path: string) => void;
};

type Phase = "IDLE" | "SCANNING" | "READY" | "ERROR";

export function DriftInspector({ owner, repo, branch, ruleFiles, onClose, onOpenFile }: Props) {
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [err, setErr] = useState<string | null>(null);
  const [rules, setRules] = useState<SpecRule[]>([]);
  const [commits, setCommits] = useState<CommitRecord[]>([]);
  const [tab, setTab] = useState<"drift" | "rules" | "commits">("drift");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!owner || !repo) return;
      setPhase("SCANNING");
      setErr(null);
      try {
        const sources = ruleFiles.filter(isRuleSource).slice(0, 12);
        const collected: SpecRule[] = [];
        for (const p of sources) {
          try {
            const text = await fetchRaw(owner, repo, branch, p);
            collected.push(...extractRules(p, text));
          } catch {
            /* unreadable rule source */
          }
        }
        const list = await ghFetch<Array<{ sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } } }>>(
          `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=15`,
        );
        const detailed: CommitRecord[] = [];
        for (const c of list.data.slice(0, 10)) {
          try {
            const d = await ghFetch<{ files?: Array<{ filename: string }> }>(
              `/repos/${owner}/${repo}/commits/${c.sha}`,
            );
            detailed.push({
              sha: c.sha,
              message: c.commit.message.split("\n")[0],
              author: c.commit.author?.name ?? "unknown",
              date: c.commit.author?.date ?? "",
              url: c.html_url,
              files: (d.data.files ?? []).map((f) => f.filename),
            });
          } catch {
            /* skip commit */
          }
        }
        if (cancelled) return;
        setRules(collected);
        setCommits(detailed);
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
  }, [owner, repo, branch, ruleFiles]);

  const findings: DriftFinding[] = useMemo(() => detectDrift(rules, commits), [rules, commits]);
  const hard = findings.filter((f) => f.rule.severity === "hard").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/85 p-3 pt-[6vh]" onMouseDown={onClose}>
      <div
        className="flex max-h-[86vh] w-full max-w-4xl flex-col border border-hard bg-black"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#ff5500]">[ SPEC_DRIFT_INSPECTOR // ADR_WATCHER ]</div>
          <button onClick={onClose} className="text-[11px] text-[#666] hover:text-white">
            [ESC]
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-hard px-4 py-2 text-[10px] uppercase tracking-widest">
          {(["drift", "rules", "commits"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="border px-2 py-1"
              style={{ borderColor: tab === t ? "#00ff66" : "#333", color: tab === t ? "#00ff66" : "#888" }}
            >
              [ {t} {String(t === "drift" ? findings.length : t === "rules" ? rules.length : commits.length).padStart(2, "0")} ]
            </button>
          ))}
          <span className="ml-auto" style={{ color: phase === "READY" ? (hard ? "#ff5500" : "#00ff66") : "#ffaa00" }}>
            [ {phase === "READY" ? (hard ? `${hard} HARD_VIOLATIONS` : "NO_HARD_DRIFT") : phase} ]
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px]">
          {phase === "SCANNING" && <div className="p-6 text-center text-[#666]">&gt; SCANNING_RULES_AND_COMMITS…</div>}
          {phase === "ERROR" && <div className="p-6 text-center text-[#ff5500]">ERR: {err}</div>}

          {phase === "READY" && tab === "drift" && (
            findings.length === 0 ? (
              <div className="p-8 text-center uppercase tracking-widest text-[#00ff66]">
                &gt; NO_DRIFT_DETECTED across {commits.length} commits / {rules.length} rules
              </div>
            ) : (
              findings.map((f) => (
                <div
                  key={f.id}
                  className="mb-2 border p-3"
                  style={{ borderColor: f.rule.severity === "hard" ? "#ff5500" : "#666" }}
                >
                  <div className="text-[11px]" style={{ color: f.rule.severity === "hard" ? "#ff5500" : "#ffaa00" }}>
                    [ {f.rule.severity === "hard" ? "⚠️ SPEC DRIFT WARNING" : "· ADVISORY"}: File '{f.file}' violates rule
                    in {f.rule.source} ]
                  </div>
                  <div className="mt-2 border-l-2 border-[#333] pl-2 text-[11px] text-[#ccc]">“{f.rule.text}”</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-[#666]">
                    <span>{f.commit.sha.slice(0, 7)}</span>
                    <span className="truncate max-w-[40ch] text-[#888] normal-case">{f.commit.message}</span>
                    <span>{f.commit.author}</span>
                    <span>{f.commit.date.slice(0, 10)}</span>
                    <a href={f.commit.url} target="_blank" rel="noopener noreferrer" className="text-[#00ff66]">
                      ↗ COMMIT
                    </a>
                    <button onClick={() => onOpenFile(f.rule.source)} className="text-[#00ff66]">
                      📄 OPEN_RULE
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {phase === "READY" && tab === "rules" && (
            rules.length === 0 ? (
              <div className="p-8 text-center uppercase tracking-widest text-[#555]">&gt; NO_RULE_SOURCES_FOUND</div>
            ) : (
              rules.map((r) => (
                <div key={r.id} className="mb-1 border border-[#1a1a1a] p-2">
                  <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-widest">
                    <span style={{ color: r.severity === "hard" ? "#ff5500" : "#888" }}>[ {r.severity} ]</span>
                    <span className="truncate text-[#555]">/{r.source}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-[#ccc]">{r.text}</div>
                  {r.topics.length > 0 && (
                    <div className="mt-1 text-[9px] uppercase tracking-widest text-[#444]">§ {r.topics.join(" · ")}</div>
                  )}
                </div>
              ))
            )
          )}

          {phase === "READY" && tab === "commits" && (
            commits.map((c) => (
              <div key={c.sha} className="mb-1 border border-[#1a1a1a] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-white">{c.message}</span>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#00ff66]">
                    {c.sha.slice(0, 7)} ↗
                  </a>
                </div>
                <div className="text-[10px] text-[#555]">
                  {c.author} · {c.date.slice(0, 10)} · {c.files.length} files
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-hard px-4 py-2 text-[9px] uppercase tracking-widest text-[#555]">
          SOURCES: AGENTS.md · constitution.md · /docs/adr/*.md · last 10 commits
        </div>
      </div>
    </div>
  );
}