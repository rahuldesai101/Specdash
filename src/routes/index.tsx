import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dirOf,
  fetchRaw,
  getPat,
  ghFetch,
  parseRepoInput,
  setPat,
  type CacheStatus,
  type RateLimit,
  type TreeItem,
} from "@/lib/github-db";
import { loadAiConfig, saveAiConfig, type AiConfig } from "@/lib/ai-engine";
import { AiConfigDrawer } from "@/components/ai/AiConfigDrawer";
import { CommandBar } from "@/components/ai/CommandBar";
import { SpecAssistant } from "@/components/ai/SpecAssistant";
import { MarkdownView } from "@/components/md/MarkdownView";
import { NewSpecModal } from "@/components/git/NewSpecModal";
import { editFileIntentUrl } from "@/lib/git-intent";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SANDBOX // GITHUB_DB_INTERFACE_v1.0" },
      {
        name: "description",
        content:
          "Brutalist repo indexer: dynamic markdown tree discovery, PAT auth, ETag caching and raw CDN spec reads.",
      },
      { property: "og:title", content: "SANDBOX // GITHUB_DB_INTERFACE_v1.0" },
      {
        property: "og:description",
        content: "GitHub-as-a-DB indexer with ETag caching and raw CDN pipeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type FileRow = { path: string; name: string; sha: string; size: number; dir: string };

function Index() {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("sandbox");
  const [branch, setBranch] = useState("main");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const [status, setStatus] = useState<"IDLE" | "SYNCING" | "SYNCED" | "ERROR">("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<RateLimit>({ remaining: null, limit: null });
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>("MISS");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [patOpen, setPatOpen] = useState(false);
  const [hasPat, setHasPat] = useState(false);
  const [spec, setSpec] = useState<{ path: string; text: string | null; err?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState("");
  const [aiCfg, setAiCfg] = useState<AiConfig | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [excerpts, setExcerpts] = useState<Record<string, string>>({});

  // hydrate config from localStorage
  useEffect(() => {
    const o = localStorage.getItem("activeOwner") ?? "";
    const r = localStorage.getItem("activeRepo") ?? "sandbox";
    setOwner(o);
    setRepo(r);
    setHasPat(Boolean(getPat()));
    if (!o) setCfgOpen(true);
    setAiCfg(loadAiConfig());
  }, []);

  // global Ctrl+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 1000);
    setNow(new Date().toISOString());
    return () => clearInterval(t);
  }, []);

  const sync = useCallback(async () => {
    if (!owner || !repo) return;
    setStatus("SYNCING");
    setError(null);
    try {
      const meta = await ghFetch<{ default_branch: string }>(`/repos/${owner}/${repo}`);
      const br = meta.data.default_branch || "main";
      setBranch(br);
      const tree = await ghFetch<{ tree: TreeItem[]; truncated: boolean }>(
        `/repos/${owner}/${repo}/git/trees/${br}?recursive=1`,
      );
      setRate(tree.rate.remaining !== null ? tree.rate : meta.rate);
      setCacheStatus(tree.status);
      const rows: FileRow[] = tree.data.tree
        .filter((i) => i.type === "blob" && i.path.toLowerCase().endsWith(".md"))
        .map((i) => ({
          path: i.path,
          name: i.path.split("/").pop() ?? i.path,
          sha: i.sha,
          size: i.size ?? 0,
          dir: dirOf(i.path),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
      setFiles(rows);
      setStatus("SYNCED");
    } catch (e) {
      setStatus("ERROR");
      setError(e instanceof Error ? e.message : "UNKNOWN_ERR");
    }
  }, [owner, repo]);

  useEffect(() => {
    if (owner && repo) sync();
  }, [sync, owner, repo]);

  const groups = useMemo(() => {
    const m = new Map<string, FileRow[]>();
    for (const f of files) {
      const arr = m.get(f.dir) ?? [];
      arr.push(f);
      m.set(f.dir, arr);
    }
    return [...m.entries()].sort((a, b) =>
      a[0] === "root" ? -1 : b[0] === "root" ? 1 : a[0].localeCompare(b[0]),
    );
  }, [files]);

  useEffect(() => {
    if (groups.length && (activeDir === null || !groups.some(([d]) => d === activeDir))) {
      setActiveDir(groups[0][0]);
    }
  }, [groups, activeDir]);

  const rows = groups.find(([d]) => d === activeDir)?.[1] ?? [];

  const dot =
    status === "SYNCED" ? "#00ff66" : status === "SYNCING" ? "#ffaa00" : status === "ERROR" ? "#ff5500" : "#666";

  const ghBlobUrl = (path: string, ref: string) =>
    `https://github.com/${owner}/${repo}/blob/${ref}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const ghTreeUrl = (dir: string) =>
    dir === "root"
      ? `https://github.com/${owner}/${repo}/tree/${branch}`
      : `https://github.com/${owner}/${repo}/tree/${branch}/${dir.split("/").map(encodeURIComponent).join("/")}`;

  const openSpec = async (path: string) => {
    setCmdOpen(false);
    setCopied(false);
    setSpec({ path, text: null });
    try {
      const text = await fetchRaw(owner, repo, branch, path);
      setSpec({ path, text });
      setExcerpts((p) => ({ ...p, [path]: text }));
    } catch (e) {
      setSpec({ path, text: null, err: e instanceof Error ? e.message : "RAW_ERR" });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-hard">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-[13px] font-bold tracking-wider">
            SANDBOX <span className="text-[#333]">//</span>{" "}
            <span className="text-[#00ff66]">GITHUB_DB_INTERFACE_v1.0</span>
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 animate-pulse" style={{ backgroundColor: dot }} />
              [ DB_STATUS: {status} ]
            </span>
            <span className="text-[#333]">|</span>
            <span>[ DB: {owner || "___"}/{repo || "___"}@{branch} ]</span>
            <span className="text-[#333]">|</span>
            <span style={{ color: rate.remaining !== null && rate.remaining < 10 ? "#ff5500" : "#888" }}>
              [ API_QUOTA: {rate.remaining ?? "--"}/{rate.limit ?? "--"} ]
            </span>
            <span className="text-[#333]">|</span>
            <span style={{ color: cacheStatus === "304" ? "#00ff66" : "#666" }}>
              {cacheStatus === "304"
                ? "[ CACHE: 304 NOT_MODIFIED (0 COST) ]"
                : `[ CACHE: ${cacheStatus} ]`}
            </span>
            <span className="text-[#333]">|</span>
            <span className="text-[#666]">[ T: {now.slice(11, 19)}Z ]</span>
            <span style={{ color: aiCfg ? "#00ff66" : "#ff5500" }}>
              {aiCfg ? `[ AI: ACTIVE (${aiCfg.provider.toUpperCase()}) ]` : "[ AI: DISABLED ]"}
            </span>
            <button
              onClick={() => setCmdOpen(true)}
              className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]"
            >
              [SEARCH ⌘/CTRL+K]
            </button>
            <button
              onClick={() => setAiOpen(true)}
              className="border px-2 py-1"
              style={{ borderColor: aiCfg ? "#00ff66" : "#333", color: aiCfg ? "#00ff66" : "#fff" }}
            >
              [AI_CFG]
            </button>
            <button onClick={sync} className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]">
              [PULL]
            </button>
            <button
              onClick={() => setPatOpen(true)}
              className="border px-2 py-1"
              style={{ borderColor: hasPat ? "#00ff66" : "#ff5500", color: hasPat ? "#00ff66" : "#ff5500" }}
            >
              [CONNECT_GITHUB{hasPat ? ": OK" : ""}]
            </button>
            <button onClick={() => setCfgOpen(true)} className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]">
              [CFG]
            </button>
          </div>
        </div>
      </header>

      <div className="flex border-b border-hard">
        <Stat label="MD_RECORDS" value={files.length} accent="#00ff66" />
        <Stat label="DIRECTORIES" value={groups.length} />
        <Stat label="ACTIVE_DIR_ROWS" value={rows.length} accent="#ff5500" />
        <Stat label="BRANCH" value={branch} />
      </div>

      {error && (
        <div className="border-b border-hard px-4 py-2 text-[11px] text-[#ff5500]">
          ERR: {error} — verify owner/repo, or connect a PAT for higher quota / private repos.
        </div>
      )}

      {/* DIR TABS */}
      {groups.length > 0 && (
        <nav className="flex flex-wrap border-b border-hard">
          {groups.map(([dir, list]) => (
            <button
              key={dir}
              onClick={() => setActiveDir(dir)}
              className="px-3 py-2 border-r border-hard text-[11px] uppercase tracking-wider inline-flex items-center gap-2"
              style={{
                backgroundColor: activeDir === dir ? "#00ff66" : "transparent",
                color: activeDir === dir ? "#000" : "#fff",
              }}
            >
              <span>
                📁 /{dir} ({String(list.length).padStart(2, "0")})
              </span>
              {owner && (
                <span
                  role="link"
                  tabIndex={0}
                  title="Open folder in GitHub"
                  aria-label={`Open folder /${dir} in GitHub`}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(ghTreeUrl(dir), "_blank", "noopener,noreferrer");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      window.open(ghTreeUrl(dir), "_blank", "noopener,noreferrer");
                    }
                  }}
                  className="opacity-60 hover:opacity-100 cursor-pointer"
                >
                  ↗
                </span>
              )}
            </button>
          ))}
          {owner && (
            <button
              onClick={() => setNewOpen(true)}
              className="px-3 py-2 border-r border-hard text-[11px] uppercase tracking-wider text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
            >
              + NEW SPEC
            </button>
          )}
        </nav>
      )}

      {!owner ? (
        <div className="px-4 py-16 text-center text-[12px] text-[#666]">
          &gt; NO_DB_CONFIGURED — open [CFG] to bind GITHUB_OWNER/GITHUB_REPO
        </div>
      ) : files.length === 0 && status === "SYNCED" ? (
        <div className="px-4 py-16 text-center text-[12px] text-[#666]">&gt; NO_MARKDOWN_RECORDS_FOUND</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-[#666]">
                <Th>#</Th>
                <Th>FILE_NAME</Th>
                <Th>RELATIVE_PATH</Th>
                <Th>SHA</Th>
                <Th>ACTION</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => (
                <tr key={f.path} className="hover:bg-[#0a0a0a]">
                  <Td className="text-[#555] tabular-nums">{String(i + 1).padStart(4, "0")}</Td>
                  <Td className="text-white">{f.name}</Td>
                  <Td className="text-[#888]">/{f.path}</Td>
                  <Td className="text-[#666] tabular-nums">{f.sha.slice(0, 12)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                    <button
                      onClick={() => openSpec(f.path)}
                      className="text-[#00ff66] border border-[#00ff66] px-2 py-0.5 hover:bg-[#00ff66] hover:text-black"
                    >
                      &gt; OPEN_SPEC
                    </button>
                    <a
                      href={ghBlobUrl(f.path, branch)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open on GitHub"
                      aria-label={`Open ${f.name} on GitHub`}
                      className="border border-[#333] px-2 py-0.5 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
                    >
                      ↗
                    </a>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-hard px-4 py-2 flex justify-between text-[10px] text-[#555] uppercase tracking-widest">
        <span>&gt; ENGINE: git/trees?recursive=1 + ETAG_304 + RAW_CDN</span>
        <span>{now}</span>
      </footer>

      {cfgOpen && (
        <CfgDrawer
          owner={owner}
          repo={repo}
          onClose={() => setCfgOpen(false)}
          onSave={(o, r) => {
            localStorage.setItem("activeOwner", o);
            localStorage.setItem("activeRepo", r);
            setOwner(o);
            setRepo(r);
            setCfgOpen(false);
          }}
        />
      )}

      {patOpen && (
        <PatModal
          onClose={() => setPatOpen(false)}
          onSave={(v) => {
            setPat(v);
            setHasPat(Boolean(v));
            setPatOpen(false);
            sync();
          }}
        />
      )}

      {spec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-5xl h-[92vh] flex flex-col bg-black border border-hard">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hard px-5 py-4">
              <div className="text-[12px] uppercase tracking-widest text-[#00ff66] break-all">
                [ SPEC ] /{spec.path}
              </div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest shrink-0">
                <a
                  href={ghBlobUrl(spec.path, branch)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-[#00ff66] text-[#00ff66] px-3 py-1.5 hover:bg-[#00ff66] hover:text-black"
                >
                  [ VIEW ON GITHUB ↗ ]
                </a>
                <a
                  href={editFileIntentUrl({ owner, repo, branch, path: spec.path })}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Opens GitHub web editor. If you do not have write access, GitHub will automatically create a fork and Pull Request for you."
                  className="border border-[#ff5500] text-[#ff5500] px-3 py-1.5 hover:bg-[#ff5500] hover:text-black"
                >
                  [ EDIT SPEC ↗ ]
                </a>
                <button
                  onClick={async () => {
                    const sha = files.find((f) => f.path === spec.path)?.sha ?? branch;
                    try {
                      await navigator.clipboard.writeText(ghBlobUrl(spec.path, sha));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      /* clipboard blocked */
                    }
                  }}
                  className="border border-[#333] px-3 py-1.5 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
                >
                  {copied ? "[ COPIED ]" : "[ COPY PERMALINK ]"}
                </button>
                <button onClick={() => setSpec(null)} className="px-2 py-1.5 text-[#666] hover:text-white text-[11px]">
                  [X CLOSE]
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-6 py-6 text-[14px] leading-7">
              {spec.err ? (
                <pre className="text-[11px] whitespace-pre-wrap text-[#ff5500]">ERR: {spec.err}</pre>
              ) : spec.text === null ? (
                <pre className="text-[11px] text-[#666]">&gt; LOADING_FROM_RAW_CDN...</pre>
              ) : (
                <MarkdownView
                  source={spec.text}
                  ctx={{
                    owner,
                    repo,
                    branch,
                    currentPath: spec.path,
                    exists: (p) => files.some((f) => f.path === p),
                    onOpen: (p) => openSpec(p),
                  }}
                />
              )}
            </div>
            <SpecAssistant cfg={aiCfg} path={spec.path} text={spec.text} />
          </div>
          <p className="sr-only">
            Opens GitHub web editor. If you do not have write access, GitHub will automatically create a fork and Pull
            Request for you.
          </p>
        </div>
      )}

      {aiOpen && (
        <AiConfigDrawer
          cfg={aiCfg}
          onClose={() => setAiOpen(false)}
          onSave={(c) => {
            saveAiConfig(c);
            setAiCfg(c);
            setAiOpen(false);
          }}
        />
      )}

      {cmdOpen && (
        <>
        <CommandBar
          cfg={aiCfg}
          index={files.map((f) => ({ path: f.path, dir: f.dir, name: f.name, excerpt: excerpts[f.path] }))}
          onClose={() => setCmdOpen(false)}
          onOpen={openSpec}
        />
        </>
      )}

      {newOpen && owner && (
        <NewSpecModal
          owner={owner}
          repo={repo}
          branch={branch}
          folders={groups.length ? groups.map(([d]) => d) : ["root"]}
          activeDir={activeDir}
          onClose={() => setNewOpen(false)}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left border border-hard px-3 py-2 font-normal">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-hard px-3 py-2 ${className}`}>{children}</td>;
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  const v = typeof value === "number" ? String(value).padStart(4, "0") : value;
  return (
    <div className="flex-1 border-r border-hard px-4 py-3 last:border-r-0 min-w-[120px]">
      <div className="text-[10px] uppercase tracking-widest text-[#666]">{label}</div>
      <div className="text-[22px] font-bold tabular-nums mt-1" style={{ color: accent ?? "#ffffff" }}>
        {v}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-[#666] mb-1">&gt; {label}</div>
      {children}
    </label>
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
  const submit = () => {
    const p = parseRepoInput(o);
    onSave(p.owner, (p.repo || parseRepoInput(r).repo || r || "sandbox").trim());
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/80">
      <div className="w-full max-w-md h-full bg-black border-l border-hard p-6">
        <div className="flex items-center justify-between border-b border-hard pb-3 mb-4">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">[ DB_CONFIG ]</div>
          <button onClick={onClose} className="text-[#666] hover:text-white text-[11px]">
            [X CLOSE]
          </button>
        </div>
        <div className="space-y-4 text-[11px]">
          <Field label="GITHUB_OWNER / REPO_URL">
            <input
              value={o}
              onChange={(e) => setO(e.target.value)}
              placeholder="octocat  |  https://github.com/octocat/sandbox"
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <Field label="GITHUB_REPO">
            <input
              value={r}
              onChange={(e) => setR(e.target.value)}
              placeholder="sandbox"
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] text-[#666] leading-relaxed">
            &gt; READ: /git/trees/{"{branch}"}?recursive=1 (filter: blob + .md)<br />
            &gt; CACHE: ETag + If-None-Match, 304 = 0 quota cost<br />
            &gt; FILE_READ: raw.githubusercontent.com (no REST cost)<br />
            &gt; PERSIST: localStorage[activeOwner, activeRepo]
          </div>
          <button
            onClick={submit}
            className="w-full border border-[#00ff66] text-[#00ff66] py-2 hover:bg-[#00ff66] hover:text-black text-[11px] uppercase tracking-widest"
          >
            [ BIND_&_SYNC ]
          </button>
        </div>
      </div>
    </div>
  );
}

function PatModal({ onClose, onSave }: { onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(getPat());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-lg bg-black border border-hard">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">[ CONNECT_GITHUB ]</div>
          <button onClick={onClose} className="text-[#666] hover:text-white text-[11px]">
            [X CLOSE]
          </button>
        </div>
        <div className="p-4 space-y-4 text-[11px]">
          <Field label="GITHUB_PAT">
            <input
              type="password"
              value={v}
              onChange={(e) => setV(e.target.value.trim())}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-black border border-hard px-2 py-2 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] text-[#666] leading-relaxed">
            &gt; SCOPE: `repo` for private repos, none for public<br />
            &gt; STORAGE: localStorage[github_pat] — browser only<br />
            &gt; NEVER transmitted to any backend other than api.github.com
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onSave(v)}
              className="flex-1 border border-[#00ff66] text-[#00ff66] py-2 hover:bg-[#00ff66] hover:text-black uppercase tracking-widest"
            >
              [ AUTHORIZE ]
            </button>
            <button
              onClick={() => onSave("")}
              className="flex-1 border border-[#ff5500] text-[#ff5500] py-2 hover:bg-[#ff5500] hover:text-black uppercase tracking-widest"
            >
              [ REVOKE ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
