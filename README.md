<div align="center">
<pre>
 ██████╗  █████╗ ███╗   ██╗██████╗ ██████╗  ██████╗ ██╗  ██╗
██╔════╝ ██╔══██╗████╗  ██║██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝
╚█████╗  ███████║██╔██╗ ██║██║  ██║██████╔╝██║   ██║ ╚███╔╝ 
 ╚═══██╗ ██╔══██║██║╚██╗██║██║  ██║██╔══██╗██║   ██║ ██╔██╗ 
██████╔╝ ██║  ██║██║ ╚████║██████╔╝██████╔╝╚██████╔╝██╔╝ ██╗
╚═════╝  ╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
 [ R&D_EXPERIMENTATION_SYSTEM // GITHUB_AS_A_DATABASE ]
</pre>
</div>

---
<div align="center">

# ⚡ SPEC-DASH | Dynamic AI Knowledge & Repo Dashboard

**An ultra-fast, zero-cost, brutalist control center for AI-native GitHub repositories.**  
*Transform markdown specs, `AGENTS.md` operating manuals, and prompt libraries into interactive, LLM-powered workspaces.*

---
[![Created by Rahul Desai](https://img.shields.io/badge/Created_by-Rahul_Desai-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/rahuldesai101)
[![License: MIT](https://img.shields.io/badge/License-MIT-000000.svg?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![GitHub API Quota](https://img.shields.io/badge/GitHub_API-5000_reqs%2Fhr-000000.svg?style=for-the-badge&logo=github&logoColor=white)](#-rate-limit--performance-architecture)
[![Rate Limit Cost](https://img.shields.io/badge/Cache_Cost-0_Tokens_(304_ETag)-000000.svg?style=for-the-badge&logo=fastapi&logoColor=white)](#-rate-limit--performance-architecture)
[![Groq LLaMA-3.3](https://img.shields.io/badge/AI_Engine-LLaMA--3.3--70B-000000.svg?style=for-the-badge&logo=groq&logoColor=white)](#-multi-llm-architecture)
[![Mobile & TV Responsive](https://img.shields.io/badge/Viewport-Mobile_%7C_Tablet_%7C_Desktop_%7C_TV-000000.svg?style=for-the-badge&logo=responsive&logoColor=white)](#-responsive-viewport-support)

</div>

---

## 🧭 System Architecture & Data Flow

```text
[ GITHUB REPOSITORY ]
         │
         ├──► GET /git/trees?recursive=1  ────► [ Local ETag / 304 Cache Engine ]
         │                                               │ (0 API Rate Limit Cost)
         ├──► GET raw.githubusercontent.com ──────────────┤
         │                                               ▼
         │                                    [ SPEC-DASH PARSER ENGINE ]
         │                                               │
         │         ┌─────────────────────────────────────┼─────────────────────────────────────┐
         │         ▼                                     ▼                                     ▼
         │  [ AGENTS.md / llms.txt ]             [ DYNAMIC TAB ROUTER ]              [ PROMPT WORKBENCH ]
         │  Parses AI boundaries &               Groups `.md` specs by               Extracts `{{vars}}` for
         │  build commands                       parent directory                    instant execution
         │                                               │
         └───────────────────────────────────────────────┼─────────────────────────────────────┘
                                                         │
                                                         ▼
                                             [ SPEC VIEWER & EDITOR ]
                                                         │
                                                         ├──► [ In-Viewer AI Assistant ] (Active File Only)
                                                         ├──► [ Relative Link Interceptor ] (Fixes 404s)
                                                         └──► [ Web Intent Commit Generator ] (GitHub Redirect)

```

---

## ⚡ Core Capabilities & Features Matrix

| Feature Module | Capability Description | Primary Benefit |
| --- | --- | --- |
| **Dynamic Repo Discovery** | Single-call recursive scanning (`/git/trees?recursive=1`) filtering for `.md` files. | Zero manual path setup; auto-indexes any public/private repository. |
| **ETag 304 Caching** | Tracks `ETag` headers in local key-value store; uses `If-None-Match`. | Reduces REST API token consumption by up to **98%**. |
| **Raw CDN Bypassing** | Reads markdown text directly via `raw.githubusercontent.com`. | **0 API Call Cost** for file reading operations. |
| **`AGENTS.md` Directives** | Automatically parses root `AGENTS.md` and `llms.txt` standards. | Instant visibility into repository AI rules and build boundaries. |
| **Token-Budgeted AI** | Client-side truncation utility capping payloads under **2,500 tokens**. | Completely eliminates Groq/LLaMA `AI_ERR 413` token limit errors. |
| **Single-File AI Scope** | Restricts `[SUMMARIZE]`, `[CRITIQUE]`, and `[ACTION_ITEMS]` to active file. | Zero hallucination from surrounding repository noise. |
| **Web Intent Commits** | Pre-fills file edits via GitHub's native web editor URL structure. | Safe client-side file editing without storing write-scoped OAuth tokens. |
| **Relative Link Resolver** | Intercepts `./` and `../` markdown links and maps them internally. | Prevents local 404 router crashes when navigating specs. |

---

## 📊 Rate Limit & Performance Architecture

```text
 standard GitHub REST API
 ├── /repos/owner/repo/contents/file1.md  (Cost: 1 req)
 ├── /repos/owner/repo/contents/file2.md  (Cost: 1 req)
 └── /repos/owner/repo/contents/file3.md  (Cost: 1 req)  ──► 🪦 Rapid Quota Depletion (60/hr or 5000/hr)

 SPEC-DASH Zero-Cost Architecture
 ├── GET /git/trees?recursive=1 + [ETag]  (Cost: 0 req if 304 Not Modified)
 └── GET [raw.githubusercontent.com/](https://raw.githubusercontent.com/)...     (Cost: 0 req - Hits Global CDN)  ──► ⚡ Infinite Usability

```

---

## 🤖 Multi-LLM Architecture

SPEC-DASH operates strictly client-side using user-supplied API keys stored securely in browser `localStorage`. No private keys or proprietary data ever touch a middleman server.

* **Supported Providers:**
* **Groq** (`llama-3.3-70b-versatile` - Ultra fast)
* **OpenAI** (`gpt-4o` / `gpt-4o-mini`)
* **Anthropic** (`claude-3-5-sonnet`)
* **Google Gemini** (`gemini-1.5-pro`)



---

## 📱 Responsive Viewport Support

```text
┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
│ Mobile (<640px)           │ Tablet (640px - 1024px)   │ Desktop & TV (>1024px)    │
├───────────────────────────┼───────────────────────────┼───────────────────────────┤
│ • Slide-over drawer       │ • Dual-pane view          │ • 3-Column Resizable      │
│ • Full-screen reader      │ • Collapsible icon rail   │ • Interactive Breadcrumbs │
│ • Touch-friendly (44px)   │ • Tabbed List/Reader      │ • Sticky AI Action Bar    │
└───────────────────────────┴───────────────────────────┴───────────────────────────┘

```

---

## 🚀 Quickstart & Setup Guide

### Prerequisites

* **Node.js** `>= 18.0.0`
* **npm** or **pnpm**
* A GitHub Personal Access Token (PAT) *(Optional, increases rate limits from 60 to 5,000 reqs/hr)*

### 1. Clone the Repository

```bash
git clone [https://github.com/your-username/spec-dash.git](https://github.com/your-username/spec-dash.git)
cd spec-dash

```

### 2. Install Dependencies

```bash
npm install

```

### 3. Run Development Server

```bash
npm run dev

```

Open `http://localhost:5173` in your browser.

### 4. Build for Production

```bash
npm run build

```

---

## 📜 Repository Changelog Timeline

All major feature additions, critical bug fixes, and architectural optimizations are tracked in our structured `CHANGELOG.md`.

* **`v1.2.0`** — Token Payload Budgeting (Fixes `AI_ERR 413`), Single-File AI Scope, Cross-Platform Responsive Layouts.
* **`v1.1.0`** — GitHub Deep-Linking, Web Intent Commits, `AGENTS.md` Detection, Relative Link Interceptor.
* **`v1.0.0`** — Dynamic Tree Discovery, PAT Auth, Zero-Cost ETag Caching, Multi-LLM Command Palette (`Ctrl+K`).

---

## 🔒 Security & Privacy Guarantees

* **Zero Middleman Servers:** SPEC-DASH is a 100% static client-side application.
* **Local Storage Credentials:** GitHub PATs and LLM API Keys reside exclusively in your browser's local storage (`localStorage`).
* **Web Intent Delegation:** File edits write directly to GitHub via pre-filled URLs, eliminating the need to store write-permission tokens in browser memory.

---

**Built for developers, AI agent engineers, and specification authors.**

Distributed under the [MIT License](https://github.com/rahuldesai101/sandbox/blob/main/LICENSE).
