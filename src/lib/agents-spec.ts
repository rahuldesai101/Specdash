/** Detection + parsing of open AI repo standards at the repository root. */

export const ROOT_SPEC_NAMES = ["agents.md", "llms.txt", "agents.txt", ".cursorrules"] as const;

export type RootSpec = { path: string; name: string };

/** Scan a flat list of repo paths for root-level AI standard files. */
export function detectRootSpecs(paths: string[]): RootSpec[] {
  const found = paths.filter((p) => !p.includes("/") && ROOT_SPEC_NAMES.includes(p.toLowerCase() as never));
  return found
    .map((p) => ({ path: p, name: p }))
    .sort(
      (a, b) =>
        ROOT_SPEC_NAMES.indexOf(a.name.toLowerCase() as never) -
        ROOT_SPEC_NAMES.indexOf(b.name.toLowerCase() as never),
    );
}

export type SpecSection = { title: string; body: string; bullets: string[] };

export type AgentSpec = {
  title: string | null;
  intro: string;
  sections: SpecSection[];
  boundaries: SpecSection[];
  styleGuides: SpecSection[];
  commands: string[];
};

const BOUNDARY_RE =
  /(boundar|scope|permission|allowed|forbidden|do not|don't|never|restrict|guardrail|safety|rules|constraint|ownership)/i;
const STYLE_RE =
  /(style|format|convention|lint|naming|commit|pr |pull request|structure|architecture|code quality|standard)/i;

const CMD_RE =
  /^(npm|npx|pnpm|yarn|bun|bunx|node|deno|python|python3|pip|pytest|poetry|uv|cargo|go|rustc|make|just|docker|docker-compose|kubectl|terraform|git|gh|dotnet|mvn|gradle|composer|php|rails|bundle|rake|swift|flutter|dart|tsc|vite|jest|vitest|eslint|prettier|ruff|black|mypy|tox)\b/;

/** Extract runnable one-line commands from fenced code blocks. */
function extractCommands(md: string): string[] {
  const out: string[] = [];
  const fence = /```([\w.+-]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(md))) {
    const lang = (m[1] || "").toLowerCase();
    if (lang && !["", "sh", "bash", "shell", "zsh", "console", "terminal", "text"].includes(lang)) continue;
    for (const raw of m[2].split("\n")) {
      const line = raw.trim().replace(/^[$>]\s*/, "");
      if (!line || line.startsWith("#")) continue;
      if (line.length > 160) continue;
      if (!CMD_RE.test(line)) continue;
      if (!out.includes(line)) out.push(line);
    }
  }
  // inline `code` commands as a fallback
  if (out.length < 3) {
    for (const im of md.matchAll(/`([^`\n]{3,120})`/g)) {
      const line = im[1].trim().replace(/^[$>]\s*/, "");
      if (CMD_RE.test(line) && line.includes(" ") && !out.includes(line)) out.push(line);
    }
  }
  return out.slice(0, 24);
}

function bulletsOf(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^([-*+]|\d+\.)\s+/.test(l))
    .map((l) => l.replace(/^([-*+]|\d+\.)\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Parse AGENTS.md / llms.txt style markdown into structured directives. */
export function parseAgentSpec(md: string): AgentSpec {
  const text = (md ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  let title: string | null = null;
  const sections: SpecSection[] = [];
  let current: { title: string; lines: string[] } | null = null;
  const introLines: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h = !inFence ? /^(#{1,4})\s+(.*)$/.exec(line) : null;
    if (h) {
      const level = h[1].length;
      const heading = h[2].trim();
      if (level === 1 && !title && sections.length === 0) {
        title = heading;
        continue;
      }
      if (current) sections.push({ title: current.title, body: current.lines.join("\n").trim(), bullets: [] });
      current = { title: heading, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else if (line.trim()) introLines.push(line);
  }
  if (current) sections.push({ title: current.title, body: current.lines.join("\n").trim(), bullets: [] });

  for (const s of sections) s.bullets = bulletsOf(s.body);

  const matches = (re: RegExp) => sections.filter((s) => re.test(s.title) || re.test(s.body.slice(0, 400)));

  return {
    title,
    intro: introLines.join("\n").trim().slice(0, 600),
    sections,
    boundaries: matches(BOUNDARY_RE).slice(0, 6),
    styleGuides: matches(STYLE_RE).slice(0, 6),
    commands: extractCommands(text),
  };
}
