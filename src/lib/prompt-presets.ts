/**
 * Prompt Preset Shelf — reusable Mustache-style templates with their own
 * system instruction. Stored browser-side; no backend, no persistence beyond
 * localStorage.
 */

export type PromptPreset = {
  id: string;
  icon: string;
  name: string;
  system: string;
  template: string;
  builtin?: boolean;
};

const K = "prompt_presets_v1";

export const BUILTIN_PRESETS: PromptPreset[] = [
  {
    id: "edge-cases",
    icon: "🐛",
    name: "FIX EDGE CASES IN SPEC",
    builtin: true,
    system:
      "You are a ruthless specification reviewer. You hunt for ambiguity, unhandled states and missing failure paths. Never invent requirements that are not implied by the spec.",
    template:
      "Review the specification below and enumerate every edge case it fails to define.\n\nFor each gap output: CASE, WHY IT BREAKS, and a one-line SPEC PATCH written in the same voice as the document.\n\nFILE: {{file}}\nREPO: {{repo}}\n\n---\n{{selection}}\n---",
  },
  {
    id: "owasp",
    icon: "🔒",
    name: "SECURITY & OWASP AUDIT",
    builtin: true,
    system:
      "You are an application security engineer performing a threat-model review. Map every finding to an OWASP Top 10 category and rate severity CRITICAL/HIGH/MEDIUM/LOW.",
    template:
      "Audit the following for security defects.\n\nOutput a table: SEVERITY | OWASP CATEGORY | FINDING | CONCRETE FIX. Then list the top 3 fixes in priority order.\n\nFILE: {{file}}\n\n---\n{{selection}}\n---",
  },
  {
    id: "test-skeleton",
    icon: "📜",
    name: "CONVERT SPEC TO TEST SKELETON",
    builtin: true,
    system:
      "You are a test architect. You convert prose requirements into executable test scaffolds. Emit code only — no prose commentary outside code comments.",
    template:
      "Convert the specification below into a {{framework}} test skeleton.\n\nRules: one describe block per requirement, one `it` per acceptance criterion, `todo`/`skip` for anything unverifiable, and a comment citing the spec line each test covers.\n\nFILE: {{file}}\n\n---\n{{selection}}\n---",
  },
];

export function loadPresets(): PromptPreset[] {
  if (typeof window === "undefined") return BUILTIN_PRESETS;
  try {
    const raw = window.localStorage.getItem(K);
    const custom = raw ? (JSON.parse(raw) as PromptPreset[]) : [];
    return [...BUILTIN_PRESETS, ...custom.filter((p) => p?.id && p?.template)];
  } catch {
    return BUILTIN_PRESETS;
  }
}

export function saveCustom(list: PromptPreset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(K, JSON.stringify(list.filter((p) => !p.builtin)));
}

export function upsertPreset(all: PromptPreset[], p: PromptPreset): PromptPreset[] {
  const custom = all.filter((x) => !x.builtin);
  const idx = custom.findIndex((x) => x.id === p.id);
  const next = idx >= 0 ? custom.map((x) => (x.id === p.id ? p : x)) : [...custom, p];
  saveCustom(next);
  return [...BUILTIN_PRESETS, ...next];
}

export function removePreset(all: PromptPreset[], id: string): PromptPreset[] {
  const next = all.filter((x) => !x.builtin && x.id !== id);
  saveCustom(next);
  return [...BUILTIN_PRESETS, ...next];
}

/** All `{{var}}` names in template order, de-duplicated. */
export function extractVars(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Minimal Mustache: `{{var}}` substitution only. Unknown vars stay literal. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (full, key: string) =>
    vars[key] !== undefined && vars[key] !== "" ? vars[key] : full,
  );
}

export const newPresetId = () => `p_${Date.now().toString(36)}`;