## Goal
Replace the current project contents with the uploaded `Specdash-main` codebase and get it running in preview.

## Steps

1. **Extract archive** to a temp directory (already done at `/tmp/specdash/Specdash-main/`). No `.git` metadata present.
2. **Wipe current app source** to avoid stale files: remove `src/`, `public/`, top-level configs (`package.json`, `bun.lock`, `bunfig.toml`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `components.json`, `.prettierrc`, `.prettierignore`, `.gitignore`, `AGENTS.md`, `README.md`).
3. **Copy Specdash files** into the project via `rsync --exclude='.git' --exclude='.lovable'` so the project's Lovable identity (`.lovable/project.json`) is preserved.
4. **Install dependencies** with `bun install` (dev server auto-restarts).
5. **Verify** the app runs: poll `http://localhost:8080/`, check dev-server logs for errors, screenshot with Playwright if needed.
6. **Report** the preview URL and any issues.

## Notes
- Both projects target TanStack Start v1 + Vite + Tailwind v4, so tooling is compatible.
- Keeping `.lovable/` preserves the preview URL / project ID.
- No content changes to Specdash code planned — running as-is.
