/** Client-side prompt budgeting. ~4 chars ≈ 1 token. */

export const DEFAULT_BUDGET = 10_000;

export class TokenLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenLimitError";
  }
}

const NOTICE = "\n\n[... Middle content truncated for performance ...]\n\n";

/** Hard-caps a payload, keeping the head and tail of the document. */
export function truncateToTokenBudget(text: string, maxChars: number = DEFAULT_BUDGET): string {
  const t = text ?? "";
  if (t.length <= maxChars) return t;
  const head = Math.max(1, Math.round(maxChars * 0.625)); // 5000 @ 10k
  const tail = Math.max(1, maxChars - head - NOTICE.length); // 3000-ish @ 10k
  return t.slice(0, head) + NOTICE + t.slice(t.length - tail);
}

export function approxTokens(text: string) {
  return Math.ceil((text?.length ?? 0) / 4);
}

export type ManifestRecord = { path: string; dir: string; excerpt?: string };

/** Extracts markdown headings only — no code blocks, tables or body prose. */
export function extractHeadings(md: string, max = 8): string[] {
  if (!md) return [];
  const out: string[] = [];
  let inFence = false;
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```") || line.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,4})\s+(.+)$/.exec(line);
    if (m) {
      const title = m[2].replace(/[*_`]/g, "").trim().slice(0, 80);
      if (title) out.push(title);
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Slim `path | folder | headings` manifest for global semantic search. */
export function buildRepoManifest(records: ManifestRecord[], maxChars: number = DEFAULT_BUDGET): string {
  const lines = records.map((r) => {
    const h = extractHeadings(r.excerpt ?? "");
    return `${r.path} | ${r.dir}${h.length ? ` | ${h.join(" ; ")}` : ""}`;
  });
  let out = "";
  for (const l of lines) {
    if (out.length + l.length + 1 > maxChars) break;
    out += l + "\n";
  }
  return out.trim();
}
