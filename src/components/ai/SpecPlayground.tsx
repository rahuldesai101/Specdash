import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { streamCompletion, TOO_LARGE_MESSAGE, type AiConfig } from "@/lib/ai-engine";
import { TokenLimitError, truncateToTokenBudget } from "@/lib/token-budget";
import { DEFAULT_BUDGET } from "@/lib/token-budget";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Playground drawer: uses the currently open .md file as the SYSTEM PROMPT
 * and lets the user chat against it, reusing the same AI provider/keys the
 * rest of the app already has configured (Groq / OpenAI / Anthropic / Gemini).
 *
 * Purely additive: no existing SpecAssistant task is changed.
 */
export function SpecPlayground({
  cfg,
  path,
  text,
  open,
  onClose,
}: {
  cfg: AiConfig | null;
  path: string;
  text: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset conversation whenever a different spec is loaded.
    setTurns([]);
    setErr(null);
  }, [path]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, open]);

  if (!open) return null;

  const stop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    if (!cfg) {
      setErr("AI_DISABLED — configure an engine in [AI_CFG]");
      return;
    }
    if (!text) {
      setErr("SPEC_NOT_LOADED");
      return;
    }

    setErr(null);
    setInput("");
    const nextTurns: Turn[] = [...turns, { role: "user", content: q }, { role: "assistant", content: "" }];
    setTurns(nextTurns);
    const assistantIdx = nextTurns.length - 1;

    const system =
      `You are running with the following markdown document as your SYSTEM PROMPT. ` +
      `Follow its instructions, tone and constraints faithfully.\n\n` +
      `${MD_FORMAT_RULES}\n\n` +
      `--- SYSTEM PROMPT (from ${path}) ---\n` +
      truncateToTokenBudget(text, DEFAULT_BUDGET);

    const userPayload = nextTurns
      .filter((t) => t.content)
      .map((t) => `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.content}`)
      .join("\n\n");

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    try {
      await streamCompletion(
        cfg,
        [
          { role: "system", content: system },
          { role: "user", content: userPayload },
        ],
        (d) =>
          setTurns((prev) => {
            const copy = prev.slice();
            copy[assistantIdx] = {
              role: "assistant",
              content: (copy[assistantIdx]?.content ?? "") + d,
            };
            return copy;
          }),
        ctrl.signal,
      );
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg =
        e instanceof TokenLimitError
          ? TOO_LARGE_MESSAGE
          : e instanceof Error
            ? e.message
            : "AI_ERR";
      toast.error(msg);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/80 p-0 sm:p-6">
      <div className="flex h-[85vh] w-full max-w-3xl flex-col border border-hard bg-black">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[11px] uppercase tracking-widest text-[#00ff66]">
            [ PLAYGROUND // SYSTEM_PROMPT = {path.split("/").pop()} ]
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
            <span style={{ color: cfg ? "#00ff66" : "#ff5500" }}>
              {cfg ? `[ ${cfg.provider.toUpperCase()} • ${cfg.model} ]` : "[ AI: DISABLED ]"}
            </span>
            <button
              onClick={onClose}
              className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]"
            >
              [X]
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && !err && (
            <div className="text-[11px] uppercase tracking-widest text-[#666]">
              &gt; This markdown file will be sent as the system prompt.
              <br />
              &gt; Type a message below to start chatting.
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i}>
              <div
                className="mb-1 text-[10px] uppercase tracking-widest"
                style={{ color: t.role === "user" ? "#888" : "#00ff66" }}
              >
                {t.role === "user" ? "> USER" : "> ASSISTANT"}
              </div>
              {t.role === "assistant" && t.content ? (
                <MarkdownView source={normalizeAiMarkdown(t.content)} />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#ddd]">
                  {t.content || (busy && i === turns.length - 1 ? "> AWAITING_TOKENS..." : "")}
                </pre>
              )}
            </div>
          ))}
          {err && <div className="break-all text-[11px] text-[#ff5500]">ERR: {err}</div>}
        </div>

        <div className="border-t border-hard p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={cfg ? "Message the spec... (Enter to send, Shift+Enter for newline)" : "Configure AI in [AI_CFG] first"}
              disabled={!cfg || !text}
              rows={2}
              className="min-h-[44px] flex-1 resize-y border border-hard bg-[#0a0a0a] p-2 text-[13px] text-[#ddd] outline-none focus:border-[#00ff66] disabled:opacity-40"
            />
            {busy ? (
              <button
                onClick={stop}
                className="border border-[#ff5500] px-3 py-2 text-[11px] uppercase tracking-widest text-[#ff5500] hover:bg-[#ff5500] hover:text-black"
              >
                [ STOP ]
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!cfg || !text || !input.trim()}
                className="border border-[#00ff66] px-3 py-2 text-[11px] uppercase tracking-widest text-[#00ff66] hover:bg-[#00ff66] hover:text-black disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#00ff66]"
              >
                [ SEND ]
              </button>
            )}
          </div>
          {turns.length > 0 && (
            <button
              onClick={() => {
                stop();
                setTurns([]);
                setErr(null);
              }}
              className="mt-2 text-[10px] uppercase tracking-widest text-[#666] hover:text-[#00ff66]"
            >
              [ CLEAR_CONVERSATION ]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}