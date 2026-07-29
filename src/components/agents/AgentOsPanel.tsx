import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AgentSpec, RootSpec } from "@/lib/agents-spec";
import { MarkdownView } from "@/components/md/MarkdownView";

const copyText = async (v: string, msg: string) => {
  try {
    await navigator.clipboard.writeText(v);
    toast.success(msg);
  } catch {
    toast.error("CLIPBOARD_BLOCKED");
  }
};

export function AgentOsBanner({
  specs,
  onOpen,
  onOpenFile,
}: {
  specs: RootSpec[];
  onOpen: () => void;
  onOpenFile: (path: string) => void;
}) {
  if (!specs.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--t-orange)] bg-[var(--t-tint-warm)] px-4 py-2 text-[10px] uppercase tracking-widest">
      <span className="text-[var(--t-orange)]">[ 🤖 AI OPERATING SYSTEM DETECTED ]</span>
      <span className="text-[var(--t-dim-2)]">
        {specs.map((s) => s.name).join(" · ")}
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        {specs.map((s) => (
          <button
            key={s.path}
            onClick={() => onOpenFile(s.path)}
            className="border border-[var(--t-line)] px-2 py-1 text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
          >
            📄 {s.name}
          </button>
        ))}
        <button
          onClick={onOpen}
          className="border border-[var(--t-orange)] px-2 py-1 text-[var(--t-orange)] hover:bg-[var(--t-orange)] hover:text-[var(--t-on-accent)]"
        >
          🤖 OPEN DIRECTIVES
        </button>
      </div>
    </div>
  );
}

function Card({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-hard">
      <div className="border-b border-hard px-3 py-2 text-[10px] uppercase tracking-widest" style={{ color: accent }}>
        {label}
      </div>
      <div className="px-3 py-3 text-[12px] leading-6">{children}</div>
    </section>
  );
}

export function AgentOsPanel({
  specs,
  activeSpecPath,
  spec,
  raw,
  loading,
  error,
  onSelect,
  onClose,
  onOpenFile,
}: {
  specs: RootSpec[];
  activeSpecPath: string | null;
  spec: AgentSpec | null;
  raw: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}) {
  const [tab, setTab] = useState<"DIRECTIVES" | "RAW">("DIRECTIVES");
  const empty = useMemo(
    () => spec && !spec.boundaries.length && !spec.styleGuides.length && !spec.commands.length,
    [spec],
  );

  return (
    <div className="fixed inset-0 z-[55] flex justify-end">
      <button aria-label="Close agent panel" onClick={onClose} className="absolute inset-0 bg-[var(--t-bg)]/70" />
      <aside className="relative h-full w-full max-w-xl border-l border-[var(--t-orange)] bg-[var(--t-bg)] flex flex-col">
        <div className="border-b border-hard px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] uppercase tracking-widest text-[var(--t-orange)]">[ 🤖 AI OPERATING SYSTEM ]</div>
            <button onClick={onClose} className="min-h-9 px-2 text-[11px] text-[var(--t-dim-2)] hover:text-[var(--t-fg)]">
              [X CLOSE]
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
            {specs.map((s) => (
              <button
                key={s.path}
                onClick={() => onSelect(s.path)}
                className="border px-2 py-1"
                style={{
                  borderColor: activeSpecPath === s.path ? "var(--t-green)" : "var(--t-line)",
                  color: activeSpecPath === s.path ? "var(--t-green)" : "var(--t-dim)",
                }}
              >
                {s.name}
              </button>
            ))}
            <span className="ml-auto flex gap-2">
              {(["DIRECTIVES", "RAW"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="border px-2 py-1"
                  style={{ borderColor: tab === t ? "var(--t-green)" : "var(--t-line)", color: tab === t ? "var(--t-green)" : "var(--t-dim)" }}
                >
                  {t}
                </button>
              ))}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading && <pre className="text-[11px] text-[var(--t-dim-2)]">&gt; LOADING_ROOT_SPEC...</pre>}
          {error && <pre className="text-[11px] text-[var(--t-orange)]">ERR: {error}</pre>}

          {!loading && !error && spec && tab === "DIRECTIVES" && (
            <>
              {(spec.title || spec.intro) && (
                <Card label="[ OVERVIEW ]" accent="var(--t-green)">
                  {spec.title && <div className="text-[13px] text-[var(--t-fg)]">{spec.title}</div>}
                  {spec.intro && <p className="mt-1 whitespace-pre-wrap text-[var(--t-dim)]">{spec.intro}</p>}
                </Card>
              )}

              <Card label="[ AGENT BOUNDARIES / SCOPE ]" accent="var(--t-orange)">
                {spec.boundaries.length ? (
                  spec.boundaries.map((s) => (
                    <div key={s.title} className="mb-3 last:mb-0">
                      <div className="text-[11px] uppercase tracking-widest text-[var(--t-orange)]">{s.title}</div>
                      <ul className="mt-1 list-disc pl-5 text-[var(--t-fg-2)]">
                        {(s.bullets.length ? s.bullets : [s.body.slice(0, 300)])
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <span className="text-[var(--t-dim-3)]">&gt; NO_BOUNDARY_RULES_DETECTED</span>
                )}
              </Card>

              <Card label="[ STYLE GUIDE & CONVENTIONS ]" accent="var(--t-green)">
                {spec.styleGuides.length ? (
                  spec.styleGuides.map((s) => (
                    <div key={s.title} className="mb-3 last:mb-0">
                      <div className="text-[11px] uppercase tracking-widest text-[var(--t-green)]">{s.title}</div>
                      <ul className="mt-1 list-disc pl-5 text-[var(--t-fg-2)]">
                        {(s.bullets.length ? s.bullets : [s.body.slice(0, 300)])
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <span className="text-[var(--t-dim-3)]">&gt; NO_STYLE_RULES_DETECTED</span>
                )}
              </Card>

              <Card label="[ BUILD / TEST COMMANDS ]" accent="var(--t-amber)">
                {spec.commands.length ? (
                  <ul className="space-y-2">
                    {spec.commands.map((c) => (
                      <li key={c} className="flex items-stretch gap-2">
                        <code className="min-w-0 flex-1 truncate border border-hard px-2 py-2 text-[11px] text-[var(--t-green)]">
                          $ {c}
                        </code>
                        <button
                          onClick={() => copyText(c, "COMMAND_COPIED")}
                          className="shrink-0 border border-[var(--t-line)] px-2 text-[10px] uppercase tracking-widest text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
                        >
                          📋 COPY COMMAND
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[var(--t-dim-3)]">&gt; NO_EXECUTABLE_COMMANDS_FOUND</span>
                )}
              </Card>

              {empty && (
                <div className="border border-hard p-3 text-[11px] text-[var(--t-dim-2)]">
                  &gt; Spec detected but no structured directives parsed — view RAW.
                </div>
              )}
            </>
          )}

          {!loading && !error && tab === "RAW" && raw && (
            <div className="text-[13px] leading-7">
              <MarkdownView source={raw} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-hard px-4 py-3 text-[10px] uppercase tracking-widest">
          {activeSpecPath && (
            <>
              <button
                onClick={() => onOpenFile(activeSpecPath)}
                className="border border-[var(--t-green)] px-3 py-2 text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
              >
                📄 OPEN FULL SPEC
              </button>
              <button
                onClick={() => raw && copyText(raw, "SPEC_COPIED")}
                className="border border-[var(--t-line)] px-3 py-2 text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
              >
                📋 COPY RAW
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
