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
    <div className="flex flex-wrap items-center gap-2 border-b border-[#ff5500] bg-[#140800] px-4 py-2 text-[10px] uppercase tracking-widest">
      <span className="text-[#ff5500]">[ 🤖 AI OPERATING SYSTEM DETECTED ]</span>
      <span className="text-[#666]">
        {specs.map((s) => s.name).join(" · ")}
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        {specs.map((s) => (
          <button
            key={s.path}
            onClick={() => onOpenFile(s.path)}
            className="border border-[#333] px-2 py-1 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
          >
            📄 {s.name}
          </button>
        ))}
        <button
          onClick={onOpen}
          className="border border-[#ff5500] px-2 py-1 text-[#ff5500] hover:bg-[#ff5500] hover:text-black"
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
      <button aria-label="Close agent panel" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <aside className="relative h-full w-full max-w-xl border-l border-[#ff5500] bg-black flex flex-col">
        <div className="border-b border-hard px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] uppercase tracking-widest text-[#ff5500]">[ 🤖 AI OPERATING SYSTEM ]</div>
            <button onClick={onClose} className="min-h-9 px-2 text-[11px] text-[#666] hover:text-white">
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
                  borderColor: activeSpecPath === s.path ? "#00ff66" : "#333",
                  color: activeSpecPath === s.path ? "#00ff66" : "#888",
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
                  style={{ borderColor: tab === t ? "#00ff66" : "#333", color: tab === t ? "#00ff66" : "#888" }}
                >
                  {t}
                </button>
              ))}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading && <pre className="text-[11px] text-[#666]">&gt; LOADING_ROOT_SPEC...</pre>}
          {error && <pre className="text-[11px] text-[#ff5500]">ERR: {error}</pre>}

          {!loading && !error && spec && tab === "DIRECTIVES" && (
            <>
              {(spec.title || spec.intro) && (
                <Card label="[ OVERVIEW ]" accent="#00ff66">
                  {spec.title && <div className="text-[13px] text-white">{spec.title}</div>}
                  {spec.intro && <p className="mt-1 whitespace-pre-wrap text-[#888]">{spec.intro}</p>}
                </Card>
              )}

              <Card label="[ AGENT BOUNDARIES / SCOPE ]" accent="#ff5500">
                {spec.boundaries.length ? (
                  spec.boundaries.map((s) => (
                    <div key={s.title} className="mb-3 last:mb-0">
                      <div className="text-[11px] uppercase tracking-widest text-[#ff5500]">{s.title}</div>
                      <ul className="mt-1 list-disc pl-5 text-[#ccc]">
                        {(s.bullets.length ? s.bullets : [s.body.slice(0, 300)])
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <span className="text-[#555]">&gt; NO_BOUNDARY_RULES_DETECTED</span>
                )}
              </Card>

              <Card label="[ STYLE GUIDE & CONVENTIONS ]" accent="#00ff66">
                {spec.styleGuides.length ? (
                  spec.styleGuides.map((s) => (
                    <div key={s.title} className="mb-3 last:mb-0">
                      <div className="text-[11px] uppercase tracking-widest text-[#00ff66]">{s.title}</div>
                      <ul className="mt-1 list-disc pl-5 text-[#ccc]">
                        {(s.bullets.length ? s.bullets : [s.body.slice(0, 300)])
                          .filter((b) => b.trim())
                          .map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <span className="text-[#555]">&gt; NO_STYLE_RULES_DETECTED</span>
                )}
              </Card>

              <Card label="[ BUILD / TEST COMMANDS ]" accent="#ffaa00">
                {spec.commands.length ? (
                  <ul className="space-y-2">
                    {spec.commands.map((c) => (
                      <li key={c} className="flex items-stretch gap-2">
                        <code className="min-w-0 flex-1 truncate border border-hard px-2 py-2 text-[11px] text-[#00ff66]">
                          $ {c}
                        </code>
                        <button
                          onClick={() => copyText(c, "COMMAND_COPIED")}
                          className="shrink-0 border border-[#333] px-2 text-[10px] uppercase tracking-widest text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
                        >
                          📋 COPY COMMAND
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-[#555]">&gt; NO_EXECUTABLE_COMMANDS_FOUND</span>
                )}
              </Card>

              {empty && (
                <div className="border border-hard p-3 text-[11px] text-[#666]">
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
                className="border border-[#00ff66] px-3 py-2 text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
              >
                📄 OPEN FULL SPEC
              </button>
              <button
                onClick={() => raw && copyText(raw, "SPEC_COPIED")}
                className="border border-[#333] px-3 py-2 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
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
