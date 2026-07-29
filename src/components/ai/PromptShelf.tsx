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
              borderColor: p.id === activeId ? "#00ff66" : "#333",
              color: p.id === activeId ? "#00ff66" : "#888",
            }}
          >
            [ {p.icon} {p.name} ]
          </button>
        ))}
        <button
          onClick={() =>
            setEditing({ id: newPresetId(), icon: "⚡", name: "NEW PRESET", system: "", template: "" })
          }
          className="border border-[#ff5500] px-2 py-1 text-[10px] uppercase tracking-widest text-[#ff5500] hover:bg-[#ff5500] hover:text-black"
        >
          + SAVE NEW TEMPLATE
        </button>
      </div>

      {editing ? (
        <div className="space-y-2 border border-[#ff5500] p-3">
          <div className="grid gap-2 sm:grid-cols-[4rem_minmax(0,1fr)]">
            <input
              value={editing.icon}
              onChange={(e) => setEditing({ ...editing, icon: e.target.value.slice(0, 2) })}
              className="w-full border border-hard bg-black px-2 py-2 text-[12px] text-white outline-none focus:border-[#00ff66]"
            />
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="PRESET NAME"
              className="w-full border border-hard bg-black px-2 py-2 text-[12px] text-white outline-none focus:border-[#00ff66]"
            />
          </div>
          <textarea
            value={editing.system}
            onChange={(e) => setEditing({ ...editing, system: e.target.value })}
            rows={2}
            placeholder="SYSTEM INSTRUCTION — who the model is and how it must behave"
            className="w-full resize-y border border-hard bg-[#0a0a0a] p-2 text-[12px] text-[#ddd] outline-none focus:border-[#00ff66]"
          />
          <textarea
            value={editing.template}
            onChange={(e) => setEditing({ ...editing, template: e.target.value })}
            rows={5}
            placeholder="Template body — use {{file}}, {{repo}}, {{selection}} or any {{custom}} variable"
            className="w-full resize-y border border-hard bg-[#0a0a0a] p-2 text-[12px] text-[#ddd] outline-none focus:border-[#00ff66]"
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
              className="border border-[#00ff66] px-3 py-2 text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
            >
              [ SAVE PRESET ]
            </button>
            <button onClick={() => setEditing(null)} className="border border-[#333] px-3 py-2 text-[#888] hover:text-white">
              [ CANCEL ]
            </button>
          </div>
        </div>
      ) : active ? (
        <>
          <div className="border border-hard p-2 text-[10px] leading-relaxed text-[#666]">
            &gt; SYSTEM: <span className="text-[#c07cff]">{active.system || "(none)"}</span>
          </div>

          {names.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {names.map((n) => (
                <label key={n} className="block">
                  <span className="mb-1 block text-[9px] uppercase tracking-widest text-[#666]">
                    {`{{${n}}}`} {ctx[n] ? "· AUTO" : ""}
                  </span>
                  {n === "selection" || n === "content" ? (
                    <textarea
                      value={vars[n] ?? ""}
                      onChange={(e) => setVars((v) => ({ ...v, [n]: e.target.value }))}
                      rows={3}
                      className="w-full resize-y border border-hard bg-[#0a0a0a] p-2 text-[11px] text-[#ddd] outline-none focus:border-[#00ff66]"
                    />
                  ) : (
                    <input
                      value={vars[n] ?? ""}
                      onChange={(e) => setVars((v) => ({ ...v, [n]: e.target.value }))}
                      className="w-full border border-hard bg-black px-2 py-2 text-[11px] text-white outline-none focus:border-[#00ff66]"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <pre className="max-h-40 overflow-auto border border-hard bg-[#050505] p-2 text-[11px] whitespace-pre-wrap text-[#999]">
            {prompt}
          </pre>

          {missing.length > 0 && (
            <div className="text-[10px] uppercase tracking-widest text-[#ffaa00]">
              &gt; UNFILLED: {missing.map((m) => `{{${m}}}`).join(" ")}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
            {onRun && (
              <button
                onClick={() => onRun(prompt, active)}
                className="border border-[#00ff66] px-3 py-2 text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
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
              className="border border-[#333] px-3 py-2 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
            >
              📋 COPY
            </button>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[#555]">ARENA →</span>
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
                className="ml-auto border border-[#ff5500] px-3 py-2 text-[#ff5500] hover:bg-[#ff5500] hover:text-black"
              >
                🗑 DELETE
              </button>
            )}
            {!active.builtin && (
              <button
                onClick={() => setEditing(active)}
                className="border border-[#333] px-3 py-2 text-[#888] hover:text-white"
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