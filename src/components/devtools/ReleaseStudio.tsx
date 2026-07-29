import { useEffect, useMemo, useState } from "react";
import { ghFetch } from "@/lib/github-db";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  buildReleaseMarkdown,
  classify,
  cleanSubject,
  groupCommits,
  suggestVersion,
  type Commit,
} from "@/lib/release-notes";
import { DevModal, Tab, inputCls } from "./Shell";
import { toast } from "sonner";

type Phase = "LOADING" | "READY" | "ERROR";

type ApiCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
  author: { login: string } | null;
};

export function ReleaseStudio({
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
  const [phase, setPhase] = useState<Phase>("LOADING");
  const [err, setErr] = useState<string | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [prevTag, setPrevTag] = useState<string | null>(null);
  const [version, setVersion] = useState("v0.1.0");
  const [count, setCount] = useState(30);
  const [includeSha, setIncludeSha] = useState(true);
  const [includeAuthors, setIncludeAuthors] = useState(false);
  const [tab, setTab] = useState<"grouped" | "markdown">("grouped");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setPhase("LOADING");
      setErr(null);
      try {
        let tag: string | null = null;
        try {
          const tags = await ghFetch<Array<{ name: string }>>(`/repos/${owner}/${repo}/tags?per_page=1`);
          tag = tags.data[0]?.name ?? null;
        } catch {
          /* no tags */
        }
        const list = await ghFetch<ApiCommit[]>(
          `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${count}`,
        );
        if (cancelled) return;
        const mapped: Commit[] = list.data.map((c) => {
          const [head, ...rest] = c.commit.message.split("\n");
          return {
            sha: c.sha,
            message: head,
            body: rest.join("\n"),
            author: c.author?.login ?? c.commit.author?.name ?? "unknown",
            date: c.commit.author?.date ?? "",
            url: c.html_url,
          };
        });
        setPrevTag(tag);
        setCommits(mapped);
        setVersion(suggestVersion(tag, mapped));
        setPhase("READY");
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "COMMITS_ERR");
        setPhase("ERROR");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, count]);

  const selected = useMemo(() => commits.filter((c) => !excluded.has(c.sha)), [commits, excluded]);
  const grouped = useMemo(() => groupCommits(selected), [selected]);
  const today = new Date().toISOString().slice(0, 10);
  const compareUrl = prevTag
    ? `https://github.com/${owner}/${repo}/compare/${prevTag}...${branch}`
    : undefined;

  const markdown = useMemo(
    () =>
      buildReleaseMarkdown({
        repo: `${owner}/${repo}`,
        version,
        date: today,
        commits: selected,
        includeSha,
        includeAuthors,
        compareUrl,
      }),
    [owner, repo, version, today, selected, includeSha, includeAuthors, compareUrl],
  );

  const toggle = (sha: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(sha) ? next.delete(sha) : next.add(sha);
      return next;
    });

  return (
    <DevModal
      title="RELEASE_NOTES_STUDIO // CHANGELOG_COMPILER"
      accent="var(--t-purple)"
      onClose={onClose}
      wide
      toolbar={
        <>
          <Tab active={tab === "grouped"} onClick={() => setTab("grouped")}>
            [ GROUPED {String(selected.length).padStart(2, "0")} ]
          </Tab>
          <Tab active={tab === "markdown"} onClick={() => setTab("markdown")}>
            [ MARKDOWN ]
          </Tab>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="w-24 border border-[var(--t-line)] bg-[var(--t-bg)] px-2 py-1 text-[10px] text-[var(--t-purple)] outline-none focus:border-[var(--t-purple)]"
          />
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="border border-[var(--t-line)] bg-[var(--t-bg)] px-2 py-1 text-[10px] text-[var(--t-dim)] outline-none"
          >
            {[15, 30, 50, 100].map((n) => (
              <option key={n} value={n}>
                LAST {n}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[9px] text-[var(--t-dim)]">
            <input type="checkbox" checked={includeSha} onChange={(e) => setIncludeSha(e.target.checked)} /> SHA
          </label>
          <label className="flex items-center gap-1 text-[9px] text-[var(--t-dim)]">
            <input type="checkbox" checked={includeAuthors} onChange={(e) => setIncludeAuthors(e.target.checked)} /> AUTHORS
          </label>
          <button
            onClick={() =>
              navigator.clipboard
                .writeText(markdown)
                .then(() => toast.success("RELEASE_MARKDOWN_COPIED"))
                .catch(() => toast.error("CLIPBOARD_BLOCKED"))
            }
            className="ml-auto border border-[var(--t-green)] px-2 py-1 text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
          >
            📋 COPY RELEASE MD
          </button>
          <a
            href={`https://github.com/${owner}/${repo}/releases/new?tag=${encodeURIComponent(version)}&title=${encodeURIComponent(version)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim)] hover:border-[var(--t-purple)] hover:text-[var(--t-purple)]"
          >
            🐙 DRAFT RELEASE
          </a>
        </>
      }
      footer={`BASE: ${prevTag ?? "no previous tag"} · HEAD: ${branch} · commits classified by conventional-commit prefixes`}
    >
      {phase === "LOADING" && <div className="p-6 text-center text-[var(--t-dim-2)]">&gt; FETCHING_COMMIT_HISTORY…</div>}
      {phase === "ERROR" && <div className="p-6 text-center text-[var(--t-orange)]">ERR: {err}</div>}

      {phase === "READY" && tab === "grouped" && (
        <>
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped.get(cat);
            if (!items?.length) return null;
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat} className="mb-3 border border-[var(--t-surface-2)]">
                <div
                  className="border-b border-[var(--t-surface-2)] px-2 py-1.5 text-[10px] uppercase tracking-widest"
                  style={{ color: meta.tone }}
                >
                  {meta.icon} {meta.title} · {items.length}
                </div>
                {items.map((c) => (
                  <div key={c.sha} className="flex items-start gap-2 border-b border-[var(--t-surface)] px-2 py-1.5 last:border-b-0">
                    <button
                      onClick={() => toggle(c.sha)}
                      title="Exclude from release notes"
                      className="mt-0.5 shrink-0 border border-[var(--t-line)] px-1 text-[9px] text-[var(--t-dim-2)] hover:border-[var(--t-orange)] hover:text-[var(--t-orange)]"
                    >
                      ✕
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-[var(--t-fg-2)]">{cleanSubject(c.message)}</div>
                      <div className="text-[9px] uppercase tracking-widest text-[var(--t-dim-3)]">
                        {c.author} · {c.date.slice(0, 10)}
                      </div>
                    </div>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[10px] text-[var(--t-green)]"
                    >
                      {c.sha.slice(0, 7)} ↗
                    </a>
                  </div>
                ))}
              </div>
            );
          })}
          {excluded.size > 0 && (
            <div className="border border-[var(--t-surface-2)] p-2 text-[10px] uppercase tracking-widest text-[var(--t-dim-3)]">
              {excluded.size} commit(s) excluded ·{" "}
              <button onClick={() => setExcluded(new Set())} className="text-[var(--t-green)]">
                RESTORE ALL
              </button>
            </div>
          )}
        </>
      )}

      {phase === "READY" && tab === "markdown" && (
        <textarea
          readOnly
          value={markdown}
          rows={24}
          className={`${inputCls} resize-y leading-relaxed`}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </DevModal>
  );
}

export { classify };