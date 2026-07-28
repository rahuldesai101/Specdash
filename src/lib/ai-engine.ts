import { DEFAULT_BUDGET, TokenLimitError } from "./token-budget";

export type ProviderId = "groq" | "openai" | "anthropic" | "google";

export const PROVIDERS: { id: ProviderId; label: string; model: string; keyHint: string }[] = [
  { id: "groq", label: "GROQ", model: "llama-3.3-70b-versatile", keyHint: "gsk_..." },
  { id: "openai", label: "OPENAI", model: "gpt-4o-mini", keyHint: "sk-..." },
  { id: "anthropic", label: "ANTHROPIC_CLAUDE", model: "claude-3-5-sonnet-latest", keyHint: "sk-ant-..." },
  { id: "google", label: "GOOGLE_GEMINI", model: "gemini-2.0-flash", keyHint: "AIza..." },
];

export type AiConfig = { provider: ProviderId; apiKey: string; model: string };

const K = "ai_engine_cfg";

export function loadAiConfig(): AiConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(K);
    if (!raw) return null;
    const c = JSON.parse(raw) as AiConfig;
    return c?.apiKey ? c : null;
  } catch {
    return null;
  }
}

export function saveAiConfig(c: AiConfig | null) {
  if (typeof window === "undefined") return;
  if (!c || !c.apiKey) window.localStorage.removeItem(K);
  else window.localStorage.setItem(K, JSON.stringify(c));
}

export function defaultModel(p: ProviderId) {
  return PROVIDERS.find((x) => x.id === p)?.model ?? "";
}

type Msg = { role: "system" | "user"; content: string };

/** Hard output-hygiene contract prepended to EVERY system prompt. */
export const OUTPUT_RULES = `You are an expert technical AI assistant.
CRITICAL OUTPUT RULES:
1. Produce clean, perfectly structured, human-readable prose or strictly valid JSON.
2. NEVER output unclosed markdown blocks, stray backticks (\`), or double-escaped asterisks (\\*).
3. When summarizing or generating action items, use standard bullet points ("* ") with clear bold section leads.
4. NEVER start responses with conversational fluff like "Sure! Here is your summary:". Jump DIRECTLY into the answer.
5. Strictly adhere to clean visual hierarchy using standard #, ## and ### headers only when necessary.`;

const FLUFF =
  /^\s*(sure|certainly|of course|absolutely|here('s| is| are)[^\n]*|okay|ok)[^\n]{0,120}?[:!.]\s*\n+/i;

/**
 * Normalizes raw model output: strips fluff openers, unescapes double-escaped
 * markdown, drops stray/unclosed code fences and collapses excess blank lines.
 */
export function sanitizeLlmOutput(raw: string): string {
  if (!raw) return "";
  let t = raw.replace(/\r\n/g, "\n");
  t = t.replace(FLUFF, "");
  t = t.replace(/\\([*_#`~[\]()>-])/g, "$1");
  // Close an odd number of ``` fences.
  const fences = (t.match(/^```/gm) ?? []).length;
  if (fences % 2 === 1) t += "\n```";
  // Drop an empty fence pair the model sometimes emits at the very end.
  t = t.replace(/\n```\s*```\s*$/g, "");
  // Stray single backticks on their own line.
  t = t.replace(/^\s*`\s*$/gm, "");
  t = t.replace(/[ \t]+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function endpoint(c: AiConfig) {
  switch (c.provider) {
    case "groq":
      return "https://api.groq.com/openai/v1/chat/completions";
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    case "google":
      return `https://generativelanguage.googleapis.com/v1beta/models/${c.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(c.apiKey)}`;
  }
}

function headers(c: AiConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (c.provider === "anthropic") {
    h["x-api-key"] = c.apiKey;
    h["anthropic-version"] = "2023-06-01";
    h["anthropic-dangerous-direct-browser-access"] = "true";
  } else if (c.provider !== "google") {
    h.Authorization = `Bearer ${c.apiKey}`;
  }
  return h;
}

function body(c: AiConfig, msgs: Msg[]) {
  const sys = msgs.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const usr = msgs.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
  if (c.provider === "anthropic") {
    return { model: c.model, max_tokens: 2048, stream: true, system: sys, messages: [{ role: "user", content: usr }] };
  }
  if (c.provider === "google") {
    return {
      systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
      contents: [{ role: "user", parts: [{ text: usr }] }],
    };
  }
  return { model: c.model, stream: true, messages: msgs };
}

function extractDelta(c: AiConfig, json: unknown): string {
  const j = json as Record<string, any>;
  if (c.provider === "anthropic") {
    if (j?.type === "content_block_delta") return j.delta?.text ?? "";
    return "";
  }
  if (c.provider === "google") {
    const parts = j?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p: any) => p?.text ?? "").join("");
  }
  return j?.choices?.[0]?.delta?.content ?? "";
}

/** Streams an LLM completion straight from the browser to the user's provider. */
export async function streamCompletion(
  cfg: AiConfig,
  msgs: Msg[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(endpoint(cfg), {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify(
      body(
        cfg,
        msgs.some((m) => m.role === "system")
          ? msgs.map((m) => (m.role === "system" ? { ...m, content: `${OUTPUT_RULES}\n\n${m.content}` } : m))
          : [{ role: "system", content: OUTPUT_RULES } as Msg, ...msgs],
      ),
    ),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = String(res.status);
    let raw = "";
    try {
      raw = await res.text();
      detail = `${res.status} ${raw.slice(0, 300)}`;
    } catch {
      /* ignore */
    }
    if (res.status === 413 || /request too large|too many tokens|context length/i.test(raw)) {
      throw new TokenLimitError(`TOKEN_LIMIT ${detail}`);
    }
    throw new Error(`AI_ERR ${detail}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        onDelta(extractDelta(cfg, JSON.parse(payload)));
      } catch {
        /* partial frame — ignore */
      }
    }
  }
}

export const TOO_LARGE_MESSAGE =
  "File context too large for free AI rate limits. Please select a smaller spec or upgrade key.";

/**
 * Budgeted streaming: builds the user payload at `budget` chars, and on a
 * token/size rejection retries ONCE at 50% of that budget.
 */
export async function streamBudgeted(
  cfg: AiConfig,
  system: string,
  buildUser: (budget: number) => string,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
  budget: number = DEFAULT_BUDGET,
): Promise<void> {
  const attempt = (b: number) =>
    streamCompletion(
      cfg,
      [
        { role: "system", content: system },
        { role: "user", content: buildUser(b) },
      ],
      onDelta,
      signal,
    );

  try {
    await attempt(budget);
  } catch (e) {
    if (e instanceof TokenLimitError && !signal?.aborted) {
      try {
        await attempt(Math.floor(budget / 2));
        return;
      } catch (e2) {
        if (e2 instanceof TokenLimitError) throw new TokenLimitError(TOO_LARGE_MESSAGE);
        throw e2;
      }
    }
    throw e;
  }
}
