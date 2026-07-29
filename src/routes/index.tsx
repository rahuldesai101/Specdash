import { createFileRoute, Link } from "@tanstack/react-router";
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
import { SearchModal } from "@/components/search/SearchModal";
import { useSearchIndex } from "@/hooks/use-search-index";
import { installHotkeys, onHotkey } from "@/lib/hotkeys";
import { SpecAssistant } from "@/components/ai/SpecAssistant";
import { MarkdownView } from "@/components/md/MarkdownView";
import { SkillPills } from "@/components/md/SkillPills";
import { DiagramCanvas } from "@/components/md/DiagramCanvas";
import { isWorkflowPath, parseWorkflow } from "@/lib/workflow-graph";
import { isDatasetPath, datasetKind } from "@/lib/dataset";
import { DatasetInspector } from "@/components/data/DatasetInspector";
import { NewSpecModal } from "@/components/git/NewSpecModal";
import { SpecToc } from "@/components/layout/SpecToc";
import { ShortcutsModal } from "@/components/layout/ShortcutsModal";
import { ReadmeModal } from "@/components/layout/ReadmeModal";
import { editFileIntentUrl } from "@/lib/git-intent";
import { detectRootSpecs, parseAgentSpec, type RootSpec } from "@/lib/agents-spec";
import { AgentOsBanner, AgentOsPanel } from "@/components/agents/AgentOsPanel";
import { DriftInspector } from "@/components/drift/DriftInspector";
import { SddCompilerPanel } from "@/components/sdd/SddCompilerPanel";
import { InfinityLoopModal } from "@/components/infinity/InfinityLoopModal";
import { isSpecifyPath } from "@/lib/sdd-compiler";
import { isRuleSource } from "@/lib/spec-drift";
import { fmtTokens, tokensFromBytes, tokensOf } from "@/lib/context-pack";
import {
  appPermalink,
  ghBlobUrl as buildBlobUrl,
  ghTreeUrl as buildTreeUrl,
  parseDeepLink,
} from "@/lib/gh-url";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SPEC DASH — AI-Native Repository Dashboard" },
      {
        name: "description",
        content:
          "An ultra-fast, zero-cost control center for AI-native GitHub repositories, AGENTS.md operating specs, and prompt libraries.",
      },
      { property: "og:title", content: "SPEC DASH — AI-Native Repository Dashboard" },
      {
        property: "og:description",
        content:
          "An ultra-fast, zero-cost control center for AI-native GitHub repositories, AGENTS.md specs, and prompt libraries.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://specdash.lovable.app/" },
      { property: "og:image", content: "https://specdash.lovable.app/og-preview.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://specdash.lovable.app/og-preview.png" },
    ],
    links: [{ rel: "canonical", href: "https://specdash.lovable.app/" }],
  }),
  component: Index,
});

const BASE_TITLE = "SPEC DASH — AI-Native Repository Dashboard";

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
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [headSha, setHeadSha] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pinnedBranch, setPinnedBranch] = useState<string | null>(null);
  const [rootSpecs, setRootSpecs] = useState<RootSpec[]>([]);
  const [agentPath, setAgentPath] = useState<string | null>(null);
  const [agentRaw, setAgentRaw] = useState<string | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentErr, setAgentErr] = useState<string | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [sideBySide, setSideBySide] = useState(false);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  const [sddOpen, setSddOpen] = useState(false);
  const [loopOpen, setLoopOpen] = useState(false);

  useEffect(() => {
    const dl = parseDeepLink(window.location.search);
    const o = dl.owner ?? localStorage.getItem("activeOwner") ?? "";
    const r = dl.repo ?? localStorage.getItem("activeRepo") ?? "sandbox";
    if (dl.branch) {
      setBranch(dl.branch);
      setPinnedBranch(dl.branch);
    }
    if (dl.path) setPendingPath(dl.path);
    setOwner(o);
    setRepo(r);
    setHasPat(Boolean(getPat()));
    if (!o) setCfgOpen(true);
    setAiCfg(loadAiConfig());
  }, []);

  // global hotkey engine
  useEffect(() => {
    const uninstall = installHotkeys();
    const offs = [
      onHotkey("search", () => setCmdOpen((v) => !v)),
      onHotkey("help", () => setKeysOpen((v) => !v)),
      onHotkey("toggleRail", () => setRailOpen((v) => !v)),
      onHotkey("toggleReader", () => setReaderOpen((v) => !v)),
      onHotkey("goReadme", () => setReadmeOpen(true)),
      onHotkey("goHome", () => {
        setSpec(null);
        setReadmeOpen(false);
        setCmdOpen(false);
      }),
      onHotkey("specToggleSideBySide", () => setSideBySide((v) => !v)),
      onHotkey("escape", () => {
        setKeysOpen(false);
        setCmdOpen(false);
        setAgentOpen(false);
        setDriftOpen(false);
        setSddOpen(false);
        setLoopOpen(false);
        setAiOpen(false);
        setPatOpen(false);
        setNewOpen(false);
        setMobileNav(false);
        setReadmeOpen(false);
        setSpec(null);
      }),
    ];
    return () => {
      uninstall();
      offs.forEach((off) => off());
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 1000);
    setNow(new Date().toISOString());
    return () => clearInterval(t);
  }, []);

  // ASCII startup banner
  useEffect(() => {
    console.log("%c[ SPEC_DASH // GITHUB_AS_A_DATABASE ]", "color:#00ff66;font-weight:bold");
  }, []);

  // dynamic browser tab title
  useEffect(() => {
    if (spec?.path) {
      document.title = `📄 ${spec.path.split("/").pop()} — SPEC DASH`;
    } else if (activeDir) {
      document.title = `📁 ${activeDir} — SPEC DASH`;
    } else if (owner && repo) {
      document.title = `${owner}/${repo} — SPEC DASH`;
    } else {
      document.title = BASE_TITLE;
    }
  }, [spec?.path, activeDir, owner, repo]);

  const sync = useCallback(async () => {
    if (!owner || !repo) return;
    setStatus("SYNCING");
    setError(null);
    try {
      const meta = await ghFetch<{ default_branch: string }>(`/repos/${owner}/${repo}`);
      const br = pinnedBranch || meta.data.default_branch || "main";
      setBranch(br);
      const tree = await ghFetch<{ tree: TreeItem[]; truncated: boolean }>(
        `/repos/${owner}/${repo}/git/trees/${br}?recursive=1`,
      );
      setRate(tree.rate.remaining !== null ? tree.rate : meta.rate);
      setCacheStatus(tree.status);
      const rowsAll: FileRow[] = tree.data.tree
        .filter(
          (i) =>
            i.type === "blob" &&
            (i.path.toLowerCase().endsWith(".md") || isWorkflowPath(i.path) || isDatasetPath(i.path)),
        )
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
      const detected = detectRootSpecs(
        tree.data.tree.filter((i) => i.type === "blob").map((i) => i.path),
      );
      setRootSpecs(detected);
      setAgentPath((prev) => (prev && detected.some((d) => d.path === prev) ? prev : detected[0]?.path ?? null));
      try {
        const head = await ghFetch<Array<{ sha: string }>>(
          `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(br)}&per_page=1`,
        );
        setHeadSha(head.data?.[0]?.sha ?? null);
      } catch {
        setHeadSha(null);
      }
    } catch (e) {
      setStatus("ERROR");
      setError(e instanceof Error ? e.message : "UNKNOWN_ERR");
    }
  }, [owner, repo, pinnedBranch]);

  useEffect(() => {
    if (owner && repo) sync();
  }, [sync, owner, repo]);

  // load the detected root AI spec (AGENTS.md / llms.txt / agents.txt / .cursorrules)
  useEffect(() => {
    if (!owner || !repo || !agentPath) {
      setAgentRaw(null);
      return;
    }
    let cancelled = false;
    setAgentLoading(true);
    setAgentErr(null);
    fetchRaw(owner, repo, branch, agentPath)
      .then((t) => {
        if (!cancelled) setAgentRaw(t);
      })
      .catch((e) => {
        if (!cancelled) setAgentErr(e instanceof Error ? e.message : "RAW_ERR");
      })
      .finally(() => {
        if (!cancelled) setAgentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, agentPath]);

  const agentSpec = useMemo(() => (agentRaw ? parseAgentSpec(agentRaw) : null), [agentRaw]);

  const searchState = useSearchIndex(owner, repo, branch, files, excerpts);

  const runSnippet = useCallback((code: string, lang: string) => {
    setSeed({
      text: `Run / evaluate this ${lang} snippet:\n\n\`\`\`${lang}\n${code}\n\`\`\``,
      nonce: Date.now(),
    });
  }, []);

  // spec-scoped hotkeys (Alt+C copy raw, Alt+G open on GitHub)
  useEffect(() => {
    const offs = [
      onHotkey("specCopyRaw", () => {
        if (!spec?.text) return;
        navigator.clipboard
          .writeText(spec.text)
          .then(() => toast.success("RAW_MARKDOWN_COPIED"))
          .catch(() => toast.error("CLIPBOARD_BLOCKED"));
      }),
      onHotkey("specOpenGithub", () => {
        if (!spec?.path || !owner) return;
        window.open(buildBlobUrl(owner, repo, branch, spec.path), "_blank", "noopener,noreferrer");
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [spec?.text, spec?.path, owner, repo, branch]);

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
  const ruleFiles = useMemo(
    () => [...new Set([...rootSpecs.map((s) => s.path), ...files.map((f) => f.path).filter(isRuleSource)])],
    [rootSpecs, files],
  );
  const totalTokens = useMemo(() => files.reduce((n, f) => n + tokensFromBytes(f.size), 0), [files]);

  const dot =
    status === "SYNCED" ? "#00ff66" : status === "SYNCING" ? "#ffaa00" : status === "ERROR" ? "#ff5500" : "#666";

  const ghBlobUrl = (path: string, ref?: string | null) =>
    buildBlobUrl(owner, repo, ref ?? branch, path);
  const ghTreeUrl = (dir: string) => buildTreeUrl(owner, repo, branch, dir);

  const openSpec = async (path: string) => {
    setCmdOpen(false);
    setMobileNav(false);
    setCopied(false);
    setReaderOpen(true);
    setSpec({ path, text: null });
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("repo", `${owner}/${repo}`);
      url.searchParams.set("path", path);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
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

  // deep-link: open the requested spec once the tree is loaded
  useEffect(() => {
    if (!pendingPath || status !== "SYNCED" || !files.length) return;
    const match = files.find((f) => f.path === pendingPath);
    setPendingPath(null);
    if (match) {
      setActiveDir(match.dir);
      openSpec(match.path);
    } else {
      toast.error(`SPEC_NOT_FOUND: /${pendingPath}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPath, status, files]);

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
          [ AI_CONTEXT_TREE: {String(groups.length).padStart(2, "0")} DIRS · ~{fmtTokens(totalTokens)} TOK ]
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
              className="flex-1 min-w-0 min-h-11 px-3 py-1 text-left text-[11px] uppercase tracking-wider"
              style={{ color: activeDir === dir ? "#000" : "#fff" }}
            >
              <span className="block truncate">📁 /{dir} ({String(list.length).padStart(2, "0")})</span>
              <span
                className="block text-[9px] tracking-widest"
                style={{ color: activeDir === dir ? "#000" : "#666" }}
              >
                {fmtSize(list.reduce((n, f) => n + f.size, 0))} · ~
                {fmtTokens(list.reduce((n, f) => n + tokensFromBytes(f.size), 0))} tokens
              </span>
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
              className="sm:hidden min-h-11 min-w-11 border border-hard px-2 text-[11px] text-[#888] hover:text-[#00ff66]"
              aria-label="Back to list"
            >
              ←
            </button>
            <div className="min-w-0">
              <div className="truncate text-[12px] uppercase tracking-widest text-[#00ff66]">/{spec.path}</div>
              <div className="text-[10px] uppercase tracking-widest text-[#555]">
                {spec.text
                  ? `${words(spec.text)} words · ~${fmtTokens(tokensOf(spec.text))} tokens · ${readTime(spec.text.length)}`
                  : "loading…"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
            {spec.text && isSpecifyPath(spec.path) && (
              <button
                onClick={() => setSddOpen(true)}
                className="min-h-11 sm:min-h-9 inline-flex items-center border border-[#00ff66] bg-[#00ff66] px-3 text-black"
                title="Compile this spec into tasks.md, test skeletons and agent prompt chains"
              >
                ⚡ COMPILE SPEC TO SCAFFOLD
              </button>
            )}
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
                copy(ghBlobUrl(spec.path, headSha ?? branch), "PERMALINK_COPIED").then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className={btn}
            >
              {copied ? "[ COPIED ]" : "🔗 PERMALINK"}
            </button>
            <button
              onClick={() => copy(appPermalink(owner, repo, spec.path, branch), "SHARE_LINK_COPIED")}
              className={btn}
              title="Copy a SPEC DASH share link to this file"
            >
              🔗 SHARE
            </button>
            <button
              onClick={() => setSpec(null)}
              className="min-h-11 sm:min-h-9 inline-flex items-center px-2 text-[11px] text-[#666] hover:text-white"
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
              {datasetKind(spec.path) && !isWorkflowPath(spec.path) ? (
                <DatasetInspector path={spec.path} text={spec.text} />
              ) : !/\.md$/i.test(spec.path) ? (
                (() => {
                  const wf = parseWorkflow(spec.text);
                  return wf ? (
                    <DiagramCanvas
                      chart={wf.mermaid}
                      label={`${wf.kind.toUpperCase()} // ${wf.title}`}
                      raw={spec.text}
                      rawLang={spec.path.split(".").pop() ?? "yaml"}
                    />
                  ) : (
                    <pre className="overflow-auto border border-hard bg-[#050505] p-3 text-[11px] whitespace-pre text-[#ccc]">
                      {spec.text}
                    </pre>
                  );
                })()
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
              <SkillPills source={spec.text} onRun={runSnippet} />
              <MarkdownView
                source={spec.text}
                ctx={{
                  owner,
                  repo,
                  branch,
                  currentPath: spec.path,
                  exists: (p) => files.some((f) => f.path === p),
                  onOpen: (p) => openSpec(p),
                  onRunSnippet: runSnippet,
                }}
              />
              {sideBySide && (
                <pre className="mt-4 max-h-[50vh] overflow-auto border border-hard bg-[#050505] p-3 text-[11px] whitespace-pre-wrap text-[#888]">
                  {spec.text}
                </pre>
              )}
              </>
              )}
            </>
          )}
        </div>
        {spec.text && /\.md$/i.test(spec.path) && (
          <aside className="hidden xl:block w-56 shrink-0 overflow-y-auto border-l border-hard px-3 py-5">
            <SpecToc source={spec.text} />
          </aside>
        )}
      </div>

      <SpecAssistant cfg={aiCfg} path={spec.path} text={spec.text} seed={seed} />
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
                ⚡ SPEC DASH <span className="text-[#333]">//</span>{" "}
                <span className="text-[#00ff66]">GITHUB_AS_A_DATABASE</span>
              </h1>
              <span className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#888]">
                <span className="inline-block h-2 w-2 shrink-0 animate-pulse" style={{ backgroundColor: dot }} />
                {status}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-widest">
              <button
                onClick={() => setReadmeOpen(true)}
                className={btn}
                title="Read Me — how this app works"
                aria-label="Read me — how this app works"
              >
                📖<span className="hidden md:inline ml-1">READ ME</span>
              </button>
              <button onClick={() => setCmdOpen(true)} className={btn} title="Search (Ctrl+K)" aria-label="Search specs (Ctrl+K)">
                🔍<span className="hidden md:inline ml-1">SEARCH ⌘K</span>
              </button>
              {rootSpecs.length > 0 && (
                <button
                  onClick={() => setAgentOpen(true)}
                  className={`${btn} border-[#ff5500] text-[#ff5500] hover:border-[#ff5500] hover:text-black hover:bg-[#ff5500]`}
                  title="AI operating system directives detected in this repo"
                  aria-label="Open AI operating system directives panel"
                >
                  🤖<span className="hidden md:inline ml-1">{rootSpecs[0].name.toUpperCase()}</span>
                </button>
              )}
              <button
                onClick={() => setDriftOpen(true)}
                disabled={!owner}
                className={`${btn} border-[#ff5500] text-[#ff5500] disabled:opacity-40`}
                title="Spec Drift Inspector — compare recent commits against AGENTS.md / constitution.md / ADRs"
                aria-label="Open spec drift inspector"
              >
                ⚠️<span className="hidden md:inline ml-1">DRIFT</span>
              </button>
              <button
                onClick={() => setLoopOpen(true)}
                disabled={!owner}
                className={`${btn} border-[#c07cff] text-[#c07cff] hover:border-[#c07cff] hover:text-black hover:bg-[#c07cff] disabled:opacity-40`}
                title="Infinity Loop — synthesize all project specs and self-improve"
                aria-label="Open infinity loop self-improving spec engine"
              >
                ♾️<span className="hidden md:inline ml-1">INFINITY LOOP</span>
              </button>
              <button
                onClick={() => setNewOpen(true)}
                disabled={!owner}
                className={`${btn} border-[#00ff66] text-[#00ff66] disabled:opacity-40`}
                title="New spec"
                aria-label="Create new spec"
              >
                +<span className="hidden md:inline ml-1">NEW SPEC</span>
              </button>
              <button
                onClick={() => setAiOpen(true)}
                className={btn}
                style={{ borderColor: aiCfg ? "#00ff66" : "#333", color: aiCfg ? "#00ff66" : "#fff" }}
                title={aiCfg ? `AI ACTIVE (${aiCfg.provider})` : "AI disabled"}
                aria-label={aiCfg ? `AI engine config — active (${aiCfg.provider})` : "AI engine config — disabled"}
              >
                ⚡<span className="hidden md:inline ml-1">{aiCfg ? aiCfg.provider.toUpperCase() : "AI CFG"}</span>
              </button>
              <button
                onClick={() => setPatOpen(true)}
                className={btn}
                style={{ borderColor: hasPat ? "#00ff66" : "#ff5500", color: hasPat ? "#00ff66" : "#ff5500" }}
                title={hasPat ? "PAT connected" : "No PAT"}
                aria-label={hasPat ? "GitHub token settings — connected" : "GitHub token settings — not connected"}
              >
                {hasPat ? "🟢" : "🔴"}
                <span className="hidden md:inline ml-1">PAT</span>
              </button>
              <button
                onClick={() => setKeysOpen(true)}
                className={`${btn} hidden lg:inline-flex`}
                title="Shortcuts (Ctrl+/)"
                aria-label="Keyboard shortcuts (Ctrl+/)"
              >
                ⌨
              </button>
              <Link to="/changelog" className={btn} title="Changelog timeline" aria-label="Changelog timeline">
                📜<span className="hidden md:inline ml-1">CHANGELOG</span>
              </Link>
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
        <main className="min-w-0 flex-1">
          <AgentOsBanner specs={rootSpecs} onOpen={() => setAgentOpen(true)} onOpenFile={openSpec} />
          <div className="grid grid-cols-2 border-b border-hard bg-black sm:grid-cols-4 lg:sticky lg:top-[89px] lg:z-20">
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
                      <span className="border border-hard px-2 py-0.5 text-[#00ff66]">
                        ~{fmtTokens(tokensFromBytes(f.size))} tok
                      </span>
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
                      <Th>TOKENS</Th>
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
                        <Td className="tabular-nums text-[#00ff66]">~{fmtTokens(tokensFromBytes(f.size))}</Td>
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
      {agentOpen && (
        <AgentOsPanel
          specs={rootSpecs}
          activeSpecPath={agentPath}
          spec={agentSpec}
          raw={agentRaw}
          loading={agentLoading}
          error={agentErr}
          onSelect={setAgentPath}
          onClose={() => setAgentOpen(false)}
          onOpenFile={(p) => openSpec(p)}
        />
      )}
      <ReadmeModal open={readmeOpen} onClose={() => setReadmeOpen(false)} />

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
        <SearchModal
          state={searchState}
          repoLabel={`${owner}/${repo}`}
          onClose={() => setCmdOpen(false)}
          onOpen={openSpec}
          onRunSnippet={(code, lang, path) => {
            if (path !== spec?.path) openSpec(path);
            runSnippet(code, lang);
          }}
        />
      )}

      {driftOpen && owner && (
        <DriftInspector
          owner={owner}
          repo={repo}
          branch={branch}
          ruleFiles={ruleFiles}
          onClose={() => setDriftOpen(false)}
          onOpenFile={(p) => {
            setDriftOpen(false);
            openSpec(p);
          }}
        />
      )}

      {sddOpen && spec?.text && (
        <SddCompilerPanel path={spec.path} text={spec.text} onClose={() => setSddOpen(false)} />
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
