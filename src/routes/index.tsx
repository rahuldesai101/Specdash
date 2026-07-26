import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SANDBOX // R&D_SPEC_SYSTEM_v1.0" },
      { name: "description", content: "Raw technical R&D dashboard synced to a GitHub repository." },
      { property: "og:title", content: "SANDBOX // R&D_SPEC_SYSTEM_v1.0" },
      { property: "og:description", content: "Raw technical R&D dashboard synced to a GitHub repository." },
    ],
  }),
  component: Index,
});

const DIRS = ["ideas", "experiments", "research"] as const;
type Dir = (typeof DIRS)[number];

type Entry = {
  path: string;
  name: string;
  type: "IDE" | "EXP" | "RES";
  dir: Dir;
  sha: string;
  size: number;
  kind: "file" | "dir";
  html_url: string;
  download_url: string | null;
  last_modified?: string;
  last_commit?: string;
};

type GhItem = {
  path: string;
  name: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  html_url: string;
  download_url: string | null;
};

const TYPE_MAP: Record<Dir, Entry["type"]> = {
  ideas: "IDE",
  experiments: "EXP",
  research: "RES",
};

const STATUS_FROM_DIR: Record<Dir, string> = {
  ideas: "RAW",
  experiments: "ACTIVE",
  research: "ARCHIVED",
};

async function fetchDir(owner: string, repo: string, path: string): Promise<GhItem[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function walk(owner: string, repo: string, dir: Dir): Promise<Entry[]> {
  const out: Entry[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const p = stack.pop()!;
    const items = await fetchDir(owner, repo, p);
    for (const it of items) {
      if (it.type === "dir") {
        stack.push(it.path);
        out.push({
          path: it.path,
          name: it.name,
          type: TYPE_MAP[dir],
          dir,
          sha: it.sha,
          size: it.size,
          kind: "dir",
          html_url: it.html_url,
          download_url: null,
        });
      } else {
        out.push({
          path: it.path,
          name: it.name,
          type: TYPE_MAP[dir],
          dir,
          sha: it.sha,
          size: it.size,
          kind: "file",
          html_url: it.html_url,
          download_url: it.download_url,
        });
      }
    }
  }
  return out;
}

async function fetchLastCommit(owner: string, repo: string): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) return "----------";
  const data = await res.json();
  return data?.[0]?.sha?.slice(0, 10) ?? "----------";
}

async function fetchFileLastCommit(
  owner: string,
  repo: string,
  path: string,
): Promise<{ date?: string; sha?: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) return {};
  const data = await res.json();
  const c = data?.[0];
  return { date: c?.commit?.committer?.date, sha: c?.sha?.slice(0, 7) };
}

function loadConfig() {
  if (typeof window === "undefined") return { owner: "", repo: "sandbox" };
  try {
    const raw = localStorage.getItem("sandbox.config");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { owner: "", repo: "sandbox" };
}

function Index() {
  const [config, setConfig] = useState<{ owner: string; repo: string }>({
    owner: "",
    repo: "sandbox",
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lastCommit, setLastCommit] = useState<string>("----------");
  const [status, setStatus] = useState<"IDLE" | "SYNCING" | "CONNECTED" | "ERROR">("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    const cfg = loadConfig();
    setConfig(cfg);
    if (!cfg.owner) setSettingsOpen(true);
  }, []);

  const sync = useCallback(async () => {
    if (!config.owner || !config.repo) return;
    setStatus("SYNCING");
    setError(null);
    try {
      const [i, e, r, commit] = await Promise.all([
        walk(config.owner, config.repo, "ideas"),
        walk(config.owner, config.repo, "experiments"),
        walk(config.owner, config.repo, "research"),
        fetchLastCommit(config.owner, config.repo),
      ]);
      const all = [...i, ...e, ...r];
      setEntries(all);
      setLastCommit(commit);
      setStatus("CONNECTED");

      // enrich with per-file last commit (batched, best effort)
      const files = all.filter((x) => x.kind === "file").slice(0, 40);
      const enriched = await Promise.all(
        files.map(async (f) => {
          const c = await fetchFileLastCommit(config.owner, config.repo, f.path);
          return { ...f, last_modified: c.date, last_commit: c.sha };
        }),
      );
      setEntries((prev) =>
        prev.map((p) => enriched.find((e2) => e2.path === p.path) ?? p),
      );
    } catch (err) {
      setStatus("ERROR");
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }, [config.owner, config.repo]);

  useEffect(() => {
    if (!config.owner) return;
    sync();
    const t = setInterval(sync, 30_000);
    return () => clearInterval(t);
  }, [sync, config.owner]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const files = entries.filter((e) => e.kind === "file");
    return {
      total: files.length,
      ideas: files.filter((e) => e.dir === "ideas").length,
      exp: files.filter((e) => e.dir === "experiments").length,
      res: files.filter((e) => e.dir === "research").length,
    };
  }, [entries]);

  const rows = useMemo(
    () =>
      entries
        .filter((e) => e.kind === "file")
        .sort((a, b) => a.path.localeCompare(b.path)),
    [entries],
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <Header
        status={status}
        owner={config.owner}
        repo={config.repo}
        onOpenSettings={() => setSettingsOpen(true)}
        onSync={sync}
        now={now}
      />
      <StatBar
        total={counts.total}
        ideas={counts.ideas}
        exp={counts.exp}
        res={counts.res}
        lastCommit={lastCommit}
      />
      <div className="px-4 py-3 flex items-center justify-between border-b border-hard">
        <div className="text-[11px] uppercase tracking-widest text-[#00ff66]">
          &gt; /spec_table  //  {rows.length} FILES INDEXED
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-3 py-1.5 border border-[#00ff66] text-[#00ff66] text-[11px] uppercase tracking-wider hover:bg-[#00ff66] hover:text-black transition-colors"
        >
          [ + NEW_SANDBOX_ENTRY ]
        </button>
      </div>
      {error && (
        <div className="px-4 py-2 border-b border-hard text-[11px] text-[#ff5500]">
          ERR: {error}
        </div>
      )}
      <SpecTable rows={rows} owner={config.owner} repo={config.repo} />
      <Footer now={now} />

      {settingsOpen && (
        <SettingsDrawer
          config={config}
          onClose={() => setSettingsOpen(false)}
          onSave={(c) => {
            setConfig(c);
            try {
              localStorage.setItem("sandbox.config", JSON.stringify(c));
            } catch {}
            setSettingsOpen(false);
          }}
        />
      )}
      {createOpen && (
        <NewEntryModal
          owner={config.owner}
          repo={config.repo}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function Header({
  status,
  owner,
  repo,
  onOpenSettings,
  onSync,
  now,
}: {
  status: string;
  owner: string;
  repo: string;
  onOpenSettings: () => void;
  onSync: () => void;
  now: string;
}) {
  const dot =
    status === "CONNECTED"
      ? "#00ff66"
      : status === "SYNCING"
        ? "#ffaa00"
        : status === "ERROR"
          ? "#ff5500"
          : "#666";
  return (
    <header className="border-b border-hard">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="text-white text-[13px] font-bold tracking-wider">
            SANDBOX <span className="text-[#333]">//</span>{" "}
            <span className="text-[#00ff66]">R&amp;D_SPEC_SYSTEM_v1.0</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest">
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 animate-pulse"
              style={{ backgroundColor: dot }}
            />
            [ API_STATUS: {status} ]
          </span>
          <span className="text-[#666]">|</span>
          <span className="text-white">
            [ REPO: {owner || "___"}/{repo || "___"} ]
          </span>
          <span className="text-[#666]">|</span>
          <span className="text-[#666]">[ T: {now.slice(11, 19)}Z ]</span>
          <span className="text-[#666]">|</span>
          <button
            onClick={onSync}
            className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]"
          >
            [SYNC]
          </button>
          <button
            onClick={onOpenSettings}
            className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]"
          >
            [CFG]
          </button>
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex-1 border-r border-hard px-4 py-3 last:border-r-0">
      <div className="text-[10px] uppercase tracking-widest text-[#666]">{label}</div>
      <div
        className="text-[22px] font-bold tabular-nums mt-1"
        style={{ color: accent ?? "#ffffff" }}
      >
        {value}
      </div>
    </div>
  );
}

function StatBar({
  total,
  ideas,
  exp,
  res,
  lastCommit,
}: {
  total: number;
  ideas: number;
  exp: number;
  res: number;
  lastCommit: string;
}) {
  return (
    <div className="flex border-b border-hard">
      <Stat label="TOTAL_ENTRIES" value={String(total).padStart(4, "0")} accent="#00ff66" />
      <Stat label="IDEAS_COUNT" value={String(ideas).padStart(4, "0")} />
      <Stat label="ACTIVE_EXP_COUNT" value={String(exp).padStart(4, "0")} accent="#ff5500" />
      <Stat label="RESEARCH_COUNT" value={String(res).padStart(4, "0")} />
      <Stat label="LAST_COMMIT_HASH" value={lastCommit} accent="#00ff66" />
    </div>
  );
}

function SpecTable({
  rows,
  owner,
  repo,
}: {
  rows: Entry[];
  owner: string;
  repo: string;
}) {
  if (!owner) {
    return (
      <div className="px-4 py-16 text-center text-[12px] text-[#666]">
        &gt; NO_REPO_CONFIGURED — open [CFG] to set GitHub username and repo.
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="px-4 py-16 text-center text-[12px] text-[#666]">
        &gt; NO_ENTRIES_FOUND in /ideas, /experiments, /research
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-[#666]">
            <th className="text-left border border-hard px-3 py-2 font-normal">#</th>
            <th className="text-left border border-hard px-3 py-2 font-normal">PATH</th>
            <th className="text-left border border-hard px-3 py-2 font-normal">TYPE</th>
            <th className="text-left border border-hard px-3 py-2 font-normal">STATUS</th>
            <th className="text-left border border-hard px-3 py-2 font-normal">LAST_MODIFIED</th>
            <th className="text-left border border-hard px-3 py-2 font-normal">SHA</th>
            <th className="text-left border border-hard px-3 py-2 font-normal">TARGET_URI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const status = STATUS_FROM_DIR[r.dir];
            const statusColor =
              status === "ACTIVE" ? "#ff5500" : status === "RAW" ? "#00ff66" : "#888";
            const typeColor =
              r.type === "IDE" ? "#00ff66" : r.type === "EXP" ? "#ff5500" : "#ffffff";
            return (
              <tr key={r.path} className="hover:bg-[#0a0a0a]">
                <td className="border border-hard px-3 py-2 text-[#555] tabular-nums">
                  {String(i + 1).padStart(3, "0")}
                </td>
                <td className="border border-hard px-3 py-2 text-white">/{r.path}</td>
                <td className="border border-hard px-3 py-2" style={{ color: typeColor }}>
                  [{r.type}]
                </td>
                <td className="border border-hard px-3 py-2" style={{ color: statusColor }}>
                  {status}
                </td>
                <td className="border border-hard px-3 py-2 text-[#aaa] tabular-nums">
                  {r.last_modified ? r.last_modified.replace("T", " ").slice(0, 19) + "Z" : "----------"}
                </td>
                <td className="border border-hard px-3 py-2 text-[#666] tabular-nums">
                  {(r.last_commit ?? r.sha).slice(0, 7)}
                </td>
                <td className="border border-hard px-3 py-2">
                  <a
                    href={r.html_url || `https://github.com/${owner}/${repo}/blob/main/${r.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00ff66] hover:bg-[#00ff66] hover:text-black px-2 py-0.5 border border-[#00ff66]"
                  >
                    &gt; OPEN_RAW
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SettingsDrawer({
  config,
  onClose,
  onSave,
}: {
  config: { owner: string; repo: string };
  onClose: () => void;
  onSave: (c: { owner: string; repo: string }) => void;
}) {
  const [owner, setOwner] = useState(config.owner);
  const [repo, setRepo] = useState(config.repo || "sandbox");
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/80">
      <div className="w-full max-w-md h-full bg-black border-l border-hard p-6">
        <div className="flex items-center justify-between border-b border-hard pb-3 mb-4">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">
            [ CONFIG_DRAWER ]
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white text-[11px]">
            [X CLOSE]
          </button>
        </div>
        <div className="space-y-4 text-[11px]">
          <Field label="GITHUB_USERNAME">
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value.trim())}
              placeholder="octocat"
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <Field label="REPOSITORY_NAME">
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value.trim())}
              placeholder="sandbox"
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <div className="text-[10px] text-[#666] leading-relaxed border border-hard p-3">
            &gt; UNAUTHENTICATED_MODE — public GitHub REST API only.<br />
            &gt; RATE_LIMIT: 60 req/hr per IP.<br />
            &gt; REQUIRED_DIRS: /ideas, /experiments, /research
          </div>
          <button
            onClick={() => onSave({ owner, repo })}
            className="w-full border border-[#00ff66] text-[#00ff66] py-2 hover:bg-[#00ff66] hover:text-black text-[11px] uppercase tracking-widest"
          >
            [ SAVE_&_SYNC ]
          </button>
        </div>
      </div>
    </div>
  );
}

function NewEntryModal({
  owner,
  repo,
  onClose,
}: {
  owner: string;
  repo: string;
  onClose: () => void;
}) {
  const [dir, setDir] = useState<Dir>("ideas");
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState(
    "# New Entry\n\n> STATUS: RAW\n> DATE: \n\n## Hypothesis\n\n\n## Notes\n",
  );

  const cleanName = (filename || "untitled.md").replace(/^\/+/, "");
  const finalName = cleanName.endsWith(".md") ? cleanName : `${cleanName}.md`;
  const url =
    owner && repo
      ? `https://github.com/${owner}/${repo}/new/main?filename=${encodeURIComponent(
          `${dir}/${finalName}`,
        )}&value=${encodeURIComponent(content)}`
      : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-2xl bg-black border border-hard">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">
            [ + NEW_SANDBOX_ENTRY ]
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white text-[11px]">
            [X CLOSE]
          </button>
        </div>
        <div className="p-4 space-y-4 text-[11px]">
          <div className="grid grid-cols-2 gap-3">
            <Field label="TARGET_DIRECTORY">
              <div className="flex border border-hard">
                {DIRS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDir(d)}
                    className="flex-1 py-2 border-r border-hard last:border-r-0 uppercase tracking-wider"
                    style={{
                      backgroundColor: dir === d ? "#00ff66" : "transparent",
                      color: dir === d ? "#000" : "#fff",
                    }}
                  >
                    /{d}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="FILENAME">
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="01_vector.md"
                className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
              />
            </Field>
          </div>
          <Field label="RAW_MARKDOWN_CONTENT">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66] resize-none text-[11px]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] text-[#666] break-all">
            &gt; TARGET: /{dir}/{finalName}
          </div>
          <a
            href={url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!url}
            onClick={(e) => {
              if (!url) e.preventDefault();
            }}
            className="block text-center border border-[#00ff66] text-[#00ff66] py-2 hover:bg-[#00ff66] hover:text-black uppercase tracking-widest"
          >
            [ COMMIT_VIA_GITHUB_WEB &gt; ]
          </a>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-[#666] mb-1">
        &gt; {label}
      </div>
      {children}
    </label>
  );
}

function Footer({ now }: { now: string }) {
  return (
    <footer className="border-t border-hard px-4 py-2 flex justify-between text-[10px] text-[#555] uppercase tracking-widest">
      <span>&gt; SANDBOX_TERMINAL // BUILD_v1.0.0</span>
      <span>{now}</span>
    </footer>
  );
}
