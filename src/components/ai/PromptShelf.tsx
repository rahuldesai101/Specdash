import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  extractVars,
  loadPresets,
  newPresetId,
  removePreset,
  renderTemplate,
  upsertPreset,
  type PromptPreset,
} from "@/lib/prompt-presets";
import { EXTERNAL_PROVIDERS, copyText, launchExternalAi } from "@/lib/external-ai";

export type ShelfContext = Record<string, string>;

/**
 * Saved-prompt shelf: pick a template, fill its `{{variables}}`, then run it
 * in the local engine or fan it out across the free web AI apps.
 */
export function PromptShelf({
  ctx,
  onRun,
  compact,
}: {
  /** Auto-filled variables: file, repo, selection, framework… */
  ctx: ShelfContext;
  /** Execute in the in-app engine (playground). */
  onRun?: (prompt: string, preset: PromptPreset) => void;
  compact?: boolean;
}) {
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [vars, setVars] = useState<ShelfContext>({});
  const [editing, setEditing] = useState<PromptPreset | null>(null);

  useEffect(() => {
    const list = loadPresets();
    setPresets(list);
    setActiveId((p) => p ?? list[0]?.id ?? null);
  }, []);

  const active = presets.find((p) => p.id === activeId) ?? null;
  const names = useMemo(() => (active ? extractVars(active.template) : []), [active]);

  useEffect(() => {
    if (!active) return;
    setVars((prev) => {
      const next: ShelfContext = { ...prev };
      for (const n of extractVars(active.template)) {
        if (next[n] === undefined) next[n] = ctx[n] ?? "";
      }
      return next;
    });
  }, [active, ctx]);

  const merged = { ...ctx, ...vars };
  const prompt = active ? renderTemplate(active.template, merged) : "";
  const missing = names.filter((n) => !merged[n]?.trim());

  const fanOut = async (id: string) => {
    const p = EXTERNAL_PROVIDERS.find((x) => x.id === id);
    if (!p || !active) return;
    const payload = `[ SYSTEM DIRECTIVE ]\n${active.system}\n\n[ PROMPT ]\n${prompt}`;
    const r = await launchExternalAi(p, payload);
    toast.success(r.prefilled ? `PREFILLED → ${p.label}` : `COPIED → PASTE INTO ${p.label}`);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveId(p.id)}
            className="border px-2 py-1 text-[10px] uppercase tracking-widest"
            style={{
              borderColor: p.id === activeId ? "var(--t-green)" : "var(--t-line)",
              color: p.id === activeId ? "var(--t-green)" : "var(--t-dim)",
            }}
          >
            [ {p.icon} {p.name} ]
          </button>
        ))}
        <button
          onClick={() =>
            setEditing({ id: newPresetId(), icon: "⚡", name: "NEW PRESET", system: "", template: "" })
          }
          className="border border-[var(--t-orange)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--t-orange)] hover:bg-[var(--t-orange)] hover:text-[var(--t-on-accent)]"
        >
          + SAVE NEW TEMPLATE
        </button>
      </div>

      {editing ? (
        <div className="space-y-2 border border-[var(--t-orange)] p-3">
          <div className="grid gap-2 sm:grid-cols-[4rem_minmax(0,1fr)]">
            <input
              value={editing.icon}
              onChange={(e) => setEditing({ ...editing, icon: e.target.value.slice(0, 2) })}
              className="w-full border border-hard bg-[var(--t-bg)] px-2 py-2 text-[12px] text-[var(--t-fg)] outline-none focus:border-[var(--t-green)]"
            />
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="PRESET NAME"
              className="w-full border border-hard bg-[var(--t-bg)] px-2 py-2 text-[12px] text-[var(--t-fg)] outline-none focus:border-[var(--t-green)]"
            />
          </div>
          <textarea
            value={editing.system}
            onChange={(e) => setEditing({ ...editing, system: e.target.value })}
            rows={2}
            placeholder="SYSTEM INSTRUCTION — who the model is and how it must behave"
            className="w-full resize-y border border-hard bg-[var(--t-surface)] p-2 text-[12px] text-[var(--t-fg-2)] outline-none focus:border-[var(--t-green)]"
          />
          <textarea
            value={editing.template}
            onChange={(e) => setEditing({ ...editing, template: e.target.value })}
            rows={5}
            placeholder="Template body — use {{file}}, {{repo}}, {{selection}} or any {{custom}} variable"
            className="w-full resize-y border border-hard bg-[var(--t-surface)] p-2 text-[12px] text-[var(--t-fg-2)] outline-none focus:border-[var(--t-green)]"
          />
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
            <button
              onClick={() => {
                if (!editing.name.trim() || !editing.template.trim()) {
                  toast.error("NAME_AND_TEMPLATE_REQUIRED");
                  return;
                }
                const next = upsertPreset(presets, editing);
                setPresets(next);
                setActiveId(editing.id);
                setEditing(null);
                toast.success("PRESET_SAVED");
              }}
              className="border border-[var(--t-green)] px-3 py-2 text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
            >
              [ SAVE PRESET ]
            </button>
            <button onClick={() => setEditing(null)} className="border border-[var(--t-line)] px-3 py-2 text-[var(--t-dim)] hover:text-[var(--t-fg)]">
              [ CANCEL ]
            </button>
          </div>
        </div>
      ) : active ? (
        <>
          <div className="border border-hard p-2 text-[10px] leading-relaxed text-[var(--t-dim-2)]">
            &gt; SYSTEM: <span className="text-[var(--t-purple)]">{active.system || "(none)"}</span>
          </div>

          {names.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {names.map((n) => (
                <label key={n} className="block">
                  <span className="mb-1 block text-[9px] uppercase tracking-widest text-[var(--t-dim-2)]">
                    {`{{${n}}}`} {ctx[n] ? "· AUTO" : ""}
                  </span>
                  {n === "selection" || n === "content" ? (
                    <textarea
                      value={vars[n] ?? ""}
                      onChange={(e) => setVars((v) => ({ ...v, [n]: e.target.value }))}
                      rows={3}
                      className="w-full resize-y border border-hard bg-[var(--t-surface)] p-2 text-[11px] text-[var(--t-fg-2)] outline-none focus:border-[var(--t-green)]"
                    />
                  ) : (
                    <input
                      value={vars[n] ?? ""}
                      onChange={(e) => setVars((v) => ({ ...v, [n]: e.target.value }))}
                      className="w-full border border-hard bg-[var(--t-bg)] px-2 py-2 text-[11px] text-[var(--t-fg)] outline-none focus:border-[var(--t-green)]"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <pre className="max-h-40 overflow-auto border border-hard bg-[var(--t-surface)] p-2 text-[11px] whitespace-pre-wrap text-[var(--t-dim)]">
            {prompt}
          </pre>

          {missing.length > 0 && (
            <div className="text-[10px] uppercase tracking-widest text-[var(--t-amber)]">
              &gt; UNFILLED: {missing.map((m) => `{{${m}}}`).join(" ")}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
            {onRun && (
              <button
                onClick={() => onRun(prompt, active)}
                className="border border-[var(--t-green)] px-3 py-2 text-[var(--t-green)] hover:bg-[var(--t-green)] hover:text-[var(--t-on-accent)]"
              >
                ▶ RUN IN PLAYGROUND
              </button>
            )}
            <button
              onClick={() =>
                copyText(`[ SYSTEM ]\n${active.system}\n\n[ PROMPT ]\n${prompt}`).then((ok) =>
                  ok ? toast.success("PROMPT_COPIED") : toast.error("CLIPBOARD_BLOCKED"),
                )
              }
              className="border border-[var(--t-line)] px-3 py-2 text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
            >
              📋 COPY
            </button>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--t-dim-3)]">ARENA →</span>
              {EXTERNAL_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void fanOut(p.id)}
                  className="border px-2 py-2"
                  style={{ borderColor: `${p.color}55`, color: p.color }}
                >
                  {p.dot} {p.label}
                </button>
              ))}
            </span>
            {!active.builtin && (
              <button
                onClick={() => {
                  const next = removePreset(presets, active.id);
                  setPresets(next);
                  setActiveId(next[0]?.id ?? null);
                  toast.success("PRESET_DELETED");
                }}
                className="ml-auto border border-[var(--t-orange)] px-3 py-2 text-[var(--t-orange)] hover:bg-[var(--t-orange)] hover:text-[var(--t-on-accent)]"
              >
                🗑 DELETE
              </button>
            )}
            {!active.builtin && (
              <button
                onClick={() => setEditing(active)}
                className="border border-[var(--t-line)] px-3 py-2 text-[var(--t-dim)] hover:text-[var(--t-fg)]"
              >
                ✏️ EDIT
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}