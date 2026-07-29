# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Removed

- **Embedded API Workbench** — the HTTP client / API Sandbox (and its OpenAPI discovery layer) is gone, along with its header entry, state and hotkey wiring. SPEC DASH stays focused on spec-driven work: Spec Kit pipeline, AGENTS.md/Constitution, context token budgeting and the Infinity Loop.

### Added

- **Perplexity** joins the external AI launcher, and Gemini/Kimi now support prompt pre-fill.
- **⚙️ Control Centre drawer** — a right-side slide-over holding GitHub PAT / AI engine keys, the default external LLM target, dark/light appearance, search-index clearing and workspace reset.

### Changed

- **Global header redesigned into 4 zones** (brand + repo, compact 300px search with a `CTRL K` badge, two dropdowns `⚡ SPEC ENGINE` / `🛠️ TOOLS`, and the Control Centre icon), fully responsive across mobile, tablet and desktop.

### Removed

- **Duplicate status sub-header** — the pill bar under the main header is gone; token budget now previews on the search bar.

### Changed

- **Spec Compiler menu** — the old `BUILD` dropdown is now `[ ⚡ SPEC COMPILER ▾ ]`: Pack Context Bundle, Export CLI Prompt Snippets, Run Infinity Loop, Check Spec Drift, AGENTS.md & Constitution.
- **External AI deep links** — every provider (ChatGPT, Claude, Gemini, Perplexity, Kimi) is opened with a `?q=` pre-filled prompt when the payload fits, the payload is always copied to the clipboard first, and the toast reads `[ ⚡ Content copied & passed to … Press Ctrl+V if field isn't pre-filled ]`. Payloads now carry repository + active-file context headers.

- **Performance overhaul** — full-text search now runs entirely off the main thread in a dedicated Web Worker (`src/lib/search.worker.ts`): indexing, prefix querying and snippet highlighting no longer block typing. Search results are DOM-virtualized with `@tanstack/react-virtual`, queries are debounced at 150ms, and markdown/code-block renderers are memoized. A live FPS + render-time meter sits in the footer.
- **File actions relocated** — the remaining file-scoped buttons (Open on GitHub, Copy Raw) left the global header; the spec reader toolbar now owns them and adds a `🎒 PACK CONTEXT` action that pushes the open file (with its token cost) straight into the LLM context window.

- Header actions are now repository-global: removed file-dependent dead-end buttons (AI Playground, External Deep-Link Studio, Open on GitHub, Copy Raw) from the top header — those live in the inline file view toolbar. AGENTS.md directives auto-draft a starter template when none exist, the workflow diagram resolves CI/CD files or falls back to a generated repo map, and Compile Spec to Code auto-selects the repo's primary spec.

### Security
- **URL safety perimeter** — new `src/lib/url-safety.ts` centralises scheme allow-listing (`http`, `https`, `mailto`, `tel`); markdown links are now sanitised through `safeHref` and images through `safeImageSrc`, blocking `javascript:`/`data:` payloads embedded in untrusted specs.
- **PAT exfiltration guard** — the GitHub token is only ever attached to `raw.githubusercontent.com` requests; any other image host renders without credentials.
- **CLI Bridge lockdown** — the local daemon URL is validated as loopback-only on read, write, and every request, preventing a crafted bridge URL from shipping repo contents to a remote host.
- **API Sandbox protocol check** — requests are restricted to `http(s)` endpoints.

### Changed
- **Cache hygiene** — GitHub ETag cache entries expire after 24h and prune themselves under storage pressure; the Mermaid SVG cache is now a bounded LRU (40 entries) instead of an unbounded map.
- **Dependency + dead-code sweep** — removed 37 unreferenced UI component files and 30 unused npm packages (Radix primitives, `recharts`, `zod`, `date-fns`, `react-hook-form`, `cmdk`, `vaul`, others), shrinking the install and client graph.
- **Search responsiveness** — the full-text query now runs on a deferred value so typing stays smooth on large repositories.

### Added
- **🔌 Local Workspace CLI Bridge** — optional `localhost:4321` daemon connection (`Alt+L`) that streams live `git status`/`git diff` into the dashboard, runs build/test/lint commands parsed from `AGENTS.md`, and writes generated Infinity Loop artifacts straight to disk. A `[ 🔌 LOCAL SYNC ]` header pill reports link state.
- **🎯 Text-Selection Action Bar** — highlight any text in a spec to get a floating toolbar: `⚡ Explain` (AI Playground), `🎒 Add to Pack` (token-budgeted context pack), `🌐 Test in External AI`, and `♾️ Refine` (seeds the Infinity Loop goal).
- **⚡ Prompt Preset Shelf** (`Alt+S`) — Mustache-templated saved prompts (`{{selection}}`, `{{file}}`, `{{repo}}`) with built-in edge-case, security-audit and test-scaffold presets, auto-filled from the open spec and launchable locally or into ChatGPT/Claude/Gemini/Kimi.

### Added
- **🛠️ Dev Tools command menu** in the header grouping four new control-center modules.
- **🌐 API Sandbox** — browser-native REST client (GET/POST/PUT/PATCH/DELETE) with OpenAPI/Swagger endpoint auto-discovery, URL scraping from the open spec, header injection (incl. 1-click PAT auth), JSON payload editing, and a syntax-highlighted response inspector.
- **🔐 .env & Secret Guard** — diffs `.env.example` against env keys referenced in code, flags hardcoded API keys/JWTs/private keys with masked values (`sk-****-1234`), and lists undeclared keys.
- **📦 Dependency Radar** — parses `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, and `pyproject.toml`; shows direct/dev/peer/optional counts, license families with copyleft warnings, and unpinned/pre-1.0/open-range risk flags.
- **📜 Release Changelog Studio** — groups recent commits into 🚀 Features / 🐛 Fixes / ⚡ Performance / ⚠️ Breaking Changes, suggests a semver bump from the latest tag, and emits release-ready Markdown with 1-click copy and a GitHub draft-release deep link.

### Added
- **♾️ Infinity Loop (self-improving spec engine):** new header entry point that aggregates every system-defining document in the repo (`constitution.md`, `AGENTS.md`/`.cursorrules`/`agents.txt`, `llms.txt`/`llms-full.txt`, `memory.md`/`history.md`/ADRs) into one weighted knowledge base, runs a 4-stage SDD chain (`/constitution+/agents` guardrail audit → `/specify` → `/plan` → `/tasks`), and dispatches results via a 1-click execution matrix — run any atomic task in the AI Playground, hand the full loop to ChatGPT/Claude/Gemini/Kimi, or commit `.specify/**` artifacts straight back to GitHub to feed the next iteration.
- **AI Context Tree:** directory rail and record table now show byte size plus estimated token count (`~1.2k tokens`) per file, per directory, and per repository.
- **Pack Context Window:** `Ctrl+K` search gains a `[ 🎒 PACK CONTEXT WINDOW ]` mode — multi-select specs, live `tokens / 200,000 (x%)` budget meter, and 1-click copy of the packed prompt for Claude Code, Cursor, or ChatGPT.
- **Spec Drift Inspector:** extracts non-negotiable rules from `AGENTS.md`, `constitution.md`, `.cursorrules` and `/docs/adr/*.md`, cross-references the last 10 commits' changed files, and flags `⚠️ Spec Drift Warning` violations with rule text, commit and author.
- **SDD Compiler:** `⚡ COMPILE SPEC TO SCAFFOLD` on `.specify/**.md` specs generates `tasks.md`, per-requirement `*.spec.ts` test skeletons, a 4-stage agent prompt chain, and 1-click Claude Code / Cursor / GitHub Copilot CLI commands.
- In-memory full-text search engine (MiniSearch) indexing file names, paths, headings, frontmatter tags and raw content, with fuzzy/prefix matching, highlighted line snippets and All/Specs/Agent Rules/Code Snippets filter tabs.
- Interactive code-block toolbar: Run in Playground (with `{{var}}` detection), Copy Command, Test in External AI; plus 1-click SKILL.md executable skill pills.
- Global keyboard shortcut engine (Ctrl+K, `?`, G-chord navigation, Alt+P/E/D/V/C/G, Ctrl+Enter) with a terminal-styled cheat-sheet overlay.

### Changed
- **Header restructured into a compact 3-zone command shell:** brand + 1-click repo switcher pill (left), consolidated `Ctrl+K` search bar with a live context-token badge (center), and collapsed dropdown command centers (right) — `⚡ Workbench` (AGENTS rules, AI Playground `Alt+P`, External Deep-Link Studio `Alt+E`, Visual Workflow Diagram `Alt+D`, Pack Context Window), `♾️ Build` (Infinity Loop, Compile Spec to Code, Spec Drift/ADRs, New Spec), plus a `•••` overflow drawer. Added a slim 28px sticky status sub-header with metadata pills (DB status, AGENTS.md active, constitution verified, context tokens, branch, active file) and responsive collapse of utility icons on small screens.
- README / How It Works center rewritten to document the new search, snippet and hotkey systems.
### Added
- **Dataset Inspector:** `.csv`, `.tsv`, `.jsonl`/`.ndjson`/`.eval`, and array-shaped `.json` files in data/eval/benchmark dirs are indexed and open in a virtual data grid — global row search, click-to-sort column headers, `VIEWING x-y OF n ROWS` badge, pagination with rows-per-page, `📥 EXPORT CSV` / `📋 COPY JSON`, and auto prompt/completion pair cards with eval score badges.
- **Changelog Timeline:** Dedicated `/changelog` route parsing root `CHANGELOG.md` into version/date badges and category-tagged timeline blocks, linked from the header.
- **Dynamic Tab Titles:** `document.title` now tracks the active repo, folder, and file (`📄 file.md — SPEC DASH`).
- **Shareable Deep Links:** `🔗 SHARE` copies `/?repo={owner}/{repo}&path={file}`; direct loads restore the repo, folder, and open spec.
- **AI Operating System Detector:** Auto-detects root `AGENTS.md`, `llms.txt`, `agents.txt`, `.cursorrules` (plus `CLAUDE.md`/`CURSOR.md`), renders a `[ 🤖 AI OPERATING SYSTEM DETECTED ]` banner, a sticky nav pill, and a side panel parsing agent boundaries, style guides, and 1-click `📋 COPY COMMAND` build/test commands.
- **Zero-Cost External AI Deep-Links:** New `[ 🌐 OPEN IN EXTERNAL AI ▾ ]` menu in the Spec Viewer AI bar and Playground launches ChatGPT, Claude, Gemini, or Kimi with the formatted spec payload — clipboard-backed, URL-prefilled where supported, and requiring no paid API key.
- **Agent Workflow Visualizer:** `.github/workflows/*.yml` and LangGraph/CrewAI/AutoGen YAML+JSON configs are now indexed and auto-compiled into Mermaid agent graphs, with role icons (🤖 router, ⚡ executor, 🔍 evaluator, 💾 storage). Diagrams (including in-markdown ```mermaid blocks) render on an interactive canvas with zoom `+ / − / RESET`, drag-pan, `⛶ EXPAND` fullscreen, node-click pathway tracing, and a `📊 VISUAL | 💻 RAW CODE` toggle.

### Fixed
- **Diagram Canvas Stability:** Mermaid now compiles once per unique source (module-level SVG cache) instead of re-rendering on every interaction; pan/zoom mutate a CSS transform on a wrapper via refs and pointer capture (no React re-renders, `touch-action: none`, no text selection); `⛶ EXPAND`, `📊 VISUAL | 💻 RAW CODE`, and parent re-renders are now CSS toggles that keep the canvas mounted and retain zoom level and pan coordinates.
- **Broken GitHub Permalinks:** Permalinks used the blob SHA (404). Links now use the head commit SHA with strict `blob/{ref}/{path}` and `tree/{ref}/{path}` formation, slash normalization, and per-segment URL encoding.

### Changed
- **Rebrand to SPEC DASH:** Replaced all SANDBOX branding across metadata, navbar, README modal, and console banner (`[ SPEC_DASH // GITHUB_AS_A_DATABASE ]`); new ⚡ SVG favicon and OpenGraph/Twitter social cards for `https://specdash.lovable.app`.

## [1.2.0] - 2026-07-27
### Added
- **Token Payload Budgeting:** Client-side prompt truncation preventing `AI_ERR 413` token limit overflow errors on Groq/LLaMA.
- **Single-File AI Scope:** Restricted `[SUMMARIZE]`, `[CRITIQUE]`, and `[ACTION_ITEMS]` strictly to active `.md` file content.
- **Cross-Platform Responsiveness:** Layout scaling across Mobile (<640px), Tablet, Desktop, and Ultra-Wide displays.

### Fixed
- **Markdown 404 Links:** Added relative link interceptor to resolve `./` and `../` paths internally without page reloads.

## [1.1.0] - 2026-07-25
### Added
- **GitHub Deep-Linking:** Direct navigation toolbar (`[ VIEW ON GITHUB ↗ ]`) and permalinks for files and folders.
- **GitHub Web Intent Commits:** Native redirected pre-filled commit creation/editing without OAuth scopes.
- **Advanced AI Repo Standards:** Automatic detection and parsing for `AGENTS.md`, `llms.txt`, and interactive prompt workbench.

## [1.0.0] - 2026-07-20
### Added
- **Dynamic Repo Discovery:** Single-call recursive GitHub tree search (`/git/trees?recursive=1`) filtering for `.md` files.
- **GitHub PAT Authentication:** Optional token connection unlocking 5,000 reqs/hr and private repo support.
- **Zero-Cost ETag Caching:** Integrated `If-None-Match` HTTP 304 cache layer and raw CDN markdown fetching.
- **Client-Side Multi-LLM Engine:** Multi-provider API support (Groq, OpenAI, Claude, Gemini) stored locally.
- **Semantic Command Bar:** Global `Ctrl+K` prompt assistant searching repo context.
