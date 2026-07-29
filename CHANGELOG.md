# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
