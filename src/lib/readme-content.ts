export const README_CONTENT = `# ⚡ SPEC DASH // GITHUB_AS_A_DATABASE

A brutalist, terminal-styled reader and editor that turns any GitHub repository into a live markdown "database". Browse, search, read, edit, and pipe spec files into LLMs (Groq / OpenAI / Claude / Gemini) — all client-side, using your own API keys.

---

## 1. WHAT THIS APP IS

**Feature set:** AI Playground (spec-as-system-prompt chat), free-tier External Deep-Link Studio (ChatGPT / Claude / Gemini / Kimi), native AGENTS.md & llms.txt parser, dataset / eval file inspector, visual workflow renderer (Mermaid + YAML/JSON graphs), in-memory full-text search, and an interactive snippet / SKILL.md extractor.

\`\`\`text
[ GITHUB TREE ] -> [ ETAG CACHE ] -> [ RAW CDN CRAWL ] -> [ MINISEARCH INDEX (browser) ]
                                                   \\-> [ SNIPPET EXTRACTOR ] -> [ PLAYGROUND | EXTERNAL AI DEEP-LINK ]
\`\`\`

**Sandbox** is a zero-backend workspace for teams that treat markdown as source of truth (specs, ideas, research, agent prompts, playbooks). It:

- Points at any GitHub repo (public or private via PAT).
- Recursively indexes every \`.md\` file in the default branch.
- Renders them with a full markdown pipeline (GFM, mermaid diagrams, syntax highlighting, cross-links, images from the repo).
- Lets you **edit** files through GitHub's web editor (with automatic fork+PR fallback).
- Runs each spec through an **AI Assistant** for summarize / action-items / critique — or opens it as a **system prompt** in an interactive **Playground**.
- Ships a **Changelog Timeline** view built from \`CHANGELOG.md\`.

All state lives in your browser (\`localStorage\`) and in GitHub itself. There is no server database, no login, no telemetry.

---

## 2. ARCHITECTURE OVERVIEW

\`\`\`text
[ BROWSER (React + TanStack Start) ]
        │
        ├── GitHub REST API  ──► repo metadata, tree, file SHAs   (ETag cached)
        ├── raw.githubusercontent.com ──► markdown bodies         (CDN)
        ├── GitHub web editor URLs ──► edit / new-file intents    (fork + PR fallback)
        └── AI Gateways (Groq | OpenAI | Anthropic | Gemini) ──► streaming completions
\`\`\`

- **Framework**: TanStack Start v1 on Vite 7, React 19, Tailwind v4.
- **No server database**: GitHub *is* the database. \`github-db.ts\` wraps the REST + Raw CDN layer with ETag caching and rate-limit accounting.
- **AI is BYO-key**: keys are stored only in \`localStorage\`; requests go directly from your browser to the provider.
- **Deployment target**: Cloudflare Workers via TanStack Start's edge runtime.

---

## 3. FILE / FOLDER STRUCTURE

\`\`\`text
src/
├── routes/
│   ├── __root.tsx          Root shell: HTML, fonts, QueryClient, Toaster, error/404 boundaries
│   ├── index.tsx           Main workspace: rail + table + reader + top bar
│   └── changelog.tsx       Parsed CHANGELOG.md timeline view
├── components/
│   ├── ai/
│   │   ├── AiConfigDrawer.tsx    Provider + API key + model picker
│   │   ├── SpecPlayground.tsx    Chat with the open spec as SYSTEM prompt
│   │   └── ExternalAiMenu.tsx    Zero-cost deep-links into ChatGPT/Claude/Gemini/Kimi
├── components/search/
│   └── SearchModal.tsx           Ctrl+K in-memory full-text search (MiniSearch)
├── hooks/
│   └── use-search-index.ts       Background raw-CDN crawl + index rebuild
│   │   ├── SpecAssistant.tsx     Bottom drawer: SUMMARIZE / ACTIONS / CRITIQUE / PLAYGROUND
│   │   └── SpecPlayground.tsx    Full chat UI using the open md as SYSTEM prompt
│   ├── git/
│   │   └── NewSpecModal.tsx      Create new markdown via GitHub "new file" intent
│   ├── layout/
│   │   ├── ReadmeModal.tsx       This document
│   │   ├── ShortcutsModal.tsx    Keyboard reference (Ctrl+/)
│   │   └── SpecToc.tsx           Auto-generated table of contents
│   └── md/
│       ├── MarkdownView.tsx      react-markdown pipeline + link/image rewriting
│       ├── Mermaid.tsx           Lazy mermaid diagram renderer
│       └── RepoImage.tsx         Resolves relative images to raw.githubusercontent.com
├── lib/
│   ├── github-db.ts        REST + Raw fetchers, PAT storage, ETag cache, rate limits
│   ├── ai-engine.ts        Provider abstraction + streaming SSE parser
│   ├── token-budget.ts     Rough token counting + truncation
│   ├── git-intent.ts       Constructs github.com/edit + /new URLs
│   ├── changelog.ts        Parses Keep-a-Changelog into timeline entries
│   ├── path-resolve.ts     Resolves relative markdown/image links
│   └── readme-content.ts   This document (as a TS export)
└── styles.css              Tailwind v4 theme, JetBrains Mono, brutalist tokens
\`\`\`

---

## 4. USER FLOW (END TO END)

### Step 1 — Bind a repository
On first load the **[CFG]** drawer opens. Enter \`owner/repo\` (or a full GitHub URL). This writes \`activeOwner\` / \`activeRepo\` to \`localStorage\` and triggers a sync.

### Step 2 — (Optional) Connect a Personal Access Token
Click the red 🔴 **PAT** button. A token unlocks:
- Private repositories
- 5,000 req/hr instead of 60 req/hr
- Bypasses raw-CDN caching for freshly pushed commits

The PAT is stored only in \`localStorage\`, never sent anywhere but api.github.com.

### Step 3 — Sync the tree
On load (and via **[PULL]**), the app calls \`/repos/{o}/{r}/git/trees/{branch}?recursive=1\`, filters to \`.md\` blobs, and groups them by directory. The response is ETag-cached; a subsequent 304 shows \`[CACHE: 304]\` in green.

### Step 4 — Browse
- **Left rail**: directory list with per-folder counts. Click any folder to filter the center table.
- **Center table**: every markdown file in the active folder with size, read time, SHA, and quick actions.
- **AGENTS.md / llms.txt**: if present at repo root, it surfaces as a highlighted button in the rail.

### Step 5 — Read
Click any row → the **Reader** slides in:
- Full markdown (GFM tables, task lists, mermaid, code blocks with copy).
- Cross-links to other repo markdown files open in-app (no page reload).
- Relative images resolve through the raw CDN.
- Right-side auto-generated **Table of Contents** on \`xl\` screens.
- Header actions: **↗ GITHUB**, **✏️ EDIT**, **📋 RAW**, **🔗 PERMALINK** (uses file SHA for immutable link).

### Step 6 — Edit or Create
- **✏️ EDIT** → opens \`github.com/{o}/{r}/edit/{branch}/{path}\`. Read-only? GitHub auto-forks and drafts a PR.
- **+ NEW SPEC** → NewSpecModal picks folder + template (BLANK / IDEA / RESEARCH) and jumps to GitHub's "new file" screen with the body prefilled.

### Step 7 — Run AI over the spec
At the bottom of the reader:
- **🪄 SUMMARIZE** — 3-bullet executive summary.
- **📋 ACTION_ITEMS** — extracts every checkbox / TODO as a flat checklist.
- **⚡ CRITIQUE** — architectural flaws + risks, ranked.
- **🎮 RUN_AS_SYSTEM_PROMPT** — opens **SpecPlayground**: an interactive chat where the entire markdown file becomes the SYSTEM prompt and you can converse against it, reusing whichever provider you configured (Groq / OpenAI / Claude / Gemini).

All streaming happens over SSE directly from your browser to the provider. Large files are truncated to fit the model's token budget.

### Step 8 — Search everything (full-text)
**Ctrl+K** (⌘K) opens the **Search Modal**, backed by an in-memory **MiniSearch** index built in the browser:

- Indexed fields: \`fileName\`, \`filePath\`, \`headings\` (#, ##, ###), frontmatter \`tags\`, and full \`rawContent\`.
- Fuzzy + prefix matching ("auth" → Authentication, oauth_token, author).
- Matching lines are shown under each result with hit terms highlighted.
- Filter tabs: **[ All ] [ 📄 Specs ] [ 🤖 Agent Rules ] [ ⚡ Code Snippets ]**.
- Every fenced code block is indexed as its own snippet document — hitting Enter on a snippet result launches it in the Playground.
- File bodies stream in from the raw CDN in the background; the header shows index progress.

### Step 8b — Snippet & Skill builders
Hovering any code block in the reader reveals: **⚡ RUN IN PLAYGROUND** (with \`{{variable}}\` detection), **📋 COPY COMMAND**, and **🌐 TEST IN EXTERNAL AI**. SKILL.md-style frontmatter (\`commands:\` / \`prompt:\`) renders 1-click executable skill pills at the top of the spec.

### Step 9 — 📖 README
Any time you want this document again — top bar, left of the Search button.

---

## 5. TOP BAR REFERENCE (LEFT → RIGHT)

| Button | Purpose |
| --- | --- |
| ☰ / ◧ | Toggle nav rail (mobile / desktop) |
| 📖 README | Opens this document |
| 🔍 SEARCH ⌘K | Fuzzy command bar across all md files |
| + NEW SPEC | Create a new markdown file via GitHub intent |
| ⚡ AI CFG | Configure provider, key, model |
| 🟢 / 🔴 PAT | Manage GitHub Personal Access Token |
| ⌨ | Show keyboard shortcuts |
| 📜 CHANGELOG | Timeline view of the repo's CHANGELOG.md |

---

## 6. KEYBOARD CHEAT SHEET

### Global & navigation

| Key | Action |
| --- | --- |
| \`Ctrl/⌘ + K\` | Open full-text search |
| \`?\` or \`Ctrl/⌘ + /\` | Toggle keyboard shortcuts overlay |
| \`G\` then \`H\` | Home / repository root |
| \`G\` then \`P\` | AI Playground |
| \`G\` then \`R\` | README / How It Works |
| \`[\` / \`]\` | Toggle left rail / reader |
| \`Esc\` | Close any drawer, modal or reader |

### Spec viewer actions

| Key | Action |
| --- | --- |
| \`Alt + P\` | Open active spec in the AI Playground |
| \`Alt + E\` | Open the External AI deep-link studio |
| \`Alt + D\` | Toggle visual workflow / raw diagram source |
| \`Alt + V\` | Toggle side-by-side raw markdown |
| \`Alt + C\` | Copy raw file content |
| \`Alt + G\` | Open the active file on GitHub |

### AI Playground

| Key | Action |
| --- | --- |
| \`Ctrl/⌘ + Enter\` | Execute active prompt |
| \`Enter\` / \`Shift + Enter\` | Send / newline |

All hotkeys are suppressed while typing in inputs, textareas or editable regions.

---

## 7. DATA & PRIVACY

- **Nothing is stored server-side.** No accounts, no databases.
- **\`localStorage\` keys**: \`activeOwner\`, \`activeRepo\`, \`ghPat\`, \`aiConfig\` (provider + key + model).
- **Outbound traffic** goes only to: \`api.github.com\`, \`raw.githubusercontent.com\`, and the AI provider you configured.
- Clearing site data logs you out of everything instantly.

---

## 8. AI PROVIDERS

| Provider | Endpoint style | Notes |
| --- | --- | --- |
| **Groq** | OpenAI-compatible \`/chat/completions\` | Fastest streaming; free tier available |
| **OpenAI** | \`/v1/chat/completions\` | GPT-4o / GPT-4o-mini recommended |
| **Anthropic (Claude)** | \`/v1/messages\` | Uses \`anthropic-dangerous-direct-browser-access\` header |
| **Google (Gemini)** | \`/v1beta/models/{model}:streamGenerateContent\` | Server-Sent Events over SSE |

All four are unified behind \`streamBudgeted()\` in \`src/lib/ai-engine.ts\` so features like SUMMARIZE, CRITIQUE, and the Playground work identically across providers.

---

## 9. EXTENSIBILITY

- **Add a template**: extend \`TEMPLATES\` in \`src/lib/git-intent.ts\`.
- **Add an AI task**: append an entry to \`TASKS\` in \`src/components/ai/SpecAssistant.tsx\`.
- **Add a provider**: implement a new streaming adapter in \`src/lib/ai-engine.ts\`.
- **Custom markdown renderers**: extend the \`components\` map in \`MarkdownView.tsx\`.

---

## 10. TROUBLESHOOTING

| Symptom | Fix |
| --- | --- |
| \`API_QUOTA: 0/60\` | Connect a PAT to get 5,000/hr. |
| Private repo returns 404 | PAT missing or lacks \`repo\` scope. |
| Edit button opens a fork PR | Expected — you don't have write access. |
| AI shows \`TOO_LARGE\` | File exceeds model context. Split the spec or pick a larger-context model. |
| Mermaid diagram blank | Check the code fence uses \`mermaid\` as the language. |

---

_End of README — press \`Esc\` or click outside to close._
`;
