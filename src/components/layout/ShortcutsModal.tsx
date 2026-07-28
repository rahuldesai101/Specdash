import { HOTKEY_GROUPS } from "@/lib/hotkeys";

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/90 p-4 pt-[6vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-2xl border border-[#00ff66] bg-black"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">
            ⌨️ KEYBOARD_SHORTCUTS
          </div>
          <button onClick={onClose} className="min-h-9 px-2 text-[11px] text-[#666] hover:text-white">
            [X CLOSE]
          </button>
        </div>
        <div className="max-h-[76vh] overflow-y-auto p-4 space-y-5">
          {HOTKEY_GROUPS.map((g) => (
            <section key={g.title}>
              <div className="mb-2 text-[10px] uppercase tracking-widest text-[#666]">
                &gt; {g.title}
              </div>
              <ul className="space-y-1">
                {g.rows.map((r) => (
                  <li
                    key={r.desc + r.keys.join("")}
                    className="flex items-center justify-between gap-4 border border-hard px-3 py-2"
                  >
                    <span className="flex flex-wrap items-center gap-1">
                      {r.keys.map((k, i) =>
                        k === "then" ? (
                          <span key={i} className="text-[9px] uppercase tracking-widest text-[#555]">
                            then
                          </span>
                        ) : (
                          <kbd
                            key={i}
                            className="border border-[#00ff66] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#00ff66]"
                          >
                            {k}
                          </kbd>
                        ),
                      )}
                    </span>
                    <span className="text-right text-[11px] text-[#888]">{r.desc}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="border-t border-hard px-4 py-2 text-[9px] uppercase tracking-widest text-[#555]">
          Hotkeys are ignored while typing in inputs, textareas or editors.
        </div>
      </div>
    </div>
  );
}
