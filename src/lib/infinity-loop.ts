/**
 * INFINITY LOOP — self-improving spec engine.
 *
 * Aggregates every system-defining document in the repository
 * (constitution / agents / llms / memory) into one synthesized knowledge
 * payload, then drives a 4-stage SDD generation pipeline:
 *
 *   /guardrails  ->  /specify  ->  /plan  ->  /tasks
 *
 * Each stage receives the aggregated context plus the output of the
 * previous stage, so the loop compounds on itself every iteration.
 */
import { extractRules, type SpecRule } from "./spec-drift";
import { truncateToTokenBudget } from "./token-budget";
import { tokensOf } from "./context-pack";

/* ------------------------------------------------------------------ */
/* 1. MULTI-SPEC CONTEXT AGGREGATOR                                    */
/* ------------------------------------------------------------------ */

export type SpecSourceKind = "constitution" | "agents" | "llms" | "memory";

export type SpecSourceDef = {
  kind: SpecSourceKind;
  label: string;
  icon: string;
  color: string;
  /** Directive injected above this document in the synthesized payload. */
  directive: string;
  match: RegExp;
  /** Relative weight of the shared char budget. */
  weight: number;
};

export const SPEC_SOURCES: SpecSourceDef[] = [
  {
    kind: "constitution",
    label: "CONSTITUTION",
    icon: "⚖️",
    color: "var(--t-orange)",
    directive:
      "NON-NEGOTIABLE ARCHITECTURAL CONSTRAINTS. Any proposal violating these MUST be rejected or rewritten.",
    match: /(^|\/)(constitution|principles|architecture-rules)\.md$/i,
    weight: 3,
  },
  {
    kind: "agents",
    label: "AGENT_DIRECTIVES",
    icon: "🤖",
    color: "var(--t-green)",
    directive:
      "AGENT BOUNDARIES, EXECUTION RULES AND CODING STANDARDS. All generated work must comply.",
    match: /(^|\/)(agents\.md|agent\.md|claude\.md|cursor\.md|agents\.txt|\.cursorrules|copilot-instructions\.md)$/i,
    weight: 3,
  },
  {
    kind: "llms",
    label: "PROJECT_DOCS",
    icon: "📚",
    color: "var(--t-blue)",
    directive: "HIGH-LEVEL PROJECT DOCUMENTATION, MODULE MAP AND API SHAPES.",
    match: /(^|\/)(llms\.txt|llms-full\.txt|readme\.md|docs\/index\.md)$/i,
    weight: 2,
  },
  {
    kind: "memory",
    label: "DECISION_MEMORY",
    icon: "🧠",
    color: "var(--t-purple)",
    directive:
      "PREVIOUS DECISION LOGS, KNOWN EDGE CASES AND PRIOR ITERATIONS. Do not repeat rejected approaches.",
    match: /(^|\/)(memory\.md|history\.md|changelog\.md|decisions\.md)$|^docs\/adr\/.+\.md$|(^|\/)adr\/.+\.md$/i,
    weight: 2,
  },
];

export type SpecSource = { path: string; kind: SpecSourceKind; bytes: number };

/** Highest-priority match wins so AGENTS.md never lands in two buckets. */
export function classifySpecSource(path: string): SpecSourceKind | null {
  const p = path.toLowerCase();
  if (/(^|\/)\.specify\/memory\//.test(p)) return "memory";
  for (const s of SPEC_SOURCES) if (s.match.test(p)) return s.kind;
  return null;
}

/** Scans a flat repo path list for every system-defining document. */
export function detectSpecSources(files: { path: string; size?: number }[]): SpecSource[] {
  const order: SpecSourceKind[] = ["constitution", "agents", "llms", "memory"];
  return files
    .map((f) => {
      const kind = classifySpecSource(f.path);
      return kind ? { path: f.path, kind, bytes: f.size ?? 0 } : null;
    })
    .filter((x): x is SpecSource => Boolean(x))
    .sort(
      (a, b) =>
        order.indexOf(a.kind) - order.indexOf(b.kind) ||
        a.path.split("/").length - b.path.split("/").length ||
        a.path.localeCompare(b.path),
    )
    .slice(0, 24);
}

export type LoadedSource = SpecSource & { text: string };

export const AGGREGATE_BUDGET = 24_000;

/** Synthesizes all loaded system documents into one weighted context payload. */
export function aggregateContext(loaded: LoadedSource[], budget = AGGREGATE_BUDGET): string {
  const active = loaded.filter((l) => l.text?.trim());
  if (!active.length) return "";
  const totalWeight = active.reduce(
    (n, l) => n + (SPEC_SOURCES.find((s) => s.kind === l.kind)?.weight ?? 1),
    0,
  );
  const blocks: string[] = ["[ SYNTHESIZED PROJECT KNOWLEDGE BASE ]"];
  let lastKind: SpecSourceKind | null = null;
  for (const l of active) {
    const def = SPEC_SOURCES.find((s) => s.kind === l.kind)!;
    if (l.kind !== lastKind) {
      blocks.push(``, `### ${def.icon} ${def.label}`, `> ${def.directive}`);
      lastKind = l.kind;
    }
    const share = Math.max(600, Math.floor((budget * def.weight) / totalWeight));
    blocks.push(``, `--- FILE: ${l.path} ---`, truncateToTokenBudget(l.text, share));
  }
  return blocks.join("\n");
}

export function contextStats(loaded: LoadedSource[]) {
  const packed = aggregateContext(loaded);
  return { chars: packed.length, tokens: tokensOf(packed), files: loaded.filter((l) => l.text).length };
}

/** All hard/soft rules extracted from constitution + agent documents. */
export function activeRules(loaded: LoadedSource[]): SpecRule[] {
  return loaded
    .filter((l) => l.kind === "constitution" || l.kind === "agents")
    .flatMap((l) => extractRules(l.path, l.text ?? ""));
}

/* ------------------------------------------------------------------ */
/* 2. LOCAL GUARDRAIL PRE-AUDIT (works with zero API keys)             */
/* ------------------------------------------------------------------ */

const GUARD_TOPICS: { topic: string; re: RegExp }[] = [
  { topic: "backend", re: /\b(backend|server|api route|express|node server|serverless|edge function)\b/i },
  { topic: "database", re: /\b(database|sql|postgres|supabase|migration|persist)\b/i },
  { topic: "auth", re: /\b(auth|login|session|oauth|token|credential)\b/i },
  { topic: "state", re: /\b(localstorage|state|cache|store|persistence)\b/i },
  { topic: "styling", re: /\b(css|tailwind|color|theme|font|style)\b/i },
  { topic: "dependencies", re: /\b(install|dependency|package|library|npm)\b/i },
  { topic: "tests", re: /\b(test|vitest|coverage|spec file)\b/i },
  { topic: "docs", re: /\b(readme|changelog|docs|documentation)\b/i },
];

export type GuardFinding = { rule: SpecRule; topic: string };

/** Flags rules whose subject matter overlaps the requested feature. */
export function auditGoal(goal: string, rules: SpecRule[]): GuardFinding[] {
  const hits = GUARD_TOPICS.filter((t) => t.re.test(goal)).map((t) => t.topic);
  const out: GuardFinding[] = [];
  const seen = new Set<string>();
  for (const topic of hits) {
    for (const r of rules) {
      const relevant =
        r.topics.includes(topic) || GUARD_TOPICS.find((t) => t.topic === topic)!.re.test(r.text);
      if (!relevant || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ rule: r, topic });
    }
  }
  return out.sort((a, b) => (a.rule.severity === b.rule.severity ? 0 : a.rule.severity === "hard" ? -1 : 1)).slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* 3. THE 4-STAGE PIPELINE                                             */
/* ------------------------------------------------------------------ */

export type StageId = "guardrails" | "specify" | "plan" | "tasks";

export type StageDef = {
  id: StageId;
  n: number;
  slash: string;
  label: string;
  icon: string;
  /** Output artifact path (slug-substituted). */
  out: (slug: string) => string;
  system: string;
  /** Builds the user payload from goal + all prior stage outputs. */
  user: (goal: string, prior: Partial<Record<StageId, string>>) => string;
};

const OUT = {
  guardrails: () => `.specify/audits/guardrail-audit.md`,
  specify: (s: string) => `.specify/specs/${s}-spec.md`,
  plan: (s: string) => `.specify/plans/${s}-plan.md`,
  tasks: (s: string) => `.specify/tasks/${s}-tasks.md`,
};

export const STAGES: StageDef[] = [
  {
    id: "guardrails",
    n: 1,
    slash: "/constitution + /agents",
    label: "GUARDRAIL_AUDIT",
    icon: "⚖️",
    out: OUT.guardrails,
    system:
      "You are the CONSTITUTIONAL AUDITOR for this repository. You judge a proposed feature strictly against the project's constitution, agent directives and prior decision logs. " +
      "You never design the feature. Output a markdown audit with these sections: `## VERDICT` (exactly one of APPROVED / APPROVED_WITH_CONSTRAINTS / BLOCKED), " +
      "`## RULE MATRIX` (a table: Rule | Source | Severity | Impact | Verdict), `## REQUIRED CONSTRAINTS` (bullets the downstream spec MUST obey), and `## OPEN QUESTIONS`. " +
      "Cite the exact source file for every rule you invoke. If the proposal conflicts with a hard rule, set the verdict to BLOCKED and state the minimal rewrite that would unblock it.",
    user: (goal) => `PROPOSED FEATURE / OPTIMIZATION:\n${goal}`,
  },
  {
    id: "specify",
    n: 2,
    slash: "/specify",
    label: "FUNCTIONAL_SPEC",
    icon: "📄",
    out: OUT.specify,
    system:
      "You are a PRINCIPAL SPEC AUTHOR writing a spec-driven-development functional specification. Write implementation-agnostic behaviour only — no file names, no code, no library choices. " +
      "Output markdown with: `# <Feature Title>`, `## Problem`, `## Goals` / `## Non-Goals`, `## User Journeys` (numbered, step-by-step), " +
      "`## Functional Requirements` (each bullet starts with a bold `REQ-00N` id and uses MUST/SHOULD language), `## Boundary Conditions`, `## Edge Cases`, and `## Acceptance Criteria` (GIVEN/WHEN/THEN). " +
      "Every requirement must be independently testable. Honour every constraint from the guardrail audit.",
    user: (goal, p) =>
      [`FEATURE GOAL:\n${goal}`, p.guardrails ? `\nGUARDRAIL AUDIT (binding):\n${p.guardrails}` : ""].join("\n"),
  },
  {
    id: "plan",
    n: 3,
    slash: "/plan",
    label: "TECH_BLUEPRINT",
    icon: "🧭",
    out: OUT.plan,
    system:
      "You are a PRINCIPAL FRONTEND ARCHITECT producing a technical implementation blueprint for the functional spec. " +
      "Output markdown with: `## Architecture Summary`, `## Component Changes` (table: Component/File | Change | Reason), `## New Modules`, " +
      "`## State & Hooks` (each hook, its shape and owner), `## Data Flow` (a ```mermaid flowchart), `## CSS / Layout Updates` (semantic design tokens only — never hardcoded colors), " +
      "`## Risks & Mitigations`, and `## Test Strategy`. Reuse the existing modules named in the project knowledge base instead of inventing parallel ones.",
    user: (goal, p) =>
      [
        `FEATURE GOAL:\n${goal}`,
        p.guardrails ? `\nBINDING CONSTRAINTS:\n${p.guardrails}` : "",
        p.specify ? `\nFUNCTIONAL SPEC:\n${p.specify}` : "",
      ].join("\n"),
  },
  {
    id: "tasks",
    n: 4,
    slash: "/tasks",
    label: "ATOMIC_TASKS",
    icon: "⚡",
    out: OUT.tasks,
    system:
      "You are a DELIVERY LEAD decomposing a technical blueprint into atomic, sequential, agent-executable tasks. " +
      "Output markdown with `# tasks.md — <Feature>` then `## Tasks`: a numbered list where every task uses the exact form " +
      "`- [ ] **T00N** — <imperative one-line action>` followed by indented sub-bullets `file:`, `does:`, `verify:`. " +
      "Each task must be completable in a single agent turn and must be ordered so the repo stays green after every task. " +
      "Finish with `## Definition of Done` (checklist covering tests, guardrail compliance and CHANGELOG.md).",
    user: (goal, p) =>
      [
        `FEATURE GOAL:\n${goal}`,
        p.specify ? `\nFUNCTIONAL SPEC:\n${p.specify}` : "",
        p.plan ? `\nTECHNICAL PLAN:\n${p.plan}` : "",
      ].join("\n"),
  },
];

export function slugifyGoal(goal: string): string {
  return (
    goal
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .split("-")
      .slice(0, 6)
      .join("-")
      .slice(0, 48) || "infinity-feature"
  );
}

/** Full system prompt for a stage = role + synthesized repo knowledge. */
export function stageSystem(stage: StageDef, context: string): string {
  return context
    ? `${stage.system}\n\n--- BEGIN PROJECT KNOWLEDGE BASE ---\n${context}\n--- END PROJECT KNOWLEDGE BASE ---`
    : stage.system;
}

/* ------------------------------------------------------------------ */
/* 4. PRESETS + EXECUTION DISPATCH                                     */
/* ------------------------------------------------------------------ */

export const PRESETS: { icon: string; label: string; goal: string }[] = [
  {
    icon: "⚡",
    label: "Refactor Search Index",
    goal:
      "Refactor the in-memory MiniSearch index so indexing runs incrementally in the background, snippet documents are deduplicated, and Ctrl+K stays responsive on repositories with more than 2000 files.",
  },
  {
    icon: "🤖",
    label: "Expand Agent Directives",
    goal:
      "Expand the AGENTS.md operating spec with explicit execution boundaries, review checklists and machine-readable command blocks, then surface the new directives inside the Agent OS panel.",
  },
  {
    icon: "📊",
    label: "Auto-Fix Diagram Canvas",
    goal:
      "Diagnose and fix rendering regressions in the diagram canvas: eliminate flicker on re-render, preserve zoom/pan across expand toggles, and gracefully surface Mermaid parse errors instead of blanking the canvas.",
  },
];

export type StageOutputs = Partial<Record<StageId, string>>;

/** Packages the whole loop for a single paste into an external AI chat. */
export function buildHandoffPayload(goal: string, outs: StageOutputs, context: string): string {
  const parts = [
    "[ SPEC DASH // INFINITY LOOP HANDOFF ]",
    "You are continuing an autonomous spec-driven development loop. Implement the tasks below without violating any project rule.",
    "",
    `## GOAL\n${goal}`,
  ];
  if (context) parts.push(`\n## PROJECT RULES (authoritative)\n${truncateToTokenBudget(context, 12_000)}`);
  for (const s of STAGES) {
    const v = outs[s.id];
    if (v) parts.push(`\n## ${s.slash} — ${s.label}\n${v}`);
  }
  parts.push("\n## INSTRUCTION\nExecute the task list in order. After each task, report the task id and the files you changed.");
  return parts.join("\n");
}

/** One runnable prompt for a single task line, injected into the Playground. */
export function taskPrompt(task: string, goal: string, outs: StageOutputs): string {
  return [
    `Execute this single atomic task from the current build:`,
    ``,
    `TASK: ${task}`,
    ``,
    `FEATURE GOAL: ${goal}`,
    outs.plan ? `\nRELEVANT TECHNICAL PLAN:\n${truncateToTokenBudget(outs.plan, 4000)}` : "",
    ``,
    `Return the exact code changes required, then the verification step. Obey every project rule in the system prompt.`,
  ].join("\n");
}

/** Pulls `- [ ] **T001** — ...` style lines out of the generated task list. */
export function parseTasks(md: string): string[] {
  const out: string[] = [];
  for (const raw of (md ?? "").split("\n")) {
    const line = raw.trim();
    const m = /^[-*]\s+\[[ xX]\]\s+(.+)$/.exec(line) || /^\d+\.\s+(\*\*T\d+\*\*.+)$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/[*`]/g, "").trim();
    if (text.length > 6 && !out.includes(text)) out.push(text);
  }
  return out.slice(0, 40);
}