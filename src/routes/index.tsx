import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";

type Search = { owner?: string; repo?: string };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SANDBOX // GITHUB_DB_INTERFACE_v1.0" },
      {
        name: "description",
        content: "Brutalist developer dashboard that treats a GitHub repository as a database.",
      },
      { property: "og:title", content: "SANDBOX // GITHUB_DB_INTERFACE_v1.0" },
      {
        property: "og:description",
        content: "GitHub-as-a-DB: read via REST tree, write via git commits.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    owner: typeof s.owner === "string" ? s.owner : undefined,
    repo: typeof s.repo === "string" ? s.repo : undefined,
  }),
  component: Index,
});

const COLLECTIONS = ["library/ideas", "library/experiments", "library/research", "docs"] as const;
type Collection = (typeof COLLECTIONS)[number];

const TYPE_MAP: Record<Collection, "IDE" | "EXP" | "RES" | "DOC"> = {
  "library/ideas": "IDE",
  "library/experiments": "EXP",
  "library/research": "RES",
  "docs": "DOC",
};

type Record_ = {
  path: string;
  filename: string;
  ext: string;
  sha: string;
  size: number;
  collection: Collection;
  type: "IDE" | "EXP" | "RES" | "DOC";
  kind: "blob" | "tree";
  commit_sha?: string;
  commit_date?: string;
};

type TreeItem = {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
};

async function fetchTree(owner: string, repo: string, branch: string) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) throw new Error(`TREE_FETCH_${res.status}`);
  return (await res.json()) as { sha: string; tree: TreeItem[]; truncated: boolean };
}

async function fetchDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`REPO_FETCH_${res.status}`);
  const d = await res.json();
  return d.default_branch ?? "main";
}

async function fetchHeadCommit(owner: string, repo: string, branch: string) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) return null;
  return (await res.json()) as {
    sha: string;
    commit: { committer: { date: string } };
  };
}

async function fetchFileCommit(
  owner: string,
  repo: string,
  path: string,
): Promise<{ sha?: string; date?: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) return {};
  const d = await res.json();
  return { sha: d?.[0]?.sha, date: d?.[0]?.commit?.committer?.date };
}

function classify(path: string): Collection | null {
  // Check for library/* paths
  if (path.startsWith("library/")) {
    const seg = path.split("/")[1];
    if (seg === "ideas" || seg === "experiments" || seg === "research") {
      return `library/${seg}` as Collection;
    }
  }
  // Check for docs paths
  if (path.startsWith("docs/")) {
    return "docs";
  }
  return null;
}

function Index() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });

  const owner = search.owner ?? "";
  const repo = search.repo ?? "sandbox";

  const [records, setRecords] = useState<Record_[]>([]);
  const [branch, setBranch] = useState("main");
  const [headCommit, setHeadCommit] = useState<{ sha: string; date: string } | null>(null);
  const [status, setStatus] = useState<"IDLE" | "SYNCING" | "SYNCED" | "ERROR">("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!owner) setCfgOpen(true);
  }, [owner]);

  const sync = useCallback(async () => {
    if (!owner || !repo) return;
    setStatus("SYNCING");
    setError(null);
    try {
      const br = await fetchDefaultBranch(owner, repo);
      setBranch(br);
      const [tree, head] = await Promise.all([
        fetchTree(owner, repo, br),
        fetchHeadCommit(owner, repo, br),
      ]);
      setTruncated(tree.truncated);
      if (head) setHeadCommit({ sha: head.sha, date: head.commit.committer.date });
      const rows: Record_[] = [];
      for (const item of tree.tree) {
        const col = classify(item.path);
        if (!col) continue;
        if (item.path === col) continue; // skip the collection root itself
        const filename = item.path.split("/").pop() ?? item.path;
        const ext = filename.includes(".") ? filename.split(".").pop()! : "";
        rows.push({
          path: item.path,
          filename,
          ext,
          sha: item.sha,
          size: item.size ?? 0,
          collection: col,
          type: TYPE_MAP[col],
          kind: item.type,
        });
      }
      rows.sort((a, b) => a.path.localeCompare(b.path));
      setRecords(rows);
      setStatus("SYNCED");

      // Enrich first N blobs with per-file commit metadata (best-effort, rate-limited)
      const targets = rows.filter((r) => r.kind === "blob").slice(0, 30);
      const enriched = await Promise.all(
        targets.map(async (r) => {
          const c = await fetchFileCommit(owner, repo, r.path);
          return { path: r.path, ...c };
        }),
      );
      setRecords((prev) =>
        prev.map((r) => {
          const e = enriched.find((x) => x.path === r.path);
          return e ? { ...r, commit_sha: e.sha, commit_date: e.date } : r;
        }),
      );
    } catch (e) {
      setStatus("ERROR");
      setError(e instanceof Error ? e.message : "UNKNOWN_ERR");
    }
  }, [owner, repo]);

  useEffect(() => {
    if (!owner) return;
    sync();
    const t = setInterval(sync, 30_000);
    return () => clearInterval(t);
  }, [sync, owner]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const blobs = records.filter((r) => r.kind === "blob");
    return {
      total: blobs.length,
      ideas: blobs.filter((r) => r.collection === "library/ideas").length,
      exp: blobs.filter((r) => r.collection === "library/experiments").length,
      res: blobs.filter((r) => r.collection === "library/research").length,
      docs: blobs.filter((r) => r.collection === "docs").length,
    };
  }, [records]);

  const dot =
    status === "SYNCED"
      ? "#00ff66"
      : status === "SYNCING"
        ? "#ffaa00"
        : status === "ERROR"
          ? "#ff5500"
          : "#666";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* HEADER */}
      <header className="border-b border-hard">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="text-[13px] font-bold tracking-wider">
            SANDBOX <span className="text-[#333]">//</span>{" "}
            <span className="text-[#00ff66]">GITHUB_DB_INTERFACE_v1.0</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 animate-pulse"
                style={{ backgroundColor: dot }}
              />
              [ DB_STATUS: {status} ]
            </span>
            <span className="text-[#333]">|</span>
            <span>[ DB: {owner || "___"}/{repo || "___"}@{branch} ]</span>
            <span className="text-[#333]">|</span>
            <span className="text-[#666]">[ T: {now.slice(11, 19)}Z ]</span>
            <span className="text-[#333]">|</span>
            <button
              onClick={sync}
              className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]"
            >
              [PULL]
            </button>
            <button
              onClick={() => setCfgOpen(true)}
              className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]"
            >
              [CFG]
            </button>
          </div>
        </div>
      </header>

      {/* STATS BAR */}
      <div className="flex border-b border-hard">
        <Stat label="TOTAL_RECORDS" value={counts.total} accent="#00ff66" />
        <Stat label="IDEAS_COUNT" value={counts.ideas} />
        <Stat label="EXP_COUNT" value={counts.exp} accent="#ff5500" />
        <Stat label="RESEARCH_COUNT" value={counts.res} />
        <Stat label="DOCS_COUNT" value={counts.docs} accent="#9966ff" />
        <Stat
          label="HEAD_COMMIT"
          value={headCommit?.sha.slice(0, 10) ?? "----------"}
          accent="#00ff66"
        />
      </div>

      {/* SUB BAR */}
      <div className="flex items-center justify-between border-b border-hard px-4 py-2">
        <div className="text-[11px] uppercase tracking-widest text-[#00ff66]">
          &gt; SELECT * FROM {"{library,docs}"} — {records.filter((r) => r.kind === "blob").length} ROWS
        </div>
        <button
          onClick={() => setWriteOpen(true)}
          className="px-3 py-1.5 border border-[#00ff66] text-[#00ff66] text-[11px] uppercase tracking-wider hover:bg-[#00ff66] hover:text-black"
        >
          [ + WRITE_TO_SANDBOX_DB ]
        </button>
      </div>

      {truncated && (
        <div className="border-b border-hard px-4 py-2 text-[11px] text-[#ff5500]">
          WARN: TREE_TRUNCATED — repository exceeds single-request tree size. Some records omitted.
        </div>
      )}
      {error && (
        <div className="border-b border-hard px-4 py-2 text-[11px] text-[#ff5500]">
          ERR: {error} — verify owner/repo and public API rate limit (60/hr).
        </div>
      )}

      {/* GRID */}
      {!owner ? (
        <div className="px-4 py-16 text-center text-[12px] text-[#666]">
          &gt; NO_DB_CONFIGURED — open [CFG] to bind GITHUB_OWNER/GITHUB_REPO
        </div>
      ) : records.length === 0 && status === "SYNCED" ? (
        <div className="px-4 py-16 text-center text-[12px] text-[#666]">
          &gt; DB_EMPTY — no records in /library or /docs
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-[#666]">
                <Th>#</Th>
                <Th>RECORD_PATH</Th>
                <Th>TYPE</Th>
                <Th>EXT</Th>
                <Th>SIZE_B</Th>
                <Th>COMMIT_SHA</Th>
                <Th>TIMESTAMP</Th>
                <Th>PRIMARY_KEY_LINK</Th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const typeColor =
                  r.type === "IDE"
                    ? "#00ff66"
                    : r.type === "EXP"
                      ? "#ff5500"
                      : r.type === "DOC"
                        ? "#9966ff"
                        : "#ffffff";
                const link =
                  r.kind === "tree"
                    ? `https://github.com/${owner}/${repo}/tree/${branch}/${r.path}`
                    : `https://github.com/${owner}/${repo}/blob/${branch}/${r.path}`;
                return (
                  <tr key={r.path} className="hover:bg-[#0a0a0a]">
                    <Td className="text-[#555] tabular-nums">
                      {String(i + 1).padStart(4, "0")}
                    </Td>
                    <Td className="text-white">
                      /{r.path}
                      {r.kind === "tree" && <span className="text-[#666]">/</span>}
                    </Td>
                    <Td style={{ color: typeColor }}>[{r.type}]</Td>
                    <Td className="text-[#888]">{r.ext || "--"}</Td>
                    <Td className="text-[#888] tabular-nums">
                      {r.kind === "tree" ? "----" : r.size}
                    </Td>
                    <Td className="text-[#666] tabular-nums">
                      {(r.commit_sha ?? r.sha).slice(0, 10)}
                    </Td>
                    <Td className="text-[#aaa] tabular-nums">
                      {r.commit_date
                        ? r.commit_date.replace("T", " ").slice(0, 19) + "Z"
                        : "----------  --------"}
                    </Td>
                    <Td>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#00ff66] hover:bg-[#00ff66] hover:text-black px-2 py-0.5 border border-[#00ff66]"
                      >
                        &gt; FK_OPEN
                      </a>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-hard px-4 py-2 flex justify-between text-[10px] text-[#555] uppercase tracking-widest">
        <span>&gt; GITHUB_DB_INTERFACE // ENGINE: git/trees?recursive=1</span>
        <span>{now}</span>
      </footer>

      {cfgOpen && (
        <CfgDrawer
          owner={owner}
          repo={repo}
          onClose={() => setCfgOpen(false)}
          onSave={(o, r) => {
            navigate({ search: { owner: o, repo: r }, replace: true });
            setCfgOpen(false);
          }}
        />
      )}
      {writeOpen && (
        <WriteModal
          owner={owner}
          repo={repo}
          branch={branch}
          onClose={() => setWriteOpen(false)}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left border border-hard px-3 py-2 font-normal">{children}</th>
  );
}
function Td({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`border border-hard px-3 py-2 ${className}`} style={style}>
      {children}
    </td>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  const v = typeof value === "number" ? String(value).padStart(4, "0") : value;
  return (
    <div className="flex-1 border-r border-hard px-4 py-3 last:border-r-0 min-w-[120px]">
      <div className="text-[10px] uppercase tracking-widest text-[#666]">{label}</div>
      <div
        className="text-[22px] font-bold tabular-nums mt-1"
        style={{ color: accent ?? "#ffffff" }}
      >
        {v}
      </div>
    </div>
  );
}

function CfgDrawer({
  owner,
  repo,
  onClose,
  onSave,
}: {
  owner: string;
  repo: string;
  onClose: () => void;
  onSave: (owner: string, repo: string) => void;
}) {
  const [o, setO] = useState(owner);
  const [r, setR] = useState(repo || "sandbox");
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/80">
      <div className="w-full max-w-md h-full bg-black border-l border-hard p-6">
        <div className="flex items-center justify-between border-b border-hard pb-3 mb-4">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">
            [ DB_CONFIG ]
          </div>
          <button
            onClick={onClose}
            className="text-[#666] hover:text-white text-[11px]"
          >
            [X CLOSE]
          </button>
        </div>
        <div className="space-y-4 text-[11px]">
          <Field label="GITHUB_OWNER">
            <input
              value={o}
              onChange={(e) => setO(e.target.value.trim())}
              placeholder="octocat"
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <Field label="GITHUB_REPO">
            <input
              value={r}
              onChange={(e) => setR(e.target.value.trim())}
              placeholder="sandbox"
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] text-[#666] leading-relaxed">
            &gt; ENGINE: GitHub REST v3<br />
            &gt; READ: /git/trees/{"{branch}"}?recursive=1<br />
            &gt; WRITE: git commits via github.com/new/{"{branch}"}<br />
            &gt; STATE: none — repo IS the database.<br />
            &gt; CONFIG_PERSISTENCE: URL query params only.
          </div>
          <button
            onClick={() => onSave(o, r)}
            className="w-full border border-[#00ff66] text-[#00ff66] py-2 hover:bg-[#00ff66] hover:text-black text-[11px] uppercase tracking-widest"
          >
            [ BIND_&_SYNC ]
          </button>
        </div>
      </div>
    </div>
  );
}

function WriteModal({
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
  const [col, setCol] = useState<Collection>("library/ideas");
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState(
    "# NEW_RECORD\n\n> COLLECTION: \n> DATE: \n\n## PAYLOAD\n\n\n",
  );

  const clean = (filename || "untitled.md").replace(/^\/+/, "");
  const finalName = clean.includes(".") ? clean : `${clean}.md`;
  const canWrite = Boolean(owner && repo);
  const url = canWrite
    ? `https://github.com/${owner}/${repo}/new/${branch}?filename=${encodeURIComponent(
        `${col}/${finalName}`,
      )}&value=${encodeURIComponent(content)}`
    : "";

  const getCollectionLabel = (c: Collection) => {
    if (c === "docs") return "DOCS";
    return c.split("/")[1]?.toUpperCase() || c.toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-2xl bg-black border border-hard">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">
            [ + WRITE_TO_SANDBOX_DB ]
          </div>
          <button
            onClick={onClose}
            className="text-[#666] hover:text-white text-[11px]"
          >
            [X CLOSE]
          </button>
        </div>
        <div className="p-4 space-y-4 text-[11px]">
          <Field label="TARGET_COLLECTION">
            <div className="flex border border-hard flex-wrap">
              {COLLECTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCol(c)}
                  className="flex-1 py-2 border-r border-hard last:border-r-0 uppercase tracking-wider text-xs min-w-[80px]"
                  style={{
                    backgroundColor: col === c ? "#00ff66" : "transparent",
                    color: col === c ? "#000" : "#fff",
                  }}
                >
                  /{getCollectionLabel(c)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="PRIMARY_KEY_FILENAME">
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="rec-001.md"
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <Field label="RAW_PAYLOAD">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66] resize-none text-[11px]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] text-[#666] break-all">
            &gt; INSERT INTO {col} (path, content) VALUES (&apos;/{col}/{finalName}&apos;, &lt;payload&gt;)
          </div>
          <a
            href={url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!canWrite}
            onClick={(e) => {
              if (!canWrite) e.preventDefault();
            }}
            className="block text-center border border-[#00ff66] text-[#00ff66] py-2 hover:bg-[#00ff66] hover:text-black uppercase tracking-widest"
          >
            [ COMMIT_TX &gt; github.com/new/{branch} ]
          </a>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-[#666] mb-1">
        &gt; {label}
      </div>
      {children}
    </label>
  );
}
