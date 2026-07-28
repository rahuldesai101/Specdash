# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Added
- **Changelog Timeline:** Dedicated `/changelog` route parsing root `CHANGELOG.md` into version/date badges and category-tagged timeline blocks, linked from the header.
- **Dynamic Tab Titles:** `document.title` now tracks the active repo, folder, and file (`📄 file.md — SPEC DASH`).
- **Shareable Deep Links:** `🔗 SHARE` copies `/?repo={owner}/{repo}&path={file}`; direct loads restore the repo, folder, and open spec.
- **AI Operating System Detector:** Auto-detects root `AGENTS.md`, `llms.txt`, `agents.txt`, `.cursorrules` (plus `CLAUDE.md`/`CURSOR.md`), renders a `[ 🤖 AI OPERATING SYSTEM DETECTED ]` banner, a sticky nav pill, and a side panel parsing agent boundaries, style guides, and 1-click `📋 COPY COMMAND` build/test commands.
- **Zero-Cost External AI Deep-Links:** New `[ 🌐 OPEN IN EXTERNAL AI ▾ ]` menu in the Spec Viewer AI bar and Playground launches ChatGPT, Claude, Gemini, or Kimi with the formatted spec payload — clipboard-backed, URL-prefilled where supported, and requiring no paid API key.
- **Agent Workflow Visualizer:** `.github/workflows/*.yml` and LangGraph/CrewAI/AutoGen YAML+JSON configs are now indexed and auto-compiled into Mermaid agent graphs, with role icons (🤖 router, ⚡ executor, 🔍 evaluator, 💾 storage). Diagrams (including in-markdown ```mermaid blocks) render on an interactive canvas with zoom `+ / − / RESET`, drag-pan, `⛶ EXPAND` fullscreen, node-click pathway tracing, and a `📊 VISUAL | 💻 RAW CODE` toggle.

### Fixed
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
