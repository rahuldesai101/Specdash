/**
 * In-memory full-text search engine (MiniSearch).
 *
 * Documents are built from the repo tree: one doc per file, plus one doc per
 * fenced code block so snippets are independently searchable and runnable.
 */
import MiniSearch from "minisearch";

export type DocKind = "spec" | "agent" | "snippet" | "data";

export type SearchDoc = {
  id: string;
  path: string;
  dir: string;
  name: string;
  kind: DocKind;
  lang?: string;
  headings: string;
  tags: string;
  content: string;
};

export type FileMeta = { path: string; name: string; dir: string };

const AGENT_RE = /(^|\/)(agents\.md|agent\.md|claude\.md|llms\.txt|agents\.txt|\.cursorrules|skill\.md)$/i;
const DATA_RE = /\.(csv|tsv|jsonl|json|parquet|eval)$/i;

export function classify(path: string): DocKind {
  if (AGENT_RE.test(path.toLowerCase())) return "agent";
  if (DATA_RE.test(path)) return "data";
  return "spec";
}

export function extractHeadings(md: string): string[] {
  return (md.match(/^#{1,3}\s+.+$/gm) ?? []).map((h) => h.replace(/^#+\s+/, "").trim());
}

export function extractFrontmatterTags(md: string): string[] {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md)?.[1];
  const out: string[] = [];
  if (fm) {
    const inline = /tags?:\s*\[([^\]]*)\]/i.exec(fm)?.[1];
    if (inline) out.push(...inline.split(",").map((t) => t.replace(/["']/g, "").trim()));
    const block = /tags?:\s*\n((?:\s*-\s*.+\n?)+)/i.exec(fm)?.[1];
    if (block) out.push(...block.split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()));
  }
  out.push(...(md.match(/(?:^|\s)#[a-z0-9][a-z0-9-_]{1,30}/gi) ?? []).map((t) => t.trim()));
  return [...new Set(out.filter(Boolean))];
}

export type CodeSnippet = { lang: string; code: string; index: number };

export function extractCodeBlocks(md: string): CodeSnippet[] {
  const out: CodeSnippet[] = [];
  const re = /```([a-z0-9_+-]*)\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(md))) {
    const code = m[2].trim();
    if (code) out.push({ lang: (m[1] || "text").toLowerCase(), code, index: i++ });
  }
  return out;
}

/** Detects `{{variable}}` placeholders inside a snippet. */
export function detectVariables(code: string): string[] {
  return [...new Set((code.match(/\{\{\s*[\w.-]+\s*\}\}/g) ?? []).map((v) => v.replace(/[{}\s]/g, "")))];
}

export function buildDocs(files: FileMeta[], contents: Record<string, string>): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const f of files) {
    const raw = contents[f.path] ?? "";
    const kind = classify(f.path);
    const headings = extractHeadings(raw);
    const tags = extractFrontmatterTags(raw);
    docs.push({
      id: f.path,
      path: f.path,
      dir: f.dir,
      name: f.name,
      kind,
      headings: headings.join(" · "),
      tags: tags.join(" "),
      content: raw,
    });
    if (kind !== "data") {
      for (const b of extractCodeBlocks(raw)) {
        docs.push({
          id: `${f.path}#code-${b.index}`,
          path: f.path,
          dir: f.dir,
          name: `${f.name} › ${b.lang}`,
          kind: "snippet",
          lang: b.lang,
          headings: "",
          tags: b.lang,
          content: b.code,
        });
      }
    }
  }
  return docs;
}

export function createIndex(docs: SearchDoc[]): MiniSearch<SearchDoc> {
  const mini = new MiniSearch<SearchDoc>({
    fields: ["name", "path", "headings", "tags", "content"],
    storeFields: ["path", "dir", "name", "kind", "lang", "headings", "content"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { name: 4, path: 3, headings: 2.5, tags: 2 },
      combineWith: "AND",
    },
  });
  mini.addAll(docs);
  return mini;
}

export type Segment = { text: string; hit: boolean };

/** Picks the best matching line and splits it into highlight segments. */
export function snippetFor(content: string, terms: string[], max = 180): Segment[] {
  if (!content) return [];
  const lower = content.toLowerCase();
  const t = terms.map((x) => x.toLowerCase()).filter(Boolean);
  let at = -1;
  for (const term of t) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) at = 0;
  const start = Math.max(0, content.lastIndexOf("\n", at) + 1);
  let line = content.slice(start, start + max).split("\n")[0].trim();
  if (!line) line = content.slice(0, max).replace(/\n/g, " ").trim();
  if (!t.length) return [{ text: line, hit: false }];
  const re = new RegExp(`(${t.map(escapeRe).join("|")})`, "ig");
  return line
    .split(re)
    .filter(Boolean)
    .map((piece) => ({ text: piece, hit: t.includes(piece.toLowerCase()) }));
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}