import { useRef, useState } from "react";
import { streamCompletion, type AiConfig } from "@/lib/ai-engine";

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
      setErr("SPEC_NOT_LOADED");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    try {
      await streamCompletion(
        cfg,
        [
          { role: "system", content: "You are a terse principal engineer reviewing markdown specs. Plain text output." },
          { role: "user", content: `${TASKS[k].prompt}\n\nFILE: ${path}\n\n${text.slice(0, 60000)}` },
        ],
        (d) => setOut((p) => p + d),
        ctrl.signal,
      );
    } catch (e) {
      if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : "AI_ERR");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-t border-hard px-4 py-2 text-[10px] uppercase tracking-widest">
        {(Object.keys(TASKS) as TaskKey[]).map((k) => (
          <button
            key={k}
            onClick={() => run(k)}
            className="border border-[#333] px-2 py-1 hover:border-[#00ff66] hover:text-[#00ff66]"
          >
            [ {TASKS[k].label} ]
          </button>
        ))}
        <span className="ml-auto" style={{ color: cfg ? "#00ff66" : "#ff5500" }}>
          {cfg ? `[ AI: ACTIVE (${cfg.provider.toUpperCase()}) ]` : "[ AI: DISABLED ]"}
        </span>
        {open && (
          <button onClick={() => setOpen(false)} className="border border-[#333] px-2 py-1 hover:text-white">
            [ HIDE_DRAWER ]
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-hard max-h-[35vh] overflow-auto p-4 text-[11px]">
          <div className="text-[10px] uppercase tracking-widest text-[#666] mb-2">
            &gt; {task} {busy && <span className="text-[#ffaa00]">// STREAMING...</span>}
          </div>
          {err ? (
            <div className="text-[#ff5500] break-all">ERR: {err}</div>
          ) : (
            <pre className="whitespace-pre-wrap text-[#ccc]">{out || "> AWAITING_TOKENS..."}</pre>
          )}
        </div>
      )}
    </>
  );
}
