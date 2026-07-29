import { useMemo, useState } from "react";
import { toast } from "sonner";
import { compileSpec } from "@/lib/sdd-compiler";

type Tab = "tasks" | "tests" | "chain" | "cli";

const TABS: { id: Tab; label: string }[] = [
  { id: "tasks", label: "[ TASKS.MD ]" },
  { id: "tests", label: "[ TEST_SKELETONS ]" },
  { id: "chain", label: "[ PROMPT_CHAIN ]" },
  { id: "cli", label: "[ 1-CLICK_CLI ]" },
];

export function SddCompilerPanel({
  path,
  text,
  onClose,
}: {
  path: string;
  text: string;
  onClose: () => void;
}) {
  const scaffold = useMemo(() => compileSpec(path, text), [path, text]);
  const [tab, setTab] = useState<Tab>("tasks");

  const copy = (v: string, msg: string) =>
    navigator.clipboard
      .writeText(v)
      .then(() => toast.success(msg))
      .catch(() => toast.error("CLIPBOARD_BLOCKED"));

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--t-bg)]/85 p-3 pt-[5vh]" onMouseDown={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col border border-hard bg-[var(--t-bg)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-widest text-[var(--t-green)]">[ SDD_COMPILER // SPEC_TO_SCAFFOLD ]</div>
            <div className="truncate text-[10px] uppercase tracking-widest text-[var(--t-dim-3)]">
              /{path} → {scaffold.requirements.length} REQS · {scaffold.testFiles.length} TESTS
            </div>
          </div>
          <button onClick={onClose} className="text-[11px] text-[var(--t-dim-2)] hover:text-[var(--t-fg)]">
            [ESC]
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-hard px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="border px-2 py-1 text-[10px] uppercase tracking-widest"
              style={{ borderColor: tab === t.id ? "var(--t-green)" : "var(--t-line)", color: tab === t.id ? "var(--t-green)" : "var(--t-dim)" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px]">
          {scaffold.requirements.length === 0 && (
            <div className="p-8 text-center uppercase tracking-widest text-[var(--t-dim-3)]">
              &gt; NO_REQUIREMENTS_PARSED — spec has no imperative bullet statements
            </div>
          )}

          {tab === "tasks" && (
            <>
              <button
                onClick={() => copy(scaffold.tasksMd, "TASKS_MD_COPIED")}
                className="mb-2 border border-[var(--t-green)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
              >
                📋 COPY tasks.md
              </button>
              <pre className="whitespace-pre-wrap border border-hard bg-[var(--t-surface)] p-3 text-[11px] text-[var(--t-fg-2)]">
                {scaffold.tasksMd}
              </pre>
            </>
          )}

          {tab === "tests" &&
            scaffold.testFiles.map((f) => (
              <div key={f.path} className="mb-2 border border-hard">
                <div className="flex items-center justify-between border-b border-hard px-2 py-1">
                  <span className="truncate text-[10px] text-[var(--t-green)]">{f.path}</span>
                  <button onClick={() => copy(f.code, "TEST_COPIED")} className="text-[10px] text-[var(--t-dim)] hover:text-[var(--t-green)]">
                    📋
                  </button>
                </div>
                <pre className="overflow-x-auto whitespace-pre bg-[var(--t-surface)] p-3 text-[11px] text-[var(--t-fg-2)]">{f.code}</pre>
              </div>
            ))}

          {tab === "chain" && (
            <>
              <button
                onClick={() =>
                  copy(
                    scaffold.promptChain.map((s) => `## STEP ${s.step} — ${s.role}\n${s.prompt}`).join("\n\n"),
                    "PROMPT_CHAIN_COPIED",
                  )
                }
                className="mb-2 border border-[var(--t-green)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
              >
                📋 COPY FULL CHAIN
              </button>
              {scaffold.promptChain.map((s) => (
                <div key={s.step} className="mb-2 border border-hard p-3">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--t-orange)]">
                    STEP {s.step} // {s.role}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--t-fg-2)]">{s.prompt}</div>
                  <button
                    onClick={() => copy(s.prompt, `STEP_${s.step}_COPIED`)}
                    className="mt-2 border border-[var(--t-line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
                  >
                    📋 COPY STEP
                  </button>
                </div>
              ))}
            </>
          )}

          {tab === "cli" &&
            scaffold.commands.map((c) => (
              <div key={c.label} className="mb-2 flex items-center gap-2 border border-hard p-2">
                <span className="w-28 shrink-0 text-[10px] uppercase tracking-widest text-[var(--t-orange)]">{c.label}</span>
                <code className="min-w-0 flex-1 truncate text-[11px] text-[var(--t-fg-2)]">{c.cmd}</code>
                <button
                  onClick={() => copy(c.cmd, "COMMAND_COPIED")}
                  className="shrink-0 border border-[var(--t-line)] px-2 py-1 text-[10px] text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
                >
                  📋 RUN
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}