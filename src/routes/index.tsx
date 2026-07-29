import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { PerfPill } from "@/components/devtools/PerfPill";
import { useSearchIndex } from "@/hooks/use-search-index";
import { emitHotkey, installHotkeys, onHotkey } from "@/lib/hotkeys";
import { HeaderMenu, type MenuItem } from "@/components/layout/HeaderMenu";
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
import { ControlCentre, applyStoredTheme } from "@/components/layout/ControlCentre";
import { ReadmeModal } from "@/components/layout/ReadmeModal";
import { editFileIntentUrl } from "@/lib/git-intent";
import { detectRootSpecs, parseAgentSpec, type RootSpec } from "@/lib/agents-spec";
import { AgentOsBanner, AgentOsPanel } from "@/components/agents/AgentOsPanel";
import { DriftInspector } from "@/components/drift/DriftInspector";
import { SddCompilerPanel } from "@/components/sdd/SddCompilerPanel";
import { InfinityLoopModal } from "@/components/infinity/InfinityLoopModal";
import { BridgePanel } from "@/components/bridge/BridgePanel";
import { useCliBridge } from "@/hooks/use-cli-bridge";
import { SelectionBar, type SelectionPayload } from "@/components/ai/SelectionBar";
import { EnvGuard } from "@/components/devtools/EnvGuard";
import { DevModal } from "@/components/devtools/Shell";
import { DependencyRadar } from "@/components/devtools/DependencyRadar";
import { ReleaseStudio } from "@/components/devtools/ReleaseStudio";
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
  const [rawCopied, setRawCopied] = useState(false);
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
  const [sddDoc, setSddDoc] = useState<{ path: string; text: string } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [loopOpen, setLoopOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [depsOpen, setDepsOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const [selPack, setSelPack] = useState<{ path: string; content: string }[]>([]);
  const [cmdTab, setCmdTab] = useState<"all" | "prompts">("all");
  const [loopSeed, setLoopSeed] = useState<string>("");
  const navigate = useNavigate();
  const bridge = useCliBridge();

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
    applyStoredTheme();
  }, []);

  // global hotkey engine
  useEffect(() => {
    const uninstall = installHotkeys();
    const offs = [
      onHotkey("search", () => setCmdOpen((v) => !v)),
      onHotkey("toggleBridge", () => setBridgeOpen((v) => !v)),
      onHotkey("promptShelf", () => {
        setCmdTab("prompts");
        setCmdOpen(true);
      }),
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
        setEnvOpen(false);
        setDepsOpen(false);
        setRelOpen(false);
        setReadmeOpen(false);
        setBridgeOpen(false);
        setCtrlOpen(false);
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
    console.log("%c[ SPEC_DASH // GITHUB_AS_A_DATABASE ]", "color:var(--t-green);font-weight:bold");
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

  // --- text-selection floating actions --------------------------------------
  const selExplain = useCallback((s: SelectionPayload) => {
    setSeed({
      text: `Explain the highlighted excerpt from \`${s.path}\` in plain terms, then flag anything ambiguous or under-specified.\n\n---\n${s.text}\n---`,
      nonce: Date.now(),
    });
  }, []);

  const selAddToPack = useCallback((s: SelectionPayload) => {
    setSelPack((p) => [
      ...p,
      { path: `${s.path}#selection-${p.length + 1}`, content: s.text },
    ]);
    toast.success(`ADDED_TO_TOKEN_PACK — ~${fmtTokens(tokensOf(s.text))} tokens`);
  }, []);

  const selRefine = useCallback((s: SelectionPayload) => {
    setLoopSeed(`Refine and evolve this excerpt from ${s.path}:\n\n${s.text}`);
    setLoopOpen(true);
  }, []);

  const shelfCtx = useMemo(
    () => ({
      repo: owner ? `${owner}/${repo}` : "",
      file: spec?.path ?? "",
      branch,
      framework: "vitest",
      selection: spec?.text?.slice(0, 12000) ?? "",
      content: spec?.text?.slice(0, 12000) ?? "",
    }),
    [owner, repo, branch, spec?.path, spec?.text],
  );

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
  // Infinity Loop scans .md records plus root-level standards (.cursorrules, llms.txt…)
  const loopFiles = useMemo(() => {
    const seen = new Set(files.map((f) => f.path));
    return [
      ...files.map((f) => ({ path: f.path, size: f.size })),
      ...rootSpecs.filter((s) => !seen.has(s.path)).map((s) => ({ path: s.path, size: 0 })),
    ];
  }, [files, rootSpecs]);

  const dot =
    status === "SYNCED" ? "var(--t-green)" : status === "SYNCING" ? "var(--t-amber)" : status === "ERROR" ? "var(--t-orange)" : "var(--t-dim-2)";

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
    "min-h-11 sm:min-h-9 inline-flex items-center justify-center border border-[var(--t-line)] px-3 text-[10px] uppercase tracking-widest hover:border-[var(--t-green)] hover:text-[var(--t-green)]";

  // --- repository-global header actions -------------------------------------

  /** Best spec candidate when nothing is open — used by global header actions. */
  const bestSpec = useMemo(
    () =>
      files.find((f) => isSpecifyPath(f.path)) ??
      files.find((f) => /^(agents\.md|llms\.txt)$/i.test(f.name)) ??
      files.find((f) => f.path.toLowerCase().endsWith(".md")) ??
      null,
    [files],
  );

  /** Mermaid map of the whole repository — fallback when no CI/CD file exists. */
  const repoMapChart = useMemo(() => {
    const safe = (s: string) => s.replace(/["\n]/g, " ").slice(0, 40);
    const lines = ["flowchart LR", `  ROOT["${safe(`${owner}/${repo}`)}"]`];
    groups.slice(0, 16).forEach(([dir, list], i) => {
      lines.push(`  D${i}["/${safe(dir)} · ${list.length}"]`, `  ROOT --> D${i}`);
      list.slice(0, 6).forEach((f, j) => {
        lines.push(`  F${i}_${j}["${safe(f.name)}"]`, `  D${i} --> F${i}_${j}`);
      });
    });
    return lines.join("\n");
  }, [groups, owner, repo]);

  /** Opens the repo CI/CD workflow diagram, or the generated repo map. */
  const openDiagramGlobal = useCallback(() => {
    if (spec && isWorkflowPath(spec.path)) {
      emitHotkey("specToggleDiagram");
      return;
    }
    const wf = files.find((f) => isWorkflowPath(f.path));
    if (wf) {
      openSpec(wf.path);
      return;
    }
    setMapOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, spec]);

  /** Compiles the open spec, else auto-selects the repo's primary spec. */
  const openCompiler = useCallback(async () => {
    if (spec?.text) {
      setSddDoc({ path: spec.path, text: spec.text });
      setSddOpen(true);
      return;
    }
    const target = bestSpec;
    if (!target || !owner) return;
    setSddDoc(null);
    setSddOpen(true);
    try {
      const text = await fetchRaw(owner, repo, branch, target.path);
      setSddDoc({ path: target.path, text });
    } catch {
      setSddOpen(false);
      setError("SPEC_FETCH_FAILED");
    }
  }, [spec, bestSpec, owner, repo, branch]);

  /** Opens root AI directives; drafts a starter template when none exist. */
  const openDirectives = useCallback(() => setAgentOpen(true), []);

  // Alt+D works repo-wide: with no spec open it resolves CI/CD or the repo map.
  useEffect(() => {
    if (spec) return;
    return onHotkey("specToggleDiagram", () => openDiagramGlobal());
  }, [spec, openDiagramGlobal]);

  const draftAgents = rootSpecs.length === 0;
  const draftRaw = useMemo(
    () =>
      `# AGENTS.md (DRAFT — not committed)\n\nThis repository has no AGENTS.md, llms.txt or .cursorrules yet.\nUse this generated starter and commit it at the repository root.\n\n## Project\n\n${owner}/${repo} @ ${branch}\n\n## Agent boundaries / scope\n\n- Never edit files outside the paths listed in this document.\n- Never commit secrets, tokens or .env files.\n- Ask before adding a new dependency.\n\n## Style guide & conventions\n\n- Match the existing formatting and lint configuration.\n- Small, focused commits with imperative messages.\n- Every change ships with tests or a documented reason it cannot.\n\n## Commands\n\n\`\`\`bash\nnpm install\nnpm run dev\nnpm test\n\`\`\`\n`,
    [owner, repo, branch],
  );
  const draftSpec = useMemo(() => (draftAgents ? parseAgentSpec(draftRaw) : null), [draftAgents, draftRaw]);

  const specEngineItems: MenuItem[] = [
    {
      icon: "📜",
      label: "SPEC KIT PIPELINE",
      hint: "specs · plans · tasks",
      accent: "var(--t-blue)",
      disabled: !owner || (!spec?.text && !bestSpec),
      onSelect: () => void openCompiler(),
    },
    {
      icon: "🤖",
      label: draftAgents ? "AGENTS.md & CONSTITUTION (DRAFT)" : "AGENTS.md & CONSTITUTION",
      accent: "var(--t-orange)",
      onSelect: openDirectives,
    },
    {
      icon: "🎒",
      label: "PACK CONTEXT BUNDLE",
      accent: "var(--t-green)",
      onSelect: () => {
        setCmdTab("all");
        setPackOpen(true);
        setCmdOpen(true);
      },
    },
    {
      icon: "♾️",
      label: "RUN INFINITY LOOP",
      accent: "var(--t-purple)",
      disabled: !owner,
      onSelect: () => setLoopOpen(true),
    },
    {
      icon: "📊",
      label: "WORKFLOW GRAPH",
      keys: "ALT+D",
      accent: "var(--t-blue)",
      onSelect: openDiagramGlobal,
    },
    {
      icon: "⚡",
      label: "SAVED PROMPT SHELF",
      keys: "ALT+S",
      accent: "var(--t-purple)",
      onSelect: () => {
        setCmdTab("prompts");
        setCmdOpen(true);
      },
    },
    { icon: "+", label: "NEW SPEC", accent: "var(--t-green)", disabled: !owner, onSelect: () => setNewOpen(true) },
  ];

  const toolsItems: MenuItem[] = [
    {
      icon: "📜",
      label: "RELEASE CHANGELOG STUDIO",
      accent: "var(--t-purple)",
      disabled: !owner,
      onSelect: () => setRelOpen(true),
    },
    {
      icon: "⚠️",
      label: "SPEC DRIFT INSPECTOR",
      accent: "var(--t-orange)",
      disabled: !owner,
      onSelect: () => setDriftOpen(true),
    },
    {
      icon: "🔐",
      label: ".ENV & SECRET GUARD",
      accent: "var(--t-orange)",
      disabled: !owner,
      onSelect: () => setEnvOpen(true),
    },
    { icon: "📦", label: "DEPENDENCY RADAR", disabled: !owner, onSelect: () => setDepsOpen(true) },
    {
      icon: "🔌",
      label: bridge.state === "ACTIVE" ? "LOCAL SYNC: ACTIVE" : "LOCAL WORKSPACE CLI BRIDGE",
      keys: "ALT+L",
      accent: bridge.state === "ACTIVE" ? "var(--t-green)" : "var(--t-amber)",
      onSelect: () => setBridgeOpen(true),
    },
    { icon: "📜", label: "CHANGELOG TIMELINE", onSelect: () => navigate({ to: "/changelog" }) },
  ];


  const rail = (
    <div className="flex h-full flex-col text-[11px]">
      <div className="border-b border-hard px-3 py-3">
        <div className="text-[10px] uppercase tracking-widest text-[var(--t-dim-2)] mb-2">[ REPOSITORY ]</div>
        <button
          onClick={() => setCfgOpen(true)}
          className="w-full min-h-11 border border-hard px-2 text-left text-[11px] text-[var(--t-green)] hover:border-[var(--t-green)] break-all"
        >
          {owner || "___"}/{repo || "___"}
          <div className="text-[10px] text-[var(--t-dim-2)]">@{branch} · [CHANGE]</div>
        </button>
        {agentsFile && (
          <button
            onClick={() => openSpec(agentsFile.path)}
            className="mt-2 w-full min-h-11 border border-[var(--t-orange)] px-2 text-left text-[10px] uppercase tracking-widest text-[var(--t-orange)] hover:bg-[var(--t-orange)] hover:text-[var(--t-on-accent)]"
          >
            ⚑ {agentsFile.name}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 pb-2 text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
          [ AI_CONTEXT_TREE: {String(groups.length).padStart(2, "0")} DIRS · ~{fmtTokens(totalTokens)} TOK ]
        </div>
        {groups.map(([dir, list]) => (
          <div
            key={dir}
            className="flex items-stretch"
            style={{ backgroundColor: activeDir === dir ? "var(--t-green)" : "transparent" }}
          >
            <button
              onClick={() => {
                setActiveDir(dir);
                setMobileNav(false);
              }}
              className="flex-1 min-w-0 min-h-11 px-3 py-1 text-left text-[11px] uppercase tracking-wider"
              style={{ color: activeDir === dir ? "var(--t-on-accent)" : "var(--t-fg)" }}
            >
              <span className="block truncate">📁 /{dir} ({String(list.length).padStart(2, "0")})</span>
              <span
                className="block text-[9px] tracking-widest"
                style={{ color: activeDir === dir ? "var(--t-on-accent)" : "var(--t-dim-2)" }}
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
                style={{ color: activeDir === dir ? "var(--t-on-accent)" : "var(--t-dim)" }}
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
            className="mt-2 mx-3 min-h-11 w-[calc(100%-1.5rem)] border border-[var(--t-green)] px-2 text-[10px] uppercase tracking-widest text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
          >
            + NEW SPEC
          </button>
        )}
      </div>

      <div className="border-t border-hard px-3 py-3 space-y-1 text-[10px] uppercase tracking-widest">
        <div style={{ color: rate.remaining !== null && rate.remaining < 10 ? "var(--t-orange)" : "var(--t-dim)" }}>
          [ API_QUOTA: {rate.remaining ?? "--"}/{rate.limit ?? "--"} ]
        </div>
        <div style={{ color: cacheStatus === "304" ? "var(--t-green)" : "var(--t-dim-2)" }}>[ CACHE: {cacheStatus} ]</div>
        <div className="text-[var(--t-dim-3)]">[ T: {now.slice(11, 19)}Z ]</div>
        <button onClick={sync} className={`${btn} w-full mt-2`}>
          [ PULL ]
        </button>
      </div>
    </div>
  );

  const reader = spec && (
    <div className="flex h-full min-h-0 flex-col bg-[var(--t-bg)]">
      <div className="sticky top-0 z-10 border-b border-hard bg-[var(--t-bg)] px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <button
              onClick={() => setSpec(null)}
              className="sm:hidden min-h-11 min-w-11 border border-hard px-2 text-[11px] text-[var(--t-dim)] hover:text-[var(--t-green)]"
              aria-label="Back to list"
            >
              ←
            </button>
            <div className="min-w-0">
              <div className="truncate text-[12px] uppercase tracking-widest text-[var(--t-green)]">/{spec.path}</div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--t-dim-3)]">
                {spec.text
                  ? `${words(spec.text)} words · ~${fmtTokens(tokensOf(spec.text))} tokens · ${readTime(spec.text.length)}`
                  : "loading…"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
            {spec.text && isSpecifyPath(spec.path) && (
              <button
                onClick={() => {
                  setSddDoc({ path: spec.path, text: spec.text as string });
                  setSddOpen(true);
                }}
                className="min-h-11 sm:min-h-9 inline-flex items-center border border-[var(--t-green)] bg-[var(--t-green)] px-3 text-[var(--t-on-accent)]"
                title="Compile this spec into tasks.md, test skeletons and agent prompt chains"
              >
                ⚡ COMPILE SPEC TO SCAFFOLD
              </button>
            )}
            <a
              href={ghBlobUrl(spec.path, branch)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 sm:min-h-9 inline-flex items-center border border-[var(--t-green)] px-3 text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
            >
              ↗ GITHUB
            </a>
            <a
              href={editFileIntentUrl({ owner, repo, branch, path: spec.path })}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens GitHub web editor. Without write access GitHub creates a fork and Pull Request for you."
              className="min-h-11 sm:min-h-9 inline-flex items-center border border-[var(--t-orange)] px-3 text-[var(--t-orange)] hover:bg-[var(--t-orange)] hover:text-[var(--t-on-accent)]"
            >
              ✏️ EDIT
            </a>
            <button
              onClick={() => {
                if (!spec.text) return;
                void copy(spec.text, "RAW_MARKDOWN_COPIED").then(() => {
                  setRawCopied(true);
                  setTimeout(() => setRawCopied(false), 1500);
                });
              }}
              className={btn}
            >
              {rawCopied ? "✓ COPIED" : "📋 COPY RAW"}
            </button>
            <button
              onClick={() => {
                if (!spec.text) return;
                setSelPack((p) =>
                  p.some((x) => x.path === spec.path)
                    ? p
                    : [...p, { path: spec.path, content: spec.text as string }],
                );
                setCmdTab("all");
                setPackOpen(true);
                setCmdOpen(true);
              }}
              className="min-h-11 sm:min-h-9 inline-flex items-center border border-[var(--t-green)] px-3 text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
              title={`Add ~${fmtTokens(tokensOf(spec.text ?? ""))} tokens to the LLM context budget`}
            >
              🎒 PACK CONTEXT (~{fmtTokens(tokensOf(spec.text ?? ""))})
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
              className="min-h-11 sm:min-h-9 inline-flex items-center px-2 text-[11px] text-[var(--t-dim-2)] hover:text-[var(--t-fg)]"
            >
              [X]
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 text-[14px] leading-7">
          {spec.err ? (
            <pre className="whitespace-pre-wrap text-[11px] text-[var(--t-orange)]">ERR: {spec.err}</pre>
          ) : spec.text === null ? (
            <pre className="text-[11px] text-[var(--t-dim-2)]">&gt; LOADING_FROM_RAW_CDN...</pre>
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
                    <pre className="overflow-auto border border-hard bg-[var(--t-surface)] p-3 text-[11px] whitespace-pre text-[var(--t-fg-2)]">
                      {spec.text}
                    </pre>
                  );
                })()
              ) : (
              <>
              <details className="mb-4 border border-hard p-3 xl:hidden">
                <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
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
                <pre className="mt-4 max-h-[50vh] overflow-auto border border-hard bg-[var(--t-surface)] p-3 text-[11px] whitespace-pre-wrap text-[var(--t-dim)]">
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
    <div className="min-h-screen bg-[var(--t-bg)] text-[var(--t-fg)] flex flex-col">
      {/* TOP BAR */}
      <header className="sticky top-0 z-30 border-b border-hard bg-[var(--t-bg)]">
        <div className="mx-auto w-full max-w-[2200px] px-3 py-2 sm:px-4 2xl:px-10">
          {/* ZONE 1 / 2 / 3 */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 lg:flex lg:flex-nowrap lg:items-center lg:gap-3">
            {/* ZONE 1 — brand + repo context */}
            <div className="flex min-w-0 items-center gap-2 lg:flex-1">
              <button
                onClick={() => setMobileNav(true)}
                aria-label="Open navigation"
                className="lg:hidden min-h-9 min-w-9 grid shrink-0 place-items-center border border-hard text-[var(--t-green)]"
              >
                ☰
              </button>
              <button
                onClick={() => setRailOpen((v) => !v)}
                aria-label="Toggle left rail"
                title="Toggle left rail  [  ]"
                className="hidden lg:grid min-h-8 min-w-8 shrink-0 place-items-center border border-hard text-[var(--t-dim-2)] hover:text-[var(--t-green)]"
              >
                {railOpen ? "◧" : "▢"}
              </button>
              <h1 className="shrink-0 text-[12px] font-bold tracking-wider sm:text-[13px]">
                ⚡ <span className="hidden sm:inline">SPEC DASH</span>
              </h1>
              <span className="hidden sm:inline text-[var(--t-line-2)]">|</span>
              <button
                onClick={() => setCfgOpen(true)}
                title="Switch repository"
                aria-label="Switch repository"
                className="flex min-w-0 flex-1 items-center gap-1 border border-hard px-2 py-1 text-[10px] sm:max-w-[18rem] tracking-widest text-[var(--t-green)] hover:border-[var(--t-green)]"
              >
                <span className="shrink-0">🐙</span>
                <span className="truncate">{owner ? `${owner}/${repo}` : "BIND_REPO"}</span>
                <span className="shrink-0 text-[var(--t-line)]">⇄</span>
              </button>
              <span
                className="inline-block h-2 w-2 shrink-0 animate-pulse"
                style={{ backgroundColor: dot }}
                title={status}
              />
            </div>

            {/* ZONE 2 — command center search */}
            <button
              onClick={() => setCmdOpen(true)}
              aria-label="Search specs and code (Ctrl+K)"
              title={`Search specs & code · ~${fmtTokens(totalTokens)} tokens indexed`}
              className="group order-last col-span-2 flex min-w-0 items-center gap-2 border border-hard px-3 py-1.5 text-left text-[11px] text-[var(--t-dim-2)] hover:border-[var(--t-green)] hover:text-[var(--t-fg-2)] lg:order-none lg:col-span-1 lg:w-[300px] lg:max-w-[300px] lg:shrink-0"
            >
              <span className="shrink-0">🔍</span>
              <span className="min-w-0 flex-1 truncate">Search specs &amp; code…</span>
              <span className="hidden shrink-0 border border-[var(--t-line-2)] px-1 text-[9px] tracking-widest text-[var(--t-dim-2)] group-hover:hidden sm:inline">
                CTRL K
              </span>
              <span className="hidden shrink-0 border border-[var(--t-line-2)] px-1 text-[9px] tracking-widest text-[var(--t-orange)] group-hover:sm:inline">
                🎒 ~{fmtTokens(totalTokens)} TOK
              </span>
            </button>

            {/* ZONE 3 — collapsed action menus */}
            <div className="flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-widest sm:gap-2">
              <HeaderMenu
                icon="⚡"
                label="SPEC ENGINE"
                accent="var(--t-purple)"
                ariaLabel="Spec engine menu"
                items={specEngineItems}
              />
              <HeaderMenu
                icon="🛠️"
                label="TOOLS"
                accent="var(--t-blue)"
                ariaLabel="Tools menu"
                items={toolsItems}
              />
              <button
                onClick={() => setCtrlOpen(true)}
                className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center border border-hard px-2 py-1.5 text-[12px] text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
                title="Control Centre — tokens, default LLM, appearance"
                aria-label="Open control centre"
              >
                ⚙️
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* WORKSPACE */}
      <div className="mx-auto flex w-full max-w-[2200px] flex-1 min-h-0 2xl:px-10">
        {/* LEFT RAIL */}
        {railOpen && (
          <aside className="hidden lg:block w-60 shrink-0 border-r border-hard">
            <div className="sticky top-[53px] h-[calc(100vh-53px)]">{rail}</div>
          </aside>
        )}

        {/* CENTER */}
        <main className="min-w-0 flex-1">
          <AgentOsBanner specs={rootSpecs} onOpen={() => setAgentOpen(true)} onOpenFile={openSpec} />
          <div className="grid grid-cols-2 border-b border-hard bg-[var(--t-bg)] sm:grid-cols-4 lg:sticky lg:top-[53px] lg:z-20">
            <Stat label="MD_RECORDS" value={files.length} accent="var(--t-green)" />
            <Stat label="DIRECTORIES" value={groups.length} />
            <Stat label="ACTIVE_ROWS" value={rows.length} accent="var(--t-orange)" />
            <Stat label="BRANCH" value={branch} />
          </div>

          {error && (
            <div className="border-b border-hard px-4 py-2 text-[11px] text-[var(--t-orange)]">
              ERR: {error} — verify owner/repo, or connect a PAT for higher quota / private repos.
            </div>
          )}

          {!owner ? (
            <div className="px-4 py-16 text-center text-[12px] text-[var(--t-dim-2)]">
              &gt; NO_DB_CONFIGURED — open [CFG] to bind GITHUB_OWNER/GITHUB_REPO
            </div>
          ) : files.length === 0 && status === "SYNCED" ? (
            <div className="px-4 py-16 text-center text-[12px] text-[var(--t-dim-2)]">&gt; NO_MARKDOWN_RECORDS_FOUND</div>
          ) : (
            <>
              {/* MOBILE CARDS */}
              <ul className="divide-y divide-[var(--t-surface-2)] sm:hidden">
                {rows.map((f) => (
                  <li key={f.path} className="px-3 py-3">
                    <div className="truncate text-[13px] text-[var(--t-fg)]">{f.name}</div>
                    <div className="truncate text-[11px] text-[var(--t-dim)]">/{f.path}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-[var(--t-dim-3)]">
                      <span className="border border-hard px-2 py-0.5">{fmtSize(f.size)}</span>
                      <span className="border border-hard px-2 py-0.5 text-[var(--t-green)]">
                        ~{fmtTokens(tokensFromBytes(f.size))} tok
                      </span>
                      <span className="border border-hard px-2 py-0.5">{readTime(f.size)}</span>
                      <span className="border border-hard px-2 py-0.5">{f.sha.slice(0, 7)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => openSpec(f.path)}
                        className="min-h-11 flex-1 border border-[var(--t-green)] px-3 text-[11px] text-[var(--t-green)]"
                      >
                        📄 VIEW
                      </button>
                      <a
                        href={editFileIntentUrl({ owner, repo, branch, path: f.path })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-11 min-w-11 grid place-items-center border border-[var(--t-line)] px-3 text-[11px] text-[var(--t-dim)]"
                        aria-label={`Edit ${f.name} on GitHub`}
                      >
                        ✏️
                      </a>
                      <button
                        onClick={() => copy(ghBlobUrl(f.path, branch), "LINK_COPIED")}
                        className="min-h-11 min-w-11 grid place-items-center border border-[var(--t-line)] px-3 text-[11px] text-[var(--t-dim)]"
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
                    <tr className="text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
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
                        className="group hover:bg-[var(--t-surface)]"
                        style={{ outline: spec?.path === f.path ? "1px solid var(--t-green)" : undefined }}
                      >
                        <Td className="text-[var(--t-dim-3)] tabular-nums">{String(i + 1).padStart(4, "0")}</Td>
                        <Td className="text-[var(--t-fg)]">{f.name}</Td>
                        <Td className="text-[var(--t-dim)]">/{f.path}</Td>
                        <Td className="tabular-nums text-[var(--t-dim-2)]">{fmtSize(f.size)}</Td>
                        <Td className="tabular-nums text-[var(--t-green)]">~{fmtTokens(tokensFromBytes(f.size))}</Td>
                        <Td className="text-[var(--t-dim-2)]">{readTime(f.size)}</Td>
                        <Td className="tabular-nums text-[var(--t-dim-2)]">{f.sha.slice(0, 10)}</Td>
                        <Td>
                          <div className="flex items-center gap-2 opacity-70 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => openSpec(f.path)}
                              className="border border-[var(--t-green)] px-2 py-1 text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
                            >
                              📄 VIEW
                            </button>
                            <a
                              href={editFileIntentUrl({ owner, repo, branch, path: f.path })}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Edit on GitHub"
                              aria-label={`Edit ${f.name} on GitHub`}
                              className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim)] hover:border-[var(--t-orange)] hover:text-[var(--t-orange)]"
                            >
                              ✏️↗
                            </a>
                            <button
                              onClick={() => copy(ghBlobUrl(f.path, branch), "LINK_COPIED")}
                              title="Copy link"
                              aria-label={`Copy link to ${f.name}`}
                              className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
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

          <footer className="flex flex-wrap justify-between gap-2 border-t border-hard px-4 py-2 text-[10px] uppercase tracking-widest text-[var(--t-dim-3)]">
            <span>&gt; ENGINE: git/trees?recursive=1 + ETAG_304 + RAW_CDN</span>
            <span className="flex items-center gap-2">
              <PerfPill />
              <span className="hidden sm:inline">{now}</span>
            </span>
          </footer>
        </main>

      </div>

      {/* SPEC READER OVERLAY */}
      {spec && readerOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--t-bg)]/85 sm:p-4">
          <div className="h-full w-full border-hard bg-[var(--t-bg)] sm:h-[92vh] sm:max-w-5xl sm:border 2xl:max-w-6xl">
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
            className="absolute inset-0 bg-[var(--t-bg)]/80"
          />
          <div className="absolute inset-y-0 left-0 w-[82vw] max-w-[300px] border-r border-hard bg-[var(--t-bg)]">
            <div className="flex items-center justify-between border-b border-hard px-3 py-2">
              <span className="text-[11px] uppercase tracking-widest text-[var(--t-green)]">[ NAVIGATION ]</span>
              <button onClick={() => setMobileNav(false)} className="min-h-11 min-w-11 text-[var(--t-dim-2)]">
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
      {ctrlOpen && (
        <ControlCentre
          hasPat={hasPat}
          aiLabel={aiCfg ? `AI ENGINE: ${aiCfg.provider.toUpperCase()}` : "AI ENGINE CONFIG"}
          onClose={() => setCtrlOpen(false)}
          onOpenPat={() => {
            setCtrlOpen(false);
            setPatOpen(true);
          }}
          onOpenAi={() => {
            setCtrlOpen(false);
            setAiOpen(true);
          }}
          onSwitchRepo={() => {
            setCtrlOpen(false);
            setCfgOpen(true);
          }}
          onOpenBridge={() => {
            setCtrlOpen(false);
            setBridgeOpen(true);
          }}
          onOpenShortcuts={() => {
            setCtrlOpen(false);
            setKeysOpen(true);
          }}
          onOpenReadme={() => {
            setCtrlOpen(false);
            setReadmeOpen(true);
          }}
        />
      )}
      {agentOpen && (
        <AgentOsPanel
          specs={draftAgents ? [{ path: "AGENTS.md", name: "AGENTS.md (DRAFT)" }] : rootSpecs}
          activeSpecPath={draftAgents ? "AGENTS.md" : agentPath}
          spec={draftAgents ? draftSpec : agentSpec}
          raw={draftAgents ? draftRaw : agentRaw}
          loading={draftAgents ? false : agentLoading}
          error={draftAgents ? null : agentErr}
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
          initialPack={packOpen}
          initialTab={cmdTab}
          extraFiles={selPack}
          shelfCtx={shelfCtx}
          onRunPreset={async (prompt) => {
            setCmdOpen(false);
            setCmdTab("all");
            if (!spec && bestSpec) await openSpec(bestSpec.path);
            setSeed({ text: prompt, nonce: Date.now() });
          }}
          onClose={() => {
            setCmdOpen(false);
            setPackOpen(false);
            setCmdTab("all");
          }}
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

      {sddOpen && sddDoc && (
        <SddCompilerPanel path={sddDoc.path} text={sddDoc.text} onClose={() => setSddOpen(false)} />
      )}

      {mapOpen && (
        <DevModal title="REPOSITORY WORKFLOW MAP" accent="var(--t-blue)" wide onClose={() => setMapOpen(false)}>
          <DiagramCanvas chart={repoMapChart} label="REPO MAP" />
        </DevModal>
      )}

      {loopOpen && owner && (
        <InfinityLoopModal
          owner={owner}
          repo={repo}
          branch={branch}
          files={loopFiles}
          cfg={aiCfg}
          seedGoal={loopSeed}
          bridge={bridge}
          onClose={() => {
            setLoopOpen(false);
            setLoopSeed("");
          }}
        />
      )}

      {bridgeOpen && (
        <BridgePanel
          bridge={bridge}
          commands={agentSpec?.commands ?? []}
          onClose={() => setBridgeOpen(false)}
        />
      )}

      <SelectionBar
        sourcePath={spec?.path ?? null}
        onExplain={selExplain}
        onAddToPack={selAddToPack}
        onRefine={selRefine}
      />

      {envOpen && owner && (
        <EnvGuard
          owner={owner}
          repo={repo}
          branch={branch}
          onClose={() => setEnvOpen(false)}
          onOpenFile={(p) => {
            setEnvOpen(false);
            openSpec(p);
          }}
        />
      )}

      {depsOpen && owner && (
        <DependencyRadar owner={owner} repo={repo} branch={branch} onClose={() => setDepsOpen(false)} />
      )}

      {relOpen && owner && (
        <ReleaseStudio owner={owner} repo={repo} branch={branch} onClose={() => setRelOpen(false)} />
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
  return <th className="border border-hard px-3 py-2 text-left font-normal">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-hard px-3 py-2 ${className}`}>{children}</td>;
}


function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  const v = typeof value === "number" ? String(value).padStart(4, "0") : value;
  return (
    <div className="border-b border-r border-hard px-4 py-3 last:border-r-0 sm:border-b-0">
      <div className="text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">{label}</div>
      <div className="mt-1 text-[20px] font-bold tabular-nums 2xl:text-[26px]" style={{ color: accent ?? "var(--t-fg)" }}>
        {v}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">&gt; {label}</div>
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
    <div className="fixed inset-0 z-[60] flex items-start justify-end bg-[var(--t-bg)]/80">
      <div className="h-full w-full max-w-md border-l border-hard bg-[var(--t-bg)] p-6">
        <div className="mb-4 flex items-center justify-between border-b border-hard pb-3">
          <div className="text-[12px] uppercase tracking-widest text-[var(--t-green)]">[ DB_CONFIG ]</div>
          <button onClick={onClose} className="min-h-11 px-2 text-[11px] text-[var(--t-dim-2)] hover:text-[var(--t-fg)]">
            [X CLOSE]
          </button>
        </div>
        <div className="space-y-4 text-[11px]">
          <Field label="GITHUB_OWNER / REPO_URL">
            <input
              value={o}
              onChange={(e) => setO(e.target.value)}
              placeholder="octocat  |  https://github.com/octocat/sandbox"
              className="w-full border border-hard bg-[var(--t-bg)] px-2 py-3 text-[var(--t-fg)] outline-none focus:border-[var(--t-green)]"
            />
          </Field>
          <Field label="GITHUB_REPO">
            <input
              value={r}
              onChange={(e) => setR(e.target.value)}
              placeholder="sandbox"
              className="w-full border border-hard bg-[var(--t-bg)] px-2 py-3 text-[var(--t-fg)] outline-none focus:border-[var(--t-green)]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] leading-relaxed text-[var(--t-dim-2)]">
            &gt; READ: /git/trees/{"{branch}"}?recursive=1 (filter: blob + .md)<br />
            &gt; CACHE: ETag + If-None-Match, 304 = 0 quota cost<br />
            &gt; FILE_READ: raw.githubusercontent.com (no REST cost)<br />
            &gt; PERSIST: localStorage[activeOwner, activeRepo]
          </div>
          <button
            onClick={submit}
            className="min-h-11 w-full border border-[var(--t-green)] py-2 text-[11px] uppercase tracking-widest text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--t-bg)]/85 p-4">
      <div className="w-full max-w-lg border border-hard bg-[var(--t-bg)]">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[var(--t-green)]">[ CONNECT_GITHUB ]</div>
          <button onClick={onClose} className="min-h-11 px-2 text-[11px] text-[var(--t-dim-2)] hover:text-[var(--t-fg)]">
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
              className="w-full border border-hard bg-[var(--t-bg)] px-2 py-3 text-[var(--t-fg)] outline-none focus:border-[var(--t-green)]"
            />
          </Field>
          <div className="border border-hard p-3 text-[10px] leading-relaxed text-[var(--t-dim-2)]">
            &gt; SCOPE: `repo` for private repos, none for public<br />
            &gt; STORAGE: localStorage[github_pat] — browser only<br />
            &gt; NEVER transmitted to any backend other than api.github.com
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onSave(v)}
              className="min-h-11 flex-1 border border-[var(--t-green)] py-2 uppercase tracking-widest text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
            >
              [ AUTHORIZE ]
            </button>
            <button
              onClick={() => onSave("")}
              className="min-h-11 flex-1 border border-[var(--t-orange)] py-2 uppercase tracking-widest text-[var(--t-orange)] hover:bg-[var(--t-orange)] hover:text-[var(--t-on-accent)]"
            >
              [ REVOKE ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
