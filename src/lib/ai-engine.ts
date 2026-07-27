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
    body: JSON.stringify(body(cfg, msgs)),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = String(res.status);
    try {
      const t = await res.text();
      detail = `${res.status} ${t.slice(0, 300)}`;
    } catch {
      /* ignore */
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
