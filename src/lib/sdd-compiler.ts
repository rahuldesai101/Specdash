/**
 * Spec-Driven Development compiler: turns a `.specify/` spec.md into an
 * executable scaffold (tasks.md, test skeletons, agent prompt chains, CLI cmds).
 */

export function isSpecifyPath(path: string): boolean {
  return /(^|\/)\.specify\//i.test(path) && /\.md$/i.test(path);
}

export type SpecRequirement = { id: string; title: string; section: string; acceptance: string[] };

export type Scaffold = {
  slug: string;
  title: string;
  requirements: SpecRequirement[];
  tasksMd: string;
  testFiles: { path: string; code: string }[];
  promptChain: { step: number; role: string; prompt: string }[];
  commands: { label: string; cmd: string }[];
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "spec";

const camel = (s: string) => slugify(s).replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

function parseSpec(md: string): { title: string; reqs: SpecRequirement[] } {
  const text = (md ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let title = "Untitled Spec";
  let section = "General";
  const reqs: SpecRequirement[] = [];
  let inFence = false;
  let i = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = /^(#{1,4})\s+(.+)$/.exec(line);
    if (h) {
      const heading = h[2].replace(/[*_`]/g, "").trim();
      if (h[1].length === 1 && title === "Untitled Spec") title = heading;
      else section = heading;
      continue;
    }
    const bullet = /^([-*+]|\d+\.)\s+(?:\[[ xX]\]\s*)?(.+)$/.exec(line);
    const body = bullet?.[2]?.trim();
    if (!body || body.length < 8) continue;
    if (!/\b(must|should|shall|support|provide|allow|render|expose|return|handle|validate|generate|store|display|add)\b/i.test(body))
      continue;
    reqs.push({
      id: `REQ-${String(++i).padStart(3, "0")}`,
      title: body.replace(/[*_`]/g, "").slice(0, 160),
      section,
      acceptance: [`GIVEN the system is running`, `WHEN the behaviour is exercised`, `THEN ${body.replace(/[*_`]/g, "").slice(0, 120)}`],
    });
  }
  return { title, reqs: reqs.slice(0, 40) };
}

/** Compiles a spec document into an atomic, executable build scaffold. */
export function compileSpec(path: string, md: string): Scaffold {
  const { title, reqs } = parseSpec(md);
  const slug = slugify(title);

  const tasksMd = [
    `# tasks.md — ${title}`,
    ``,
    `> Compiled from \`${path}\` by SPEC DASH // SDD_COMPILER`,
    ``,
    `## Atomic Tasks`,
    ``,
    ...reqs.flatMap((r) => [
      `- [ ] **${r.id}** (${r.section}) — ${r.title}`,
      `  - [ ] write failing test \`tests/${slug}/${slugify(r.title).slice(0, 32)}.spec.ts\``,
      `  - [ ] implement minimal code to pass`,
      `  - [ ] refactor + update docs`,
    ]),
    ``,
    `## Definition of Done`,
    ``,
    `- [ ] All ${reqs.length} requirement tests green`,
    `- [ ] No rule violations against AGENTS.md / constitution.md`,
    `- [ ] CHANGELOG.md updated`,
    ``,
  ].join("\n");

  const testFiles = reqs.slice(0, 12).map((r) => ({
    path: `tests/${slug}/${slugify(r.title).slice(0, 32)}.spec.ts`,
    code: [
      `import { describe, it, expect } from "vitest";`,
      ``,
      `// ${r.id} — ${r.title}`,
      `describe("${r.section}", () => {`,
      `  it("${r.title.replace(/"/g, "'").slice(0, 100)}", () => {`,
      `    // ${r.acceptance.join("\n    // ")}`,
      `    expect.fail("NOT_IMPLEMENTED: ${r.id}");`,
      `  });`,
      `});`,
      ``,
    ].join("\n"),
  }));

  const promptChain = [
    {
      step: 1,
      role: "PLANNER",
      prompt: `Read the spec at ${path}. Produce an implementation plan covering all ${reqs.length} requirements (${reqs
        .map((r) => r.id)
        .join(", ")}). Do not write code yet. Flag ambiguities as OPEN_QUESTION.`,
    },
    {
      step: 2,
      role: "TEST_AUTHOR",
      prompt: `Using the plan, write failing tests only, one file per requirement, under tests/${slug}/. Use the GIVEN/WHEN/THEN acceptance criteria from the spec. Do not implement production code.`,
    },
    {
      step: 3,
      role: "IMPLEMENTER",
      prompt: `Make the failing tests in tests/${slug}/ pass with the smallest possible change set. Respect every rule in AGENTS.md and docs/adr/*.md. Stop after each requirement and report the ${"REQ"} id you closed.`,
    },
    {
      step: 4,
      role: "REVIEWER",
      prompt: `Review the diff against ${path}. Report any spec drift, missing acceptance criteria, or architectural violations as a checklist. Then update tasks.md and CHANGELOG.md.`,
    },
  ];

  const commands = [
    { label: "CLAUDE CODE", cmd: `claude "implement the spec at ${path} following tasks.md; run tests after each task"` },
    { label: "CURSOR", cmd: `cursor --goto ${path} && echo "@${path} @tasks.md implement ${camel(title)} test-first"` },
    { label: "GH COPILOT", cmd: `gh copilot suggest "scaffold tests and implementation for ${path}"` },
    { label: "SCAFFOLD DIRS", cmd: `mkdir -p tests/${slug} && touch tasks.md` },
    { label: "RUN TESTS", cmd: `npx vitest run tests/${slug}` },
  ];

  return { slug, title, requirements: reqs, tasksMd, testFiles, promptChain, commands };
}