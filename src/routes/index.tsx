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
import { SpecToc } from "@/components/layout/SpecToc";
import { ShortcutsModal } from "@/components/layout/ShortcutsModal";
import { editFileIntentUrl } from "@/lib/git-intent";
import { toast } from "sonner";

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

const fmtSize = (b: number) => (b < 1024 ? `${b} B` : `${Math.round(b / 1024)} KB`);
const readTime = (b: number) => `${Math.max(1, Math.round(b / 5 / 200))} min read`;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

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
  // layout
  const [railOpen, setRailOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [readerOpen, setReaderOpen] = useState(true);
  const [keysOpen, setKeysOpen] = useState(false);

  useEffect(() => {
    const o = localStorage.getItem("activeOwner") ?? "";
    const r = localStorage.getItem("activeRepo") ?? "sandbox";
    setOwner(o);
    setRepo(r);
    setHasPat(Boolean(getPat()));
    if (!o) setCfgOpen(true);
    setAiCfg(loadAiConfig());
  }, []);

  // global keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
        return;
      }
      if (mod && e.key === "/") {
        e.preventDefault();
        setKeysOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setKeysOpen(false);
        setCmdOpen(false);
        setAiOpen(false);
        setPatOpen(false);
        setNewOpen(false);
        setMobileNav(false);
        setSpec(null);
        return;
      }
      if (typing || mod || e.altKey) return;
      if (e.key === "[") {
        e.preventDefault();
        setRailOpen((v) => !v);
      }
      if (e.key === "]") {
        e.preventDefault();
        setReaderOpen((v) => !v);
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
      const rowsAll: FileRow[] = tree.data.tree
        .filter((i) => i.type === "blob" && i.path.toLowerCase().endsWith(".md"))
        .map((i) => ({
          path: i.path,
          name: i.path.split("/").pop() ?? i.path,
          sha: i.sha,
          size: i.size ?? 0,
          dir: dirOf(i.path),
        }))
        .sort((a, b) => a.path.localeCompare(b.path));
      setFiles(rowsAll);
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
  const agentsFile = files.find((f) => /^(agents\.md|llms\.txt)$/i.test(f.name));

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
    setMobileNav(false);
    setCopied(false);
    setReaderOpen(true);
    setSpec({ path, text: null });
    try {
      const text = await fetchRaw(owner, repo, branch, path);
      setSpec({ path, text });
      setExcerpts((p) => ({ ...p, [path]: text }));
    } catch (e) {
      setSpec({ path, text: null, err: e instanceof Error ? e.message : "RAW_ERR" });
    }
  };

  const copy = async (value: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(msg);
    } catch {
      toast.error("CLIPBOARD_BLOCKED");
    }
  };

  const btn =
    "min-h-11 sm:min-h-9 inline-flex items-center justify-center border border-[#333] px-3 text-[10px] uppercase tracking-widest hover:border-[#00ff66] hover:text-[#00ff66]";

  const rail = (
    <div className="flex h-full flex-col text-[11px]">
      <div className="border-b border-hard px-3 py-3">
        <div className="text-[10px] uppercase tracking-widest text-[#666] mb-2">[ REPOSITORY ]</div>
        <button
          onClick={() => setCfgOpen(true)}
          className="w-full min-h-11 border border-hard px-2 text-left text-[11px] text-[#00ff66] hover:border-[#00ff66] break-all"
        >
          {owner || "___"}/{repo || "___"}
          <div className="text-[10px] text-[#666]">@{branch} · [CHANGE]</div>
        </button>
        {agentsFile && (
          <button
            onClick={() => openSpec(agentsFile.path)}
            className="mt-2 w-full min-h-11 border border-[#ff5500] px-2 text-left text-[10px] uppercase tracking-widest text-[#ff5500] hover:bg-[#ff5500] hover:text-black"
          >
            ⚑ {agentsFile.name}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 pb-2 text-[10px] uppercase tracking-widest text-[#666]">
          [ DIRECTORIES: {String(groups.length).padStart(2, "0")} ]
        </div>
        {groups.map(([dir, list]) => (
          <div
            key={dir}
            className="flex items-stretch"
            style={{ backgroundColor: activeDir === dir ? "#00ff66" : "transparent" }}
          >
            <button
              onClick={() => {
                setActiveDir(dir);
                setMobileNav(false);
              }}
              className="flex-1 min-w-0 min-h-11 px-3 text-left text-[11px] uppercase tracking-wider truncate"
              style={{ color: activeDir === dir ? "#000" : "#fff" }}
            >
              📁 /{dir} ({String(list.length).padStart(2, "0")})
            </button>
            {owner && (
              <a
                href={ghTreeUrl(dir)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open folder in GitHub"
                aria-label={`Open folder /${dir} in GitHub`}
                className="min-h-11 min-w-11 grid place-items-center opacity-60 hover:opacity-100"
                style={{ color: activeDir === dir ? "#000" : "#888" }}
              >
                ↗
              </a>
            )}
          </div>
        ))}
        {owner && (
          <button
            onClick={() => {
              setNewOpen(true);
              setMobileNav(false);
            }}
            className="mt-2 mx-3 min-h-11 w-[calc(100%-1.5rem)] border border-[#00ff66] px-2 text-[10px] uppercase tracking-widest text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
          >
            + NEW SPEC
          </button>
        )}
      </div>

      <div className="border-t border-hard px-3 py-3 space-y-1 text-[10px] uppercase tracking-widest">
        <div style={{ color: rate.remaining !== null && rate.remaining < 10 ? "#ff5500" : "#888" }}>
          [ API_QUOTA: {rate.remaining ?? "--"}/{rate.limit ?? "--"} ]
        </div>
        <div style={{ color: cacheStatus === "304" ? "#00ff66" : "#666" }}>[ CACHE: {cacheStatus} ]</div>
        <div className="text-[#555]">[ T: {now.slice(11, 19)}Z ]</div>
        <button onClick={sync} className={`${btn} w-full mt-2`}>
          [ PULL ]
        </button>
      </div>
    </div>
  );

  const reader = spec && (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <div className="sticky top-0 z-10 border-b border-hard bg-black px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <button
              onClick={() => setSpec(null)}
              className="lg:hidden min-h-11 min-w-11 border border-hard px-2 text-[11px] text-[#888] hover:text-[#00ff66]"
              aria-label="Back to list"
            >
              ←
            </button>
            <div className="min-w-0">
              <div className="truncate text-[12px] uppercase tracking-widest text-[#00ff66]">/{spec.path}</div>
              <div className="text-[10px] uppercase tracking-widest text-[#555]">
                {spec.text ? `${words(spec.text)} words · ${readTime(spec.text.length)}` : "loading…"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
            <a
              href={ghBlobUrl(spec.path, branch)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 sm:min-h-9 inline-flex items-center border border-[#00ff66] px-3 text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
            >
              ↗ GITHUB
            </a>
            <a
              href={editFileIntentUrl({ owner, repo, branch, path: spec.path })}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens GitHub web editor. Without write access GitHub creates a fork and Pull Request for you."
              className="min-h-11 sm:min-h-9 inline-flex items-center border border-[#ff5500] px-3 text-[#ff5500] hover:bg-[#ff5500] hover:text-black"
            >
              ✏️ EDIT
            </a>
            <button
              onClick={() => spec.text && copy(spec.text, "RAW_MARKDOWN_COPIED")}
              className={btn}
            >
              📋 RAW
            </button>
            <button
              onClick={() => {
                const sha = files.find((f) => f.path === spec.path)?.sha ?? branch;
                copy(ghBlobUrl(spec.path, sha), "PERMALINK_COPIED").then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className={btn}
            >
              {copied ? "[ COPIED ]" : "🔗 PERMALINK"}
            </button>
            <button
              onClick={() => setSpec(null)}
              className="hidden lg:inline-flex min-h-9 items-center px-2 text-[11px] text-[#666] hover:text-white"
            >
              [X]
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 text-[14px] leading-7">
          {spec.err ? (
            <pre className="whitespace-pre-wrap text-[11px] text-[#ff5500]">ERR: {spec.err}</pre>
          ) : spec.text === null ? (
            <pre className="text-[11px] text-[#666]">&gt; LOADING_FROM_RAW_CDN...</pre>
          ) : (
            <>
              <details className="mb-4 border border-hard p-3 xl:hidden">
                <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-[#666]">
                  [ TABLE_OF_CONTENTS ]
                </summary>
                <div className="mt-3">
                  <SpecToc source={spec.text} />
                </div>
              </details>
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
            </>
          )}
        </div>
        {spec.text && (
          <aside className="hidden xl:block w-56 shrink-0 overflow-y-auto border-l border-hard px-3 py-5">
            <SpecToc source={spec.text} />
          </aside>
        )}
      </div>

      <SpecAssistant cfg={aiCfg} path={spec.path} text={spec.text} />
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* TOP BAR */}
      <header className="sticky top-0 z-30 border-b border-hard bg-black">
        <div className="mx-auto w-full max-w-[2200px] px-3 py-2 sm:px-4 sm:py-3 2xl:px-10">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setMobileNav(true)}
                aria-label="Open navigation"
                className="lg:hidden min-h-11 min-w-11 grid place-items-center border border-hard text-[#00ff66]"
              >
                ☰
              </button>
              <button
                onClick={() => setRailOpen((v) => !v)}
                aria-label="Toggle left rail"
                title="Toggle left rail  [  ]"
                className="hidden lg:grid min-h-9 min-w-9 place-items-center border border-hard text-[#666] hover:text-[#00ff66]"
              >
                {railOpen ? "◧" : "▢"}
              </button>
              <h1 className="truncate text-[12px] font-bold tracking-wider sm:text-[13px]">
                SANDBOX <span className="text-[#333]">//</span>{" "}
                <span className="text-[#00ff66]">GITHUB_DB_INTERFACE_v1.0</span>
              </h1>
              <span className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#888]">
                <span className="inline-block h-2 w-2 shrink-0 animate-pulse" style={{ backgroundColor: dot }} />
                {status}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-widest">
              <button onClick={() => setCmdOpen(true)} className={btn} title="Search (Ctrl+K)">
                🔍<span className="hidden md:inline ml-1">SEARCH ⌘K</span>
              </button>
              <button
                onClick={() => setNewOpen(true)}
                disabled={!owner}
                className={`${btn} border-[#00ff66] text-[#00ff66] disabled:opacity-40`}
                title="New spec"
              >
                +<span className="hidden md:inline ml-1">NEW SPEC</span>
              </button>
              <button
                onClick={() => setAiOpen(true)}
                className={btn}
                style={{ borderColor: aiCfg ? "#00ff66" : "#333", color: aiCfg ? "#00ff66" : "#fff" }}
                title={aiCfg ? `AI ACTIVE (${aiCfg.provider})` : "AI disabled"}
              >
                ⚡<span className="hidden md:inline ml-1">{aiCfg ? aiCfg.provider.toUpperCase() : "AI CFG"}</span>
              </button>
              <button
                onClick={() => setPatOpen(true)}
                className={btn}
                style={{ borderColor: hasPat ? "#00ff66" : "#ff5500", color: hasPat ? "#00ff66" : "#ff5500" }}
                title={hasPat ? "PAT connected" : "No PAT"}
              >
                {hasPat ? "🟢" : "🔴"}
                <span className="hidden md:inline ml-1">PAT</span>
              </button>
              <button onClick={() => setKeysOpen(true)} className={`${btn} hidden lg:inline-flex`} title="Shortcuts (Ctrl+/)">
                ⌨
              </button>
            </div>
          </div>

          {/* BREADCRUMBS */}
          <nav aria-label="Breadcrumb" className="mt-2 flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-widest">
            <Crumb label={owner || "___"} onClick={() => setCfgOpen(true)} />
            <span className="text-[#333]">/</span>
            <Crumb label={repo || "___"} onClick={() => setCfgOpen(true)} />
            {activeDir && (
              <>
                <span className="text-[#333]">/</span>
                <Crumb label={`📁 ${activeDir}`} onClick={() => setSpec(null)} />
              </>
            )}
            {spec && (
              <>
                <span className="text-[#333]">/</span>
                <span className="max-w-[45vw] truncate text-[#00ff66]">📄 {spec.path.split("/").pop()}</span>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* WORKSPACE */}
      <div className="mx-auto flex w-full max-w-[2200px] flex-1 min-h-0 2xl:px-10">
        {/* LEFT RAIL */}
        {railOpen && (
          <aside className="hidden lg:block w-60 shrink-0 border-r border-hard">
            <div className="sticky top-[89px] h-[calc(100vh-89px)]">{rail}</div>
          </aside>
        )}

        {/* CENTER */}
        <main className={`min-w-0 flex-1 ${spec ? "hidden lg:block" : "block"}`}>
          <div className="grid grid-cols-2 border-b border-hard sm:grid-cols-4">
            <Stat label="MD_RECORDS" value={files.length} accent="#00ff66" />
            <Stat label="DIRECTORIES" value={groups.length} />
            <Stat label="ACTIVE_ROWS" value={rows.length} accent="#ff5500" />
            <Stat label="BRANCH" value={branch} />
          </div>

          {error && (
            <div className="border-b border-hard px-4 py-2 text-[11px] text-[#ff5500]">
              ERR: {error} — verify owner/repo, or connect a PAT for higher quota / private repos.
            </div>
          )}

          {!owner ? (
            <div className="px-4 py-16 text-center text-[12px] text-[#666]">
              &gt; NO_DB_CONFIGURED — open [CFG] to bind GITHUB_OWNER/GITHUB_REPO
            </div>
          ) : files.length === 0 && status === "SYNCED" ? (
            <div className="px-4 py-16 text-center text-[12px] text-[#666]">&gt; NO_MARKDOWN_RECORDS_FOUND</div>
          ) : (
            <>
              {/* MOBILE CARDS */}
              <ul className="divide-y divide-[#1a1a1a] sm:hidden">
                {rows.map((f) => (
                  <li key={f.path} className="px-3 py-3">
                    <div className="truncate text-[13px] text-white">{f.name}</div>
                    <div className="truncate text-[11px] text-[#888]">/{f.path}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-[#555]">
                      <span className="border border-hard px-2 py-0.5">{fmtSize(f.size)}</span>
                      <span className="border border-hard px-2 py-0.5">{readTime(f.size)}</span>
                      <span className="border border-hard px-2 py-0.5">{f.sha.slice(0, 7)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => openSpec(f.path)}
                        className="min-h-11 flex-1 border border-[#00ff66] px-3 text-[11px] text-[#00ff66]"
                      >
                        📄 VIEW
                      </button>
                      <a
                        href={editFileIntentUrl({ owner, repo, branch, path: f.path })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-11 min-w-11 grid place-items-center border border-[#333] px-3 text-[11px] text-[#888]"
                        aria-label={`Edit ${f.name} on GitHub`}
                      >
                        ✏️
                      </a>
                      <button
                        onClick={() => copy(ghBlobUrl(f.path, branch), "LINK_COPIED")}
                        className="min-h-11 min-w-11 grid place-items-center border border-[#333] px-3 text-[11px] text-[#888]"
                        aria-label={`Copy link to ${f.name}`}
                      >
                        📋
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {/* TABLE */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-[11px] 2xl:text-[13px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-[#666]">
                      <Th>#</Th>
                      <Th>FILE_NAME</Th>
                      <Th>RELATIVE_PATH</Th>
                      <Th>SIZE</Th>
                      <Th>READ</Th>
                      <Th>SHA</Th>
                      <Th>ACTIONS</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f, i) => (
                      <tr
                        key={f.path}
                        className="group hover:bg-[#0a0a0a]"
                        style={{ outline: spec?.path === f.path ? "1px solid #00ff66" : undefined }}
                      >
                        <Td className="text-[#555] tabular-nums">{String(i + 1).padStart(4, "0")}</Td>
                        <Td className="text-white">{f.name}</Td>
                        <Td className="text-[#888]">/{f.path}</Td>
                        <Td className="tabular-nums text-[#666]">{fmtSize(f.size)}</Td>
                        <Td className="text-[#666]">{readTime(f.size)}</Td>
                        <Td className="tabular-nums text-[#666]">{f.sha.slice(0, 10)}</Td>
                        <Td>
                          <div className="flex items-center gap-2 opacity-70 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => openSpec(f.path)}
                              className="border border-[#00ff66] px-2 py-1 text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
                            >
                              📄 VIEW
                            </button>
                            <a
                              href={editFileIntentUrl({ owner, repo, branch, path: f.path })}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Edit on GitHub"
                              aria-label={`Edit ${f.name} on GitHub`}
                              className="border border-[#333] px-2 py-1 text-[#888] hover:border-[#ff5500] hover:text-[#ff5500]"
                            >
                              ✏️↗
                            </a>
                            <button
                              onClick={() => copy(ghBlobUrl(f.path, branch), "LINK_COPIED")}
                              title="Copy link"
                              aria-label={`Copy link to ${f.name}`}
                              className="border border-[#333] px-2 py-1 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
                            >
                              📋
                            </button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <footer className="flex flex-wrap justify-between gap-2 border-t border-hard px-4 py-2 text-[10px] uppercase tracking-widest text-[#555]">
            <span>&gt; ENGINE: git/trees?recursive=1 + ETAG_304 + RAW_CDN</span>
            <span className="hidden sm:inline">{now}</span>
          </footer>
        </main>

      </div>

      {/* SPEC READER OVERLAY */}
      {spec && readerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 sm:p-4">
          <div className="h-full w-full border-hard bg-black sm:h-[92vh] sm:max-w-5xl sm:border 2xl:max-w-6xl">
            {reader}
          </div>
        </div>
      )}

      {/* MOBILE NAV DRAWER */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
            className="absolute inset-0 bg-black/80"
          />
          <div className="absolute inset-y-0 left-0 w-[82vw] max-w-[300px] border-r border-hard bg-black">
            <div className="flex items-center justify-between border-b border-hard px-3 py-2">
              <span className="text-[11px] uppercase tracking-widest text-[#00ff66]">[ NAVIGATION ]</span>
              <button onClick={() => setMobileNav(false)} className="min-h-11 min-w-11 text-[#666]">
                [X]
              </button>
            </div>
            <div className="h-[calc(100%-45px)]">{rail}</div>
          </div>
        </div>
      )}

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

      {keysOpen && <ShortcutsModal onClose={() => setKeysOpen(false)} />}

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
        <CommandBar
          cfg={aiCfg}
          index={files.map((f) => ({ path: f.path, dir: f.dir, name: f.name, excerpt: excerpts[f.path] }))}
          onClose={() => setCmdOpen(false)}
          onOpen={openSpec}
        />
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

function Crumb({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="max-w-[35vw] truncate border border-hard px-2 py-1 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
    >
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border border-hard px-3 py-2 text-left font-normal">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-hard px-3 py-2 ${className}`}>{children}</td>;
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  const v = typeof value === "number" ? String(value).padStart(4, "0") : value;
  return (
    <div className="border-b border-r border-hard px-4 py-3 last:border-r-0 sm:border-b-0">
      <div className="text-[10px] uppercase tracking-widest text-[#666]">{label}</div>
      <div className="mt-1 text-[20px] font-bold tabular-nums 2xl:text-[26px]" style={{ color: accent ?? "#ffffff" }}>
        {v}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-[#666]">&gt; {label}</div>
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
    <div className="fixed inset-0 z-[60] flex items-start justify-end bg-black/80">
      <div className="h-full w-full max-w-md border-l border-hard bg-black p-6">
        <div className="mb-4 flex items-center justify-between border-b border-hard pb-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">[ DB_CONFIG ]</div>
          <button onClick={onClose} className="min-h-11 px-2 text-[11px] text-[#666] hover:text-white">
            [X CLOSE]
          </button>
        </div>
        <div className="space-y-4 text-[11px]">
          <Field label="GITHUB_OWNER / REPO_URL">
            <input
              value={o}
              onChange={(e) => setO(e.target.value)}
              placeholder="octocat  |  https://github.com/octocat/sandbox"
              className="w-full border border-hard bg-black px-2 py-3 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <Field label="GITHUB_REPO">
            <input
              value={r}
              onChange={(e) => setR(e.target.value)}
              placeholder="sandbox"
              className="w-full border border-hard bg-black px-2 py-3 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] leading-relaxed text-[#666]">
            &gt; READ: /git/trees/{"{branch}"}?recursive=1 (filter: blob + .md)<br />
            &gt; CACHE: ETag + If-None-Match, 304 = 0 quota cost<br />
            &gt; FILE_READ: raw.githubusercontent.com (no REST cost)<br />
            &gt; PERSIST: localStorage[activeOwner, activeRepo]
          </div>
          <button
            onClick={submit}
            className="min-h-11 w-full border border-[#00ff66] py-2 text-[11px] uppercase tracking-widest text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-lg border border-hard bg-black">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">[ CONNECT_GITHUB ]</div>
          <button onClick={onClose} className="min-h-11 px-2 text-[11px] text-[#666] hover:text-white">
            [X CLOSE]
          </button>
        </div>
        <div className="space-y-4 p-4 text-[11px]">
          <Field label="GITHUB_PAT">
            <input
              type="password"
              value={v}
              onChange={(e) => setV(e.target.value.trim())}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full border border-hard bg-black px-2 py-3 text-white outline-none focus:border-[#00ff66]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] leading-relaxed text-[#666]">
            &gt; SCOPE: `repo` for private repos, none for public<br />
            &gt; STORAGE: localStorage[github_pat] — browser only<br />
            &gt; NEVER transmitted to any backend other than api.github.com
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onSave(v)}
              className="min-h-11 flex-1 border border-[#00ff66] py-2 uppercase tracking-widest text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
            >
              [ AUTHORIZE ]
            </button>
            <button
              onClick={() => onSave("")}
              className="min-h-11 flex-1 border border-[#ff5500] py-2 uppercase tracking-widest text-[#ff5500] hover:bg-[#ff5500] hover:text-black"
            >
              [ REVOKE ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
