import { detectVariables } from "@/lib/search-index";

export type Skill = { label: string; body: string; lang: string };

/**
 * Parses SKILL.md-style frontmatter for executable commands / prompt skills:
 *   commands: [ "npm test", "npm run lint" ]
 *   skills:
 *     - name: refactor
 *       prompt: Refactor {{file}} for clarity
 */
export function parseSkills(md: string): Skill[] {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md)?.[1];
  if (!fm) return [];
  const out: Skill[] = [];

  const inline = /commands?:\s*\[([^\]]*)\]/i.exec(fm)?.[1];
  if (inline) {
    for (const c of inline.split(",")) {
      const v = c.replace(/["']/g, "").trim();
      if (v) out.push({ label: v, body: v, lang: "bash" });
    }
  }
  const block = /commands?:\s*\n((?:\s*-\s*.+\n?)+)/i.exec(fm)?.[1];
  if (block) {
    for (const l of block.split("\n")) {
      const v = l.replace(/^\s*-\s*/, "").replace(/^["']|["']$/g, "").trim();
      if (v) out.push({ label: v, body: v, lang: "bash" });
    }
  }
  const prompts = [...fm.matchAll(/prompt:\s*(.+)/gi)].map((m) => m[1].trim());
  const names = [...fm.matchAll(/name:\s*(.+)/gi)].map((m) => m[1].trim());
  prompts.forEach((p, i) => out.push({ label: names[i] ?? `SKILL_${i + 1}`, body: p, lang: "prompt" }));

  return out;
}

export function SkillPills({
  source,
  onRun,
}: {
  source: string;
  onRun?: (code: string, lang: string) => void;
}) {
  const skills = parseSkills(source);
  if (!skills.length) return null;
  return (
    <div className="mb-4 border border-[var(--t-amber)] p-3">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--t-amber)]">
        [ EXECUTABLE_SKILLS DETECTED — 1-CLICK TESTABLE ]
      </div>
      <div className="flex flex-wrap gap-2">
        {skills.map((s, i) => {
          const vars = detectVariables(s.body);
          return (
            <button
              key={i}
              onClick={() => onRun?.(s.body, s.lang)}
              disabled={!onRun}
              title={s.body}
              className="max-w-[320px] truncate border border-[var(--t-line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--t-fg-2)] hover:border-[var(--t-amber)] hover:text-[var(--t-amber)] disabled:opacity-40"
            >
              ⚡ {s.label}
              {vars.length > 0 && <span className="ml-1 text-[var(--t-dim-2)]">({vars.join(",")})</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}