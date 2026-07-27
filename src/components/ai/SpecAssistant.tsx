import { useRef, useState } from "react";
import { toast } from "sonner";
import { streamBudgeted, TOO_LARGE_MESSAGE, type AiConfig } from "@/lib/ai-engine";
import { DEFAULT_BUDGET, TokenLimitError, truncateToTokenBudget } from "@/lib/token-budget";

const SYSTEM_PROMPT =
  "You are an expert technical editor. Your analysis MUST be strictly confined to the SPEC CONTENT provided. " +
  "Do not reference outside repository files, root paths, or directory structures. " +
  "Keep responses brief and bulleted.";

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
}: {
  cfg: AiConfig | null;
  path: string;
  text: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<TaskKey | null>(null);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
            className="border border-[#333] px-3 py-1.5 hover:border-[#00ff66] hover:text-[#00ff66] disabled:opacity-40 disabled:hover:border-[#333] disabled:hover:text-inherit"
          >
            [ {TASKS[k].label} ]
          </button>
        ))}
        <span className="ml-auto" style={{ color: cfg ? "#00ff66" : "#ff5500" }}>
          {cfg ? `[ AI: ACTIVE (${cfg.provider.toUpperCase()}) ]` : "[ AI: DISABLED ]"}
        </span>
        {open && (
          <button onClick={() => setOpen(false)} className="border border-[#333] px-3 py-1.5 hover:text-white">
            [ HIDE_DRAWER ]
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-hard max-h-[45vh] min-h-[160px] overflow-auto p-5 text-[13px] leading-relaxed">
          <div className="text-[11px] uppercase tracking-widest text-[#666] mb-3">
            &gt; {task} {busy && <span className="text-[#ffaa00]">// STREAMING...</span>}
          </div>
          {err ? (
            <div className="text-[#ff5500] break-all">ERR: {err}</div>
          ) : (
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#ddd]">
              {out || "> AWAITING_TOKENS..."}
            </pre>
          )}
        </div>
      )}
    </>
  );
}
