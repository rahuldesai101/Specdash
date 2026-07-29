/**
 * Context budgeting: token estimation + multi-file prompt packing for
 * Claude Code / Cursor / ChatGPT.
 */

export const CONTEXT_WINDOW = 200_000;

/** ~4 chars per token heuristic. */
export function tokensOf(text: string | undefined | null): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

/** Token estimate from a raw byte size (no content fetched yet). */
export function tokensFromBytes(bytes: number): number {
  return Math.ceil(bytes / 4);
}

export function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function fmtBytes(b: number): string {
  return b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
}

export type PackTarget = "claude" | "cursor" | "chatgpt";

export const PACK_TARGETS: { id: PackTarget; label: string }[] = [
  { id: "claude", label: "CLAUDE CODE" },
  { id: "cursor", label: "CURSOR" },
  { id: "chatgpt", label: "CHATGPT" },
];

export type PackFile = { path: string; content: string };

const HEADER: Record<PackTarget, (repo: string, n: number) => string> = {
  claude: (repo, n) =>
    `<context repo="${repo}" files="${n}">\nThe following ${n} repository files are the authoritative context. Follow every rule they define.`,
  cursor: (repo, n) => `# Repo context — ${repo} (${n} files)\n@-referenced files are inlined below.`,
  chatgpt: (repo, n) =>
    `You are given ${n} files from the GitHub repository ${repo}. Use only this content as ground truth.`,
};

/** Builds a single packed prompt payload for the chosen agent target. */
export function packContext(target: PackTarget, repo: string, files: PackFile[]): string {
  const body = files
    .map((f) => {
      if (target === "claude") {
        return `<file path="${f.path}">\n${f.content}\n</file>`;
      }
      const lang = f.path.split(".").pop() ?? "text";
      return `### FILE: ${f.path}\n\`\`\`${lang}\n${f.content}\n\`\`\``;
    })
    .join("\n\n");
  const head = HEADER[target](repo, files.length);
  const tail = target === "claude" ? "\n</context>" : "";
  return `${head}\n\n${body}${tail}\n`;
}