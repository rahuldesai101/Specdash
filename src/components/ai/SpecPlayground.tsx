import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MD_FORMAT_RULES, streamCompletion, TOO_LARGE_MESSAGE, type AiConfig } from "@/lib/ai-engine";
import { normalizeAiMarkdown } from "@/lib/md-normalize";
import { MarkdownView } from "@/components/md/MarkdownView";
import { ExternalAiMenu } from "./ExternalAiMenu";
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
  seed,
}: {
  cfg: AiConfig | null;
  path: string;
  text: string | null;
  open: boolean;
  onClose: () => void;
  /** Snippet transported from a code block; `nonce` retriggers prefill. */
  seed?: { text: string; nonce: number } | null;
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

  useEffect(() => {
    if (seed?.nonce && seed.text) setInput(seed.text);
  }, [seed?.nonce, seed?.text]);

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-[var(--t-bg)]/80 p-0 sm:p-6">
      <div className="flex h-[85vh] w-full max-w-3xl flex-col border border-hard bg-[var(--t-bg)]">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[11px] uppercase tracking-widest text-[var(--t-green)]">
            [ PLAYGROUND // SYSTEM_PROMPT = {path.split("/").pop()} ]
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
            <span style={{ color: cfg ? "var(--t-green)" : "var(--t-orange)" }}>
              {cfg ? `[ ${cfg.provider.toUpperCase()} • ${cfg.model} ]` : "[ AI: DISABLED ]"}
            </span>
            <ExternalAiMenu
              path={path}
              text={text}
              action={
                input.trim() ||
                [...turns].reverse().find((t) => t.role === "user")?.content ||
                "Act on the system prompt above and await my instructions."
              }
              directive={`You are running with the markdown document below as your SYSTEM PROMPT. Follow its instructions, tone and constraints faithfully.`}
            />
            <button
              onClick={onClose}
              className="border border-[var(--t-line)] px-2 py-1 hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
            >
              [X]
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 && !err && (
            <div className="text-[11px] uppercase tracking-widest text-[var(--t-dim-2)]">
              &gt; This markdown file will be sent as the system prompt.
              <br />
              &gt; Type a message below to start chatting.
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i}>
              <div
                className="mb-1 text-[10px] uppercase tracking-widest"
                style={{ color: t.role === "user" ? "var(--t-dim)" : "var(--t-green)" }}
              >
                {t.role === "user" ? "> USER" : "> ASSISTANT"}
              </div>
              {t.role === "assistant" && t.content ? (
                <MarkdownView source={normalizeAiMarkdown(t.content)} />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--t-fg-2)]">
                  {t.content || (busy && i === turns.length - 1 ? "> AWAITING_TOKENS..." : "")}
                </pre>
              )}
            </div>
          ))}
          {err && <div className="break-all text-[11px] text-[var(--t-orange)]">ERR: {err}</div>}
        </div>

        <div className="border-t border-hard p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void send();
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                cfg
                  ? "Message the spec... (Enter or Ctrl/⌘+Enter to run, Shift+Enter for newline)"
                  : "Configure AI in [AI_CFG] first"
              }
              disabled={!cfg || !text}
              rows={2}
              className="min-h-[44px] flex-1 resize-y border border-hard bg-[var(--t-surface)] p-2 text-[13px] text-[var(--t-fg-2)] outline-none focus:border-[var(--t-green)] disabled:opacity-40"
            />
            {busy ? (
              <button
                onClick={stop}
                className="border border-[var(--t-orange)] px-3 py-2 text-[11px] uppercase tracking-widest text-[var(--t-orange)] hover:bg-[var(--t-orange)] hover:text-[var(--t-on-accent)]"
              >
                [ STOP ]
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!cfg || !text || !input.trim()}
                className="border border-[var(--t-green)] px-3 py-2 text-[11px] uppercase tracking-widest text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--t-green)]"
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
              className="mt-2 text-[10px] uppercase tracking-widest text-[var(--t-dim-2)] hover:text-[var(--t-green)]"
            >
              [ CLEAR_CONVERSATION ]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}