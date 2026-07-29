/** Conventional-commit grouping + release markdown generation. */

export type Commit = {
  sha: string;
  message: string;
  body: string;
  author: string;
  date: string;
  url: string;
};

export type Category = "features" | "fixes" | "perf" | "breaking" | "docs" | "chore";

export const CATEGORY_META: Record<Category, { title: string; icon: string; tone: string }> = {
  breaking: { title: "Breaking Changes", icon: "⚠️", tone: "var(--t-red)" },
  features: { title: "Features", icon: "🚀", tone: "var(--t-green)" },
  fixes: { title: "Fixes", icon: "🐛", tone: "var(--t-amber)" },
  perf: { title: "Performance", icon: "⚡", tone: "var(--t-purple)" },
  docs: { title: "Docs", icon: "📚", tone: "var(--t-blue)" },
  chore: { title: "Chores & Internals", icon: "🧹", tone: "var(--t-dim)" },
};

export const CATEGORY_ORDER: Category[] = ["breaking", "features", "fixes", "perf", "docs", "chore"];

export function classify(c: Commit): Category {
  const head = c.message.trim();
  const all = `${head}\n${c.body}`;
  if (/^[a-z]+(\([^)]*\))?!:/i.test(head) || /BREAKING[ -]CHANGE/i.test(all)) return "breaking";
  const type = head.match(/^([a-z]+)(\([^)]*\))?:/i)?.[1]?.toLowerCase();
  if (type) {
    if (["feat", "feature"].includes(type)) return "features";
    if (["fix", "bugfix", "hotfix"].includes(type)) return "fixes";
    if (["perf", "performance"].includes(type)) return "perf";
    if (["docs", "doc"].includes(type)) return "docs";
    if (["chore", "refactor", "style", "test", "ci", "build", "revert"].includes(type)) return "chore";
  }
  if (/\b(add|added|introduce|implement|new)\b/i.test(head)) return "features";
  if (/\b(fix|fixed|resolve|patch|bug)\b/i.test(head)) return "fixes";
  if (/\b(optimi[sz]e|faster|speed|perf|cache)\b/i.test(head)) return "perf";
  if (/\b(docs?|readme|changelog)\b/i.test(head)) return "docs";
  return "chore";
}

export function cleanSubject(msg: string) {
  let s = msg.trim().split("\n")[0];
  s = s.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, "");
  s = s.replace(/\s*\(#(\d+)\)\s*$/, " (#$1)");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function groupCommits(commits: Commit[]) {
  const map = new Map<Category, Commit[]>();
  for (const c of commits) {
    const k = classify(c);
    map.set(k, [...(map.get(k) ?? []), c]);
  }
  return map;
}

export function buildReleaseMarkdown(opts: {
  repo: string;
  version: string;
  date: string;
  commits: Commit[];
  includeSha: boolean;
  includeAuthors: boolean;
  compareUrl?: string;
}) {
  const groups = groupCommits(opts.commits);
  const lines: string[] = [`## ${opts.version} — ${opts.date}`, ""];
  for (const cat of CATEGORY_ORDER) {
    const items = groups.get(cat);
    if (!items?.length) continue;
    const meta = CATEGORY_META[cat];
    lines.push(`### ${meta.icon} ${meta.title}`);
    for (const c of items) {
      const parts = [`- ${cleanSubject(c.message)}`];
      if (opts.includeSha) parts.push(`([\`${c.sha.slice(0, 7)}\`](${c.url}))`);
      if (opts.includeAuthors) parts.push(`— @${c.author}`);
      lines.push(parts.join(" "));
    }
    lines.push("");
  }
  const authors = [...new Set(opts.commits.map((c) => c.author))].filter(Boolean);
  if (authors.length) {
    lines.push(`### 👥 Contributors`, authors.map((a) => `@${a}`).join(", "), "");
  }
  if (opts.compareUrl) lines.push(`**Full changelog:** ${opts.compareUrl}`, "");
  return lines.join("\n").trim() + "\n";
}

export function suggestVersion(prev: string | null, commits: Commit[]) {
  const base = (prev ?? "v0.0.0").replace(/^v/, "");
  const [maj = 0, min = 0, pat = 0] = base.split(".").map((n) => parseInt(n, 10) || 0);
  const cats = commits.map(classify);
  if (cats.includes("breaking")) return `v${maj + 1}.0.0`;
  if (cats.includes("features")) return `v${maj}.${min + 1}.0`;
  return `v${maj}.${min}.${pat + 1}`;
}