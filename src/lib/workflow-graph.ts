import { load as yamlLoad } from "js-yaml";

/**
 * Workflow interception: turn GitHub Actions / LangGraph / CrewAI / AutoGen
 * YAML+JSON configs into a mermaid flowchart so they render as agent graphs.
 */

export type WorkflowKind = "gh-actions" | "langgraph" | "crewai" | "autogen" | "generic" | null;

export type ParsedWorkflow = {
  kind: Exclude<WorkflowKind, null>;
  title: string;
  mermaid: string;
};

const ROLE_ICONS: Array<[RegExp, string]> = [
  [/rout|superviso|orchestr|manager|planner/i, "🤖"],
  [/exec|run|worker|tool|action|build|deploy|test/i, "⚡"],
  [/eval|review|critic|judge|valid|verif|check|lint/i, "🔍"],
  [/stor|memory|db|database|cache|vector|index|artifact/i, "💾"],
  [/human|user|approv/i, "🧑"],
  [/end|final|done|complete|__end__/i, "🏁"],
  [/start|entry|__start__|init|trigger/i, "🚩"],
];

export function roleIcon(name: string): string {
  for (const [re, icon] of ROLE_ICONS) if (re.test(name)) return icon;
  return "▪";
}

const id = (() => {
  const map = new Map<string, string>();
  return (raw: string) => {
    if (!map.has(raw)) map.set(raw, `n${map.size}_${raw.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24)}`);
    return map.get(raw)!;
  };
})();

function nodeLine(key: string, label: string, shape: "box" | "round" | "stadium" = "box") {
  const safe = `${roleIcon(key + " " + label)} ${label}`.replace(/"/g, "'");
  const nid = id(key);
  return shape === "round"
    ? `  ${nid}(["${safe}"])`
    : shape === "stadium"
      ? `  ${nid}(("${safe}"))`
      : `  ${nid}["${safe}"]`;
}

function edge(a: string, b: string, label?: string) {
  return label ? `  ${id(a)} -->|${label.replace(/[|"]/g, "")}| ${id(b)}` : `  ${id(a)} --> ${id(b)}`;
}

function parseAny(src: string): unknown {
  const t = src.trim();
  if (!t) return null;
  try {
    return t.startsWith("{") || t.startsWith("[") ? JSON.parse(t) : yamlLoad(t);
  } catch {
    try {
      return yamlLoad(t);
    } catch {
      return null;
    }
  }
}

function asObj(v: unknown): Record<string, any> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : null;
}

function ghActions(doc: Record<string, any>): ParsedWorkflow | null {
  const jobs = asObj(doc.jobs);
  if (!jobs) return null;
  const lines = ["flowchart TD"];
  const triggers = doc.on ?? doc.true; // yaml 1.1 parses `on:` as true in some loaders
  const trigLabel = Array.isArray(triggers)
    ? triggers.join(", ")
    : asObj(triggers)
      ? Object.keys(triggers as object).join(", ")
      : String(triggers ?? "manual");
  lines.push(nodeLine("__trigger__", `TRIGGER: ${trigLabel}`.slice(0, 60), "round"));
  for (const [name, job] of Object.entries(jobs)) {
    const j = asObj(job) ?? {};
    const steps = Array.isArray(j.steps) ? j.steps.length : 0;
    lines.push(nodeLine(name, `${name}${steps ? ` (${steps} steps)` : ""}`));
    const needs = j.needs ? (Array.isArray(j.needs) ? j.needs : [j.needs]) : [];
    if (!needs.length) lines.push(edge("__trigger__", name));
    for (const n of needs) lines.push(edge(String(n), name, "needs"));
    if (j.if) lines.push(`  %% ${name} if: ${String(j.if).slice(0, 60)}`);
  }
  return { kind: "gh-actions", title: String(doc.name ?? "GitHub Actions Workflow"), mermaid: lines.join("\n") };
}

function langgraph(doc: Record<string, any>): ParsedWorkflow | null {
  const nodes = doc.nodes ?? doc.graph?.nodes;
  const edges = doc.edges ?? doc.graph?.edges;
  if (!nodes && !edges) return null;
  const lines = ["flowchart TD"];
  const nameOf = (n: any) => String(asObj(n)?.id ?? asObj(n)?.name ?? n);
  if (Array.isArray(nodes)) for (const n of nodes) lines.push(nodeLine(nameOf(n), nameOf(n)));
  else if (asObj(nodes)) for (const k of Object.keys(nodes)) lines.push(nodeLine(k, k));
  if (Array.isArray(edges))
    for (const e of edges) {
      if (Array.isArray(e) && e.length >= 2) lines.push(edge(String(e[0]), String(e[1])));
      else {
        const o = asObj(e);
        if (o) lines.push(edge(String(o.from ?? o.source), String(o.to ?? o.target), o.condition ?? o.label));
      }
    }
  const entry = doc.entry_point ?? doc.entrypoint;
  if (entry) {
    lines.push(nodeLine("__start__", "START", "round"));
    lines.push(edge("__start__", String(entry)));
  }
  return { kind: "langgraph", title: String(doc.name ?? "Agent Graph"), mermaid: lines.join("\n") };
}

function crewai(doc: Record<string, any>): ParsedWorkflow | null {
  const agents = doc.agents;
  const tasks = doc.tasks;
  if (!agents && !tasks) return null;
  const lines = ["flowchart TD"];
  const list = (v: any): Array<[string, any]> =>
    Array.isArray(v)
      ? v.map((x, i) => [String(asObj(x)?.name ?? asObj(x)?.role ?? asObj(x)?.id ?? i), x])
      : asObj(v)
        ? Object.entries(v)
        : [];
  for (const [name, a] of list(agents)) {
    const role = String(asObj(a)?.role ?? name);
    lines.push(nodeLine(`agent:${name}`, `${role}`.slice(0, 48), "stadium"));
  }
  let prev: string | null = null;
  for (const [name, t] of list(tasks)) {
    const o = asObj(t) ?? {};
    const key = `task:${name}`;
    lines.push(nodeLine(key, String(o.description ?? name).slice(0, 48)));
    if (o.agent) lines.push(edge(`agent:${String(o.agent)}`, key, "runs"));
    if (prev) lines.push(edge(prev, key));
    prev = key;
  }
  return { kind: "crewai", title: String(doc.name ?? "CrewAI Crew"), mermaid: lines.join("\n") };
}

function autogen(doc: Record<string, any>): ParsedWorkflow | null {
  const participants =
    doc.participants ?? doc.agents ?? doc.config?.participants ?? doc.team?.participants;
  if (!Array.isArray(participants)) return null;
  const lines = ["flowchart LR"];
  const hub = String(doc.name ?? doc.team?.name ?? "GroupChat Router");
  lines.push(nodeLine("__hub__", `Router: ${hub}`.slice(0, 48), "round"));
  for (const p of participants) {
    const name = String(asObj(p)?.name ?? asObj(p)?.config?.name ?? p);
    lines.push(nodeLine(name, name));
    lines.push(edge("__hub__", name));
    lines.push(edge(name, "__hub__"));
  }
  return { kind: "autogen", title: hub, mermaid: lines.join("\n") };
}

/** Generic: any mapping whose values reference other keys (steps/depends_on/next). */
function generic(doc: Record<string, any>): ParsedWorkflow | null {
  const steps = doc.steps ?? doc.stages ?? doc.pipeline ?? doc.workflow;
  const entries = Array.isArray(steps)
    ? steps.map((s: any, i: number) => [String(asObj(s)?.name ?? asObj(s)?.id ?? `step_${i + 1}`), s] as [string, any])
    : asObj(steps)
      ? Object.entries(steps)
      : [];
  if (!entries.length) return null;
  const lines = ["flowchart TD"];
  let prev: string | null = null;
  for (const [name, s] of entries) {
    lines.push(nodeLine(name, name));
    const o = asObj(s) ?? {};
    const deps = o.depends_on ?? o.needs ?? o.after;
    const list = deps ? (Array.isArray(deps) ? deps : [deps]) : [];
    if (list.length) for (const d of list) lines.push(edge(String(d), name));
    else if (prev) lines.push(edge(prev, name));
    if (o.next) for (const n of Array.isArray(o.next) ? o.next : [o.next]) lines.push(edge(name, String(n)));
    prev = name;
  }
  return { kind: "generic", title: String(doc.name ?? "Workflow"), mermaid: lines.join("\n") };
}

export function parseWorkflow(source: string): ParsedWorkflow | null {
  const doc = asObj(parseAny(source));
  if (!doc) return null;
  return ghActions(doc) ?? langgraph(doc) ?? crewai(doc) ?? autogen(doc) ?? generic(doc);
}

/** True for paths we should index/render as workflow graphs. */
export function isWorkflowPath(path: string): boolean {
  const p = path.toLowerCase();
  if (/^\.github\/workflows\/.+\.(ya?ml)$/.test(p)) return true;
  if (!/\.(ya?ml|json)$/.test(p)) return false;
  return /(agent|crew|graph|swarm|autogen|langgraph|workflow|flow|pipeline|team|orchestr)/.test(p);
}
