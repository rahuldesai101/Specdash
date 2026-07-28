# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Added
- **Changelog Timeline:** Dedicated `/changelog` route parsing root `CHANGELOG.md` into version/date badges and category-tagged timeline blocks, linked from the header.
- **Dynamic Tab Titles:** `document.title` now tracks the active repo, folder, and file (`📄 file.md — SPEC DASH`).

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
