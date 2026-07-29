import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem = {
  icon: string;
  label: string;
  keys?: string;
  hint?: string;
  accent?: string;
  disabled?: boolean;
  onSelect: () => void;
};

/**
 * Brutalist dropdown command menu.
 * Portal-rendered with viewport-aware right/left alignment so it never clips.
 */
export function HeaderMenu({
  icon,
  label,
  items,
  accent = "var(--t-green)",
  triggerClass = "",
  ariaLabel,
}: {
  icon: string;
  label?: string;
  items: MenuItem[];
  accent?: string;
  triggerClass?: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 260 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(300, Math.max(240, window.innerWidth - 24));
    const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 6, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        title={ariaLabel}
        className={`inline-flex shrink-0 items-center gap-1 border px-2 py-1.5 text-[10px] uppercase tracking-widest transition-colors ${triggerClass}`}
        style={{ borderColor: open ? accent : "var(--t-line)", color: open ? accent : "var(--t-fg-2)" }}
      >
        <span>{icon}</span>
        {label && <span className="hidden md:inline">{label}</span>}
        <span className="text-[8px]" style={{ color: accent }}>
          ▾
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            role="menu"
            className="fixed z-[80] border border-hard bg-[var(--t-bg)] shadow-[0_0_0_1px_var(--t-on-accent)]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className="flex w-full items-center gap-2 border-b border-[var(--t-surface-2)] px-3 py-2.5 text-left text-[11px] last:border-b-0 hover:bg-[var(--t-surface-2)] disabled:cursor-not-allowed disabled:opacity-35"
                style={{ color: it.accent ?? "var(--t-fg-2)" }}
              >
                <span className="w-4 shrink-0 text-center">{it.icon}</span>
                <span className="min-w-0 flex-1 truncate">
                  {it.label}
                  {it.hint && <span className="ml-1 text-[9px] text-[var(--t-dim-3)]">{it.hint}</span>}
                </span>
                {it.keys && (
                  <span className="shrink-0 border border-[var(--t-line-2)] px-1 text-[9px] tracking-widest text-[var(--t-dim-2)]">
                    {it.keys}
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
