import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { streamCompletion, TOO_LARGE_MESSAGE, withFormatRules, type AiConfig } from "@/lib/ai-engine";
import { TokenLimitError } from "@/lib/token-budget";
import { normalizeAiMarkdown } from "@/lib/md-normalize";
import { MarkdownView } from "@/components/md/MarkdownView";
import { ExternalAiMenu } from "@/components/ai/ExternalAiMenu";
import { SpecPlayground } from "@/components/ai/SpecPlayground";
import { fetchRaw } from "@/lib/github-db";
import { newFileIntentUrl } from "@/lib/git-intent";
import { copyText } from "@/lib/external-ai";
import { fmtTokens } from "@/lib/context-pack";
import {
  aggregateContext,
  activeRules,
  auditGoal,
  buildHandoffPayload,
  contextStats,
  detectSpecSources,
  parseTasks,
  PRESETS,
  slugifyGoal,
  SPEC_SOURCES,
  stageSystem,
  STAGES,
  taskPrompt,
  type LoadedSource,
  type StageId,
  type StageOutputs,
} from "@/lib/infinity-loop";

type Phase = "idle" | "running" | "done" | "error";

/**
 * ♾️ INFINITY LOOP — synthesizes every system-defining document in the repo,
 * then runs the 4-stage SDD chain (guardrails → specify → plan → tasks) and
 * dispatches the result to the Playground, external AI apps or GitHub.
 */
export function InfinityLoopModal({
  owner,
  repo,
  branch,
  files,
  cfg,
  seedGoal,
  bridge,
  onClose,
}: {
  owner: string;
  repo: string;
  branch: string;
  files: { path: string; size?: number }[];
  cfg: AiConfig | null;
  /** Prefills the goal box (e.g. from a text selection). */
  seedGoal?: string;
  /** Optional local CLI bridge — enables direct-to-disk writes. */
  bridge?: { state: string; write: (files: { path: string; content: string }[]) => Promise<string[]> };
  onClose: () => void;
}) {
  const sources = useMemo(() => detectSpecSources(files), [files]);
  const [loaded, setLoaded] = useState<LoadedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState(seedGoal ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [active, setActive] = useState<StageId | null>(null);
  const [outs, setOuts] = useState<StageOutputs>({});
  const [err, setErr] = useState<string | null>(null);
  const [openStage, setOpenStage] = useState<StageId | null>("tasks");
  const [playTask, setPlayTask] = useState<{ text: string; nonce: number } | null>(null);
  const [playOpen, setPlayOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /* ---- aggregate every system-defining doc ---- */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      sources.map(async (s) => {
        try {
          return { ...s, text: await fetchRaw(owner, repo, branch, s.path) };
        } catch {
          return { ...s, text: "" };
        }
      }),
    ).then((res) => {
      if (cancelled) return;
      setLoaded(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, sources]);

  const context = useMemo(() => aggregateContext(loaded), [loaded]);
  const stats = useMemo(() => contextStats(loaded), [loaded]);
  const rules = useMemo(() => activeRules(loaded), [loaded]);
  const preAudit = useMemo(() => (goal.trim() ? auditGoal(goal, rules) : []), [goal, rules]);
  const slug = useMemo(() => slugifyGoal(goal), [goal]);
  const tasks = useMemo(() => parseTasks(outs.tasks ?? ""), [outs.tasks]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setActive(null);
  }, []);

  const run = useCallback(async () => {
    const g = goal.trim();
    if (!g) return;
    if (!cfg) {
      setErr("AI_DISABLED — configure an engine in [AI_CFG], or use [ PASS TO EXTERNAL AI ] below.");
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setErr(null);
    setOuts({});
    setPhase("running");

    const acc: StageOutputs = {};
    try {
      for (const stage of STAGES) {
        if (ctrl.signal.aborted) return;
        setActive(stage.id);
        setOpenStage(stage.id);
        let buf = "";
        await streamCompletion(
          cfg,
          [
            { role: "system", content: withFormatRules(stageSystem(stage, context)) },
            { role: "user", content: stage.user(g, acc) },
          ],
          (d) => {
            buf += d;
            setOuts((p) => ({ ...p, [stage.id]: buf }));
          },
          ctrl.signal,
        );
        acc[stage.id] = buf;
        if (stage.id === "guardrails" && /##\s*VERDICT[\s\S]{0,120}?BLOCKED/i.test(buf)) {
          setPhase("done");
          setActive(null);
          toast.error("GUARDRAIL_BLOCKED — proposal conflicts with a hard rule");
          return;
        }
      }
      setPhase("done");
      setActive(null);
      toast.success("INFINITY_LOOP_COMPLETE — 4/4 stages generated");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg = e instanceof TokenLimitError ? TOO_LARGE_MESSAGE : e instanceof Error ? e.message : "AI_ERR";
      setErr(msg);
      setPhase("error");
      setActive(null);
      toast.error(msg);
    }
  }, [goal, cfg, context]);

  const commit = async (stageId: StageId, path: string, content: string) => {
    await copyText(content);
    const folder = path.split("/").slice(0, -1).join("/");
    const fileName = path.split("/").pop() ?? `${stageId}.md`;
    const small = content.length <= 6000;
    window.open(
      newFileIntentUrl({ owner, repo, branch, folder, fileName, content: small ? content : "" }),
      "_blank",
      "noopener,noreferrer",
    );
    toast.success(small ? `COMMIT_INTENT_OPENED → ${path}` : `CONTENT_COPIED — paste into ${path}`);
  };

  const writeLocal = async (path: string, content: string) => {
    if (!bridge || bridge.state !== "ACTIVE") {
      toast.error("LOCAL_SYNC_OFF — connect the CLI bridge first");
      return;
    }
    try {
      const written = await bridge.write([{ path, content }]);
      toast.success(`WROTE_TO_DISK → ${written.join(", ") || path}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "BRIDGE_WRITE_ERR");
    }
  };

  const handoff = buildHandoffPayload(goal.trim() || "(no goal set)", outs, context);
  const done = STAGES.filter((s) => outs[s.id]).length;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--t-bg)]/90 p-0 sm:p-4 sm:pt-[4vh]">
      <div className="flex h-full sm:h-[90vh] w-full max-w-5xl flex-col border border-hard bg-[var(--t-bg)]">
        {/* HEADER */}
        <div className="flex items-center justify-between gap-2 border-b border-hard px-4 py-3">
          <div className="min-w-0 text-[12px] uppercase tracking-widest text-[var(--t-purple)]">
            ♾️ INFINITY_LOOP <span className="text-[var(--t-line)]">//</span> SELF_IMPROVING_SPEC_ENGINE
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-widest">
            <span style={{ color: cfg ? "var(--t-green)" : "var(--t-orange)" }}>
              {cfg ? `[ ${cfg.provider.toUpperCase()} ]` : "[ AI: DISABLED ]"}
            </span>
            <button onClick={onClose} className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim-2)] hover:text-[var(--t-fg)]">
              [ESC]
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 2. CONTEXT AGGREGATOR */}
          <section className="border-b border-hard px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
                [ MULTI_SPEC_CONTEXT_AGGREGATOR ]
              </div>
              <div className="text-[10px] uppercase tracking-widest" style={{ color: loading ? "var(--t-amber)" : "var(--t-green)" }}>
                {loading
                  ? "SCANNING…"
                  : `${stats.files} DOCS · ~${fmtTokens(stats.tokens)} TOK · ${rules.length} RULES`}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {loaded.length === 0 && !loading && (
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-dim-3)]">
                  &gt; NO SYSTEM SPECS FOUND (AGENTS.md / constitution.md / llms.txt / memory.md)
                </span>
              )}
              {loaded.map((l) => {
                const def = SPEC_SOURCES.find((s) => s.kind === l.kind)!;
                return (
                  <span
                    key={l.path}
                    title={`${def.label} — ${l.text ? `${fmtTokens(Math.ceil(l.text.length / 4))} tok` : "UNREADABLE"}`}
                    className="border px-2 py-1 text-[10px]"
                    style={{ borderColor: l.text ? def.color : "var(--t-line)", color: l.text ? def.color : "var(--t-dim-3)" }}
                  >
                    {def.icon} {l.path}
                  </span>
                );
              })}
            </div>
          </section>

          {/* 1. PROMPT INTERFACE */}
          <section className="border-b border-hard px-4 py-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
              &gt; Describe the feature, spec optimization, or bug fix for SPEC DASH to build:
            </div>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              placeholder="e.g. add a per-directory token heatmap to the AI context tree…"
              className="w-full resize-y border border-hard bg-[var(--t-surface)] p-2 text-[13px] text-[var(--t-fg-2)] outline-none focus:border-[var(--t-purple)]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setGoal(p.goal)}
                  className="border border-[var(--t-line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--t-dim)] hover:border-[var(--t-purple)] hover:text-[var(--t-purple)]"
                >
                  [ {p.icon} {p.label} ]
                </button>
              ))}
            </div>

            {preAudit.length > 0 && (
              <div className="mt-3 border border-[var(--t-orange)] p-2">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-[var(--t-orange)]">
                  [ ⚠️ PRE_AUDIT — {preAudit.length} PROJECT RULES TOUCH THIS GOAL ]
                </div>
                <ul className="space-y-1">
                  {preAudit.map((f) => (
                    <li key={f.rule.id} className="text-[11px] text-[var(--t-fg-2)]">
                      <span style={{ color: f.rule.severity === "hard" ? "var(--t-orange)" : "var(--t-amber)" }}>
                        [{f.rule.severity.toUpperCase()}]
                      </span>{" "}
                      {f.rule.text}{" "}
                      <span className="text-[var(--t-dim-3)]">— {f.rule.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {phase === "running" ? (
                <button
                  onClick={stop}
                  className="border border-[var(--t-orange)] px-3 py-2 text-[11px] uppercase tracking-widest text-[var(--t-orange)] hover:bg-[var(--t-orange)] hover:text-[var(--t-on-accent)]"
                >
                  [ STOP_LOOP ]
                </button>
              ) : (
                <button
                  onClick={() => void run()}
                  disabled={!goal.trim() || loading}
                  className="border border-[var(--t-purple)] px-3 py-2 text-[11px] uppercase tracking-widest text-[var(--t-purple)] hover:bg-[var(--t-purple)] hover:text-[var(--t-on-accent)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--t-purple)]"
                >
                  [ ♾️ RUN_4_STAGE_PIPELINE ]
                </button>
              )}
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
                STAGES {done}/4 · SLUG {slug}
              </span>
              {err && <span className="text-[11px] text-[var(--t-orange)]">ERR: {err}</span>}
            </div>
          </section>

          {/* 3. PIPELINE */}
          <section className="px-4 py-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
              [ AUTOMATED_SDD_GENERATION_PIPELINE ]
            </div>
            <div className="space-y-2">
              {STAGES.map((s) => {
                const value = outs[s.id];
                const isActive = active === s.id;
                const open = openStage === s.id;
                const color = value ? "var(--t-green)" : isActive ? "var(--t-amber)" : "var(--t-line)";
                return (
                  <div key={s.id} className="border" style={{ borderColor: color }}>
                    <button
                      onClick={() => setOpenStage(open ? null : s.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                    >
                      <span className="min-w-0 truncate text-[11px] uppercase tracking-widest text-[var(--t-fg)]">
                        {s.icon} STAGE {s.n} · {s.label}{" "}
                        <span className="text-[var(--t-dim-3)]">{s.slash}</span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-widest" style={{ color }}>
                        {isActive ? "STREAMING…" : value ? `✓ ${s.out(slug)}` : "PENDING"}
                      </span>
                    </button>
                    {open && value && (
                      <div className="border-t border-hard p-3">
                        <div className="mb-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
                          <button
                            onClick={() => void copyText(value).then(() => toast.success("COPIED"))}
                            className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
                          >
                            [ COPY ]
                          </button>
                          <button
                            onClick={() => void commit(s.id, s.out(slug), value)}
                            disabled={!owner}
                            className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)] disabled:opacity-40"
                          >
                            [ 💾 COMMIT → {s.out(slug)} ]
                          </button>
                          <button
                            onClick={() => void writeLocal(s.out(slug), value)}
                            disabled={!bridge || bridge.state !== "ACTIVE"}
                            title="Write straight to your local working copy via the CLI bridge"
                            className="border border-[var(--t-amber)] px-2 py-1 text-[var(--t-amber)] hover:bg-[var(--t-amber)] hover:text-[var(--t-on-accent)] disabled:opacity-30"
                          >
                            [ 🔌 WRITE TO DISK ]
                          </button>
                        </div>
                        <MarkdownView source={normalizeAiMarkdown(value)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. EXECUTION DISPATCH */}
          {(tasks.length > 0 || done > 0) && (
            <section className="border-t border-hard px-4 py-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
                [ EXECUTION_MATRIX · {tasks.length} ATOMIC TASKS ]
              </div>
              <div className="space-y-1">
                {tasks.map((t, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 border border-hard px-2 py-2"
                  >
                    <span className="min-w-0 flex-1 text-[11px] text-[var(--t-fg-2)]">
                      <span className="text-[var(--t-dim-3)]">{String(i + 1).padStart(2, "0")}</span> {t}
                    </span>
                    <div className="flex shrink-0 gap-2 text-[10px] uppercase tracking-widest">
                      <button
                        onClick={() => {
                          setPlayTask({ text: taskPrompt(t, goal, outs), nonce: Date.now() });
                          setPlayOpen(true);
                        }}
                        className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
                      >
                        [ ⚡ RUN IN PLAYGROUND ]
                      </button>
                      <ExternalAiMenu
                        path={STAGES[3].out(slug)}
                        text={context}
                        action={taskPrompt(t, goal, outs)}
                        directive="You are an autonomous coding agent executing one atomic task from a spec-driven build. Obey every project rule below."
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-dim-2)]">
                  [ 🌐 PASS ALL PROMPTS TO EXTERNAL AI ]
                </span>
                <ExternalAiMenu
                  path={`${slug} // full-loop-handoff`}
                  text={handoff}
                  action="Execute this spec-driven build end to end, starting with task 1."
                  directive="You are continuing SPEC DASH's Infinity Loop. The payload contains the project rules, functional spec, technical plan and atomic task list."
                />
                <button
                  onClick={() => void copyText(handoff).then(() => toast.success("FULL_HANDOFF_COPIED"))}
                  className="border border-[var(--t-line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
                >
                  [ COPY_FULL_HANDOFF ]
                </button>
                <button
                  onClick={() => {
                    setOuts({});
                    setPhase("idle");
                    setErr(null);
                    toast("LOOP_RESET — refine the goal and iterate");
                  }}
                  className="border border-[var(--t-line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--t-dim)] hover:border-[var(--t-purple)] hover:text-[var(--t-purple)]"
                >
                  [ ♾️ ITERATE_AGAIN ]
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-hard px-4 py-2 text-[9px] uppercase tracking-widest text-[var(--t-dim-3)]">
          GUARDRAILS → SPECIFY → PLAN → TASKS · GENERATED ARTIFACTS COMMIT BACK TO {owner}/{repo}@{branch}
        </div>
      </div>

      <SpecPlayground
        cfg={cfg}
        path={STAGES[3].out(slug)}
        text={handoff}
        open={playOpen}
        onClose={() => setPlayOpen(false)}
        seed={playTask}
      />
    </div>
  );
}