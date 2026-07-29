/**
 * Zero-cost web deep-linking: launch the active spec + prompt inside a
 * consumer AI web app (ChatGPT / Claude / Gemini / Kimi) with no API key.
 *
 * Strategy:
 *  - The full markdown payload is ALWAYS written to the clipboard.
 *  - If the provider supports a prompt query param and the payload fits under
 *    its URL ceiling, we prefill it so the user only has to hit Enter.
 *  - Otherwise we open a blank chat and the user pastes (Ctrl/Cmd+V).
 */

export type ExternalProvider = {
  id: "chatgpt" | "claude" | "gemini" | "kimi" | "perplexity";
  label: string;
  dot: string;
  color: string;
  /** Build target URL. Returns null in "clipboard-only" mode. */
  url: (payload: string) => string;
  /** Max payload chars safely embeddable in the URL (0 = no prefill support). */
  urlLimit: number;
};

export const EXTERNAL_PROVIDERS: ExternalProvider[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    dot: "🟢",
    color: "var(--t-green)",
    urlLimit: 8000,
    url: (p) => (p ? `https://chatgpt.com/?q=${encodeURIComponent(p)}` : "https://chatgpt.com/"),
  },
  {
    id: "claude",
    label: "Claude",
    dot: "🟣",
    color: "var(--t-purple)",
    urlLimit: 8000,
    url: (p) => (p ? `https://claude.ai/new?q=${encodeURIComponent(p)}` : "https://claude.ai/new"),
  },
  {
    id: "gemini",
    label: "Google Gemini",
    dot: "🔵",
    color: "var(--t-blue)",
    urlLimit: 4000,
    url: (p) =>
      p
        ? `https://gemini.google.com/app?q=${encodeURIComponent(p)}`
        : "https://gemini.google.com/app",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    dot: "🔎",
    color: "var(--t-cyan)",
    urlLimit: 6000,
    url: (p) =>
      p
        ? `https://www.perplexity.ai/search?q=${encodeURIComponent(p)}`
        : "https://www.perplexity.ai/",
  },
  {
    id: "kimi",
    label: "Kimi AI",
    dot: "🌙",
    color: "var(--t-amber)",
    urlLimit: 6000,
    url: (p) => (p ? `https://www.kimi.com/chat?q=${encodeURIComponent(p)}` : "https://www.kimi.com/"),
  },
];

const PREF_KEY = "sd:externalAi";

/** Default external AI target chosen in the Control Centre. */
export function getPreferredProviderId(): ExternalProvider["id"] {
  if (typeof localStorage === "undefined") return "chatgpt";
  const v = localStorage.getItem(PREF_KEY);
  return (EXTERNAL_PROVIDERS.find((p) => p.id === v)?.id ?? "chatgpt") as ExternalProvider["id"];
}

export function setPreferredProviderId(id: string) {
  localStorage.setItem(PREF_KEY, id);
}

/** Providers ordered so the user's default target comes first. */
export function orderedProviders(): ExternalProvider[] {
  const pref = getPreferredProviderId();
  return [...EXTERNAL_PROVIDERS].sort((a, b) => Number(b.id === pref) - Number(a.id === pref));
}

export const DEFAULT_DIRECTIVE =
  "You are an expert technical editor and documentation reviewer. Be precise, terse and cite the spec.";

/** Hard ceiling for the pasted context so consumer web apps don't choke. */
const MAX_SPEC_CHARS = 40000;

function clampSpec(raw: string): string {
  if (raw.length <= MAX_SPEC_CHARS) return raw;
  const head = raw.slice(0, Math.floor(MAX_SPEC_CHARS * 0.7));
  const tail = raw.slice(-Math.floor(MAX_SPEC_CHARS * 0.3));
  return `${head}\n\n...[ TRUNCATED ${raw.length - MAX_SPEC_CHARS} CHARS ]...\n\n${tail}`;
}

export function buildExternalPayload(opts: {
  path: string;
  rawText: string;
  action: string;
  directive?: string;
  repo?: string;
}): string {
  return [
    "[CONTEXT ATTACHED FROM SPEC DASH]",
    opts.repo ? `Repository: ${opts.repo}` : null,
    `Active File: ${opts.path}`,
    "",
    "[ SYSTEM DIRECTIVE / GUIDELINES ]",
    opts.directive?.trim() || DEFAULT_DIRECTIVE,
    "",
    "---",
    clampSpec(opts.rawText ?? ""),
    "---",
    "",
    "[INSTRUCTION]:",
    opts.action.trim(),
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export type LaunchResult = { copied: boolean; prefilled: boolean };

export async function launchExternalAi(
  provider: ExternalProvider,
  payload: string,
): Promise<LaunchResult> {
  const copied = await copyText(payload);
  const prefilled = provider.urlLimit > 0 && payload.length <= provider.urlLimit;
  window.open(provider.url(prefilled ? payload : ""), "_blank", "noopener,noreferrer");
  return { copied, prefilled };
}
