import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { streamBudgeted, TOO_LARGE_MESSAGE, withFormatRules, type AiConfig } from "@/lib/ai-engine";
import { DEFAULT_BUDGET, TokenLimitError, truncateToTokenBudget } from "@/lib/token-budget";
import { normalizeAiMarkdown } from "@/lib/md-normalize";
import { MarkdownView } from "@/components/md/MarkdownView";
import { SpecPlayground } from "./SpecPlayground";
import { ExternalAiMenu } from "./ExternalAiMenu";
import { onHotkey } from "@/lib/hotkeys";

const SYSTEM_PROMPT = withFormatRules(
  "You are an expert technical editor. Your analysis MUST be strictly confined to the SPEC CONTENT provided. " +
    "Do not reference outside repository files, root paths, or directory structures. " +
    "Keep responses brief and bulleted.",
);

const TASKS = {
  SUMMARIZE: {
    label: "🪄 SUMMARIZE",
    prompt: "Produce exactly 3 bullets: an executive summary of this spec. No preamble.",
  },
  ACTION_ITEMS: {
    label: "📋 ACTION_ITEMS",
    prompt:
      "Extract every open task, unchecked checkbox and TODO as a flat checklist. Mark each [OPEN] or [DONE]. No preamble.",
  },
  CRITIQUE: {
    label: "⚡ CRITIQUE",
    prompt:
      "Identify architectural flaws, unhandled edge cases and risks in this spec. Terse bullets, ranked by severity.",
  },
} as const;

type TaskKey = keyof typeof TASKS;

export function SpecAssistant({
  cfg,
  path,
  text,
  seed,
}: {
  cfg: AiConfig | null;
  path: string;
  text: string | null;
  /** Snippet handed over from a code block / search hit. */
  seed?: { text: string; nonce: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<TaskKey | null>(null);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [externalSignal, setExternalSignal] = useState(0);
  const clean = normalizeAiMarkdown(out);

  useEffect(() => {
    if (seed?.nonce) setPlaygroundOpen(true);
  }, [seed?.nonce]);

  useEffect(() => {
    const offs = [
      onHotkey("specPlayground", () => setPlaygroundOpen(true)),
      onHotkey("goPlayground", () => setPlaygroundOpen(true)),
      onHotkey("specExternalAi", () => setExternalSignal((n) => n + 1)),
      onHotkey("escape", () => setPlaygroundOpen(false)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const run = async (k: TaskKey) => {
    setOpen(true);
    setTask(k);
    setOut("");
    setErr(null);
    if (!cfg) {
      setErr("AI_DISABLED — configure an engine in [AI_CFG]");
      return;
    }
    if (!text) {
      setErr("SPEC_NOT_LOADED — file content is still loading or failed to fetch");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    try {
      await streamBudgeted(
        cfg,
        SYSTEM_PROMPT,
        (budget) =>
          `Perform action: [${k}]\n${TASKS[k].prompt}\nTarget File Path: ${path}\n\nSPEC CONTENT:\n${truncateToTokenBudget(
            text,
            budget,
          )}`,
        (d) => setOut((p) => p + d),
        ctrl.signal,
        DEFAULT_BUDGET,
      );
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e instanceof TokenLimitError) {
        toast.error(TOO_LARGE_MESSAGE);
        setErr(TOO_LARGE_MESSAGE);
      } else {
        setErr(e instanceof Error ? e.message : "AI_ERR");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-t border-hard px-5 py-3 text-[11px] uppercase tracking-widest">
        {(Object.keys(TASKS) as TaskKey[]).map((k) => (
          <button
            key={k}
            onClick={() => run(k)}
            disabled={!text || busy}
            className="border border-[var(--t-line)] px-3 py-1.5 hover:border-[var(--t-green)] hover:text-[var(--t-green)] disabled:opacity-40 disabled:hover:border-[var(--t-line)] disabled:hover:text-inherit"
          >
            [ {TASKS[k].label} ]
          </button>
        ))}
        <button
          onClick={() => setPlaygroundOpen(true)}
          disabled={!text}
          title="Run this markdown as system prompt in a chat playground"
          className="border border-[var(--t-line)] px-3 py-1.5 hover:border-[var(--t-green)] hover:text-[var(--t-green)] disabled:opacity-40 disabled:hover:border-[var(--t-line)] disabled:hover:text-inherit"
        >
          [ 🎮 RUN_AS_SYSTEM_PROMPT (ALT+P) ]
        </button>
        <ExternalAiMenu
          path={path}
          text={text}
          openSignal={externalSignal}
          action={task ? TASKS[task].prompt : "Review this spec and report anything notable."}
        />
        <span className="ml-auto" style={{ color: cfg ? "var(--t-green)" : "var(--t-orange)" }}>
          {cfg ? `[ AI: ACTIVE (${cfg.provider.toUpperCase()}) ]` : "[ AI: DISABLED ]"}
        </span>
        {open && (
          <button onClick={() => setOpen(false)} className="border border-[var(--t-line)] px-3 py-1.5 hover:text-[var(--t-fg)]">
            [ HIDE_DRAWER ]
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-hard max-h-[45vh] min-h-[160px] overflow-auto p-5 text-[13px] leading-relaxed">
          <div className="text-[11px] uppercase tracking-widest text-[var(--t-dim-2)] mb-3">
            &gt; {task} {busy && <span className="text-[var(--t-amber)]">// STREAMING...</span>}
          </div>
          {err ? (
            <div className="text-[var(--t-orange)] break-all">ERR: {err}</div>
          ) : clean ? (
            <MarkdownView source={clean} />
          ) : (
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--t-fg-2)]">&gt; AWAITING_TOKENS...</pre>
          )}
        </div>
      )}
      <SpecPlayground
        cfg={cfg}
        path={path}
        text={text}
        seed={seed}
        open={playgroundOpen}
        onClose={() => setPlaygroundOpen(false)}
      />
    </>
  );
}
