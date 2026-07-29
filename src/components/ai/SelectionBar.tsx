import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { EXTERNAL_PROVIDERS, buildExternalPayload, launchExternalAi } from "@/lib/external-ai";

export type SelectionPayload = { text: string; path: string };

type Pos = { x: number; y: number; flip: boolean };

/**
 * Floating action bar shown whenever the user highlights text anywhere in the
 * app (markdown specs, code blocks, raw views). Each action forwards the
 * highlighted text plus its source file straight into the target feature.
 */
export function SelectionBar({
  sourcePath,
  onExplain,
  onAddToPack,
  onRefine,
}: {
  /** Path of the file currently open — attached to every action. */
  sourcePath: string | null;
  onExplain: (sel: SelectionPayload) => void;
  onAddToPack: (sel: SelectionPayload) => void;
  onRefine: (sel: SelectionPayload) => void;
}) {
  const [sel, setSel] = useState<SelectionPayload | null>(null);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0, flip: false });
  const [aiOpen, setAiOpen] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  const clear = useCallback(() => {
    setSel(null);
    setAiOpen(false);
  }, []);

  useEffect(() => {
    const read = () => {
      const s = window.getSelection();
      const text = s?.toString() ?? "";
      if (!s || s.isCollapsed || text.trim().length < 3) {
        setSel(null);
        setAiOpen(false);
        return;
      }
      // Ignore selections inside the bar itself or form controls.
      const node = s.anchorNode as HTMLElement | null;
      const el = node?.nodeType === 1 ? (node as HTMLElement) : node?.parentElement ?? null;
      if (el?.closest("[data-selection-bar]") || el?.closest("input,textarea")) return;

      const rect = s.getRangeAt(0).getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return;
      const flip = rect.top < 88;
      setPos({
        x: Math.min(Math.max(rect.left + rect.width / 2, 190), window.innerWidth - 190),
        y: flip ? rect.bottom + 10 : rect.top - 10,
        flip,
      });
      setSel({ text, path: sourcePath ?? "selection" });
    };

    const onUp = () => setTimeout(read, 0);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keyup", onUp);
    document.addEventListener("selectionchange", () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed) {
        setSel(null);
        setAiOpen(false);
      }
    });
    window.addEventListener("scroll", clear, true);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keyup", onUp);
      window.removeEventListener("scroll", clear, true);
    };
  }, [sourcePath, clear]);

  if (!sel || typeof document === "undefined") return null;

  const act = (fn: (s: SelectionPayload) => void) => () => {
    fn(sel);
    window.getSelection()?.removeAllRanges();
    clear();
  };

  const launch = async (id: string) => {
    const p = EXTERNAL_PROVIDERS.find((x) => x.id === id);
    if (!p) return;
    const payload = buildExternalPayload({
      path: sel.path,
      rawText: sel.text,
      action: "Explain and pressure-test the highlighted excerpt above. Flag anything ambiguous.",
    });
    const r = await launchExternalAi(p, payload);
    toast.success(
      r.copied
        ? `[ ⚡ Content copied & passed to ${p.label}. Press Ctrl+V if field isn't pre-filled ]`
        : `[ ⚡ ${p.label} opened — copy the excerpt manually ]`,
    );
    clear();
  };

  const chars = sel.text.length;

  return createPortal(
    <div
      ref={barRef}
      data-selection-bar
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-[85] -translate-x-1/2 border border-[var(--t-green)] bg-[var(--t-bg)] shadow-[0_0_0_1px_var(--t-on-accent)]"
      style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.flip ? "0" : "-100%"})` }}
    >
      <div className="flex items-stretch divide-x divide-[var(--t-surface-2)] text-[10px] uppercase tracking-widest">
        <span className="grid place-items-center px-2 text-[var(--t-dim-3)]">{chars} CH</span>
        <BarBtn onClick={act(onExplain)} color="var(--t-green)">
          ⚡ EXPLAIN
        </BarBtn>
        <BarBtn onClick={act(onAddToPack)} color="var(--t-amber)">
          🎒 ADD TO TOKEN PACK
        </BarBtn>
        <BarBtn onClick={() => setAiOpen((v) => !v)} color="var(--t-blue)">
          🌐 TEST IN EXTERNAL AI
        </BarBtn>
        <BarBtn onClick={act(onRefine)} color="var(--t-purple)">
          ♾️ REFINE
        </BarBtn>
      </div>
      {aiOpen && (
        <div className="flex flex-wrap gap-1 border-t border-[var(--t-surface-2)] p-1">
          {EXTERNAL_PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => void launch(p.id)}
              className="border px-2 py-1 text-[10px] uppercase tracking-widest"
              style={{ borderColor: `${p.color}55`, color: p.color }}
            >
              {p.dot} {p.label}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

function BarBtn({
  onClick,
  color,
  children,
}: {
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="whitespace-nowrap px-3 py-2 hover:bg-[var(--t-surface-2)]"
      style={{ color }}
    >
      {children}
    </button>
  );
}