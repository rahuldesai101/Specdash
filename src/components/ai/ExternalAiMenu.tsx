import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  EXTERNAL_PROVIDERS,
  buildExternalPayload,
  copyText,
  launchExternalAi,
  type ExternalProvider,
} from "@/lib/external-ai";

/**
 * [ 🌐 OPEN IN EXTERNAL AI ▾ ] — zero-cost deep-link launcher.
 * Requires no API key: payload is copied to the clipboard and the provider's
 * web chat is opened (prefilled when the URL budget allows).
 */
export function ExternalAiMenu({
  path,
  text,
  action,
  directive,
  repo,
  dropUp = false,
  className = "",
  compact = false,
  openSignal = 0,
}: {
  path: string;
  text: string | null;
  action: string;
  directive?: string;
  repo?: string;
  dropUp?: boolean;
  className?: string;
  /** Renders a minimal icon-sized trigger (used in code-block toolbars). */
  compact?: boolean;
  /** Increment to open the menu programmatically (Alt+E hotkey). */
  openSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pad = 16;
    const width = 290;
    const menuH = menuRef.current?.offsetHeight ?? 220;
    const below = window.innerHeight - r.bottom - pad;
    const above = r.top - pad;
    // Auto-flip: drop up when there isn't room below but there is above.
    const flip = dropUp || (below < Math.min(menuH, 220) && above > below);
    const maxH = Math.min(window.innerHeight - 32, flip ? above : below);
    const top = flip ? Math.max(pad, r.top - 4 - Math.min(menuH, maxH)) : r.bottom + 4;
    const left = Math.min(
      Math.max(pad, r.right - width),
      Math.max(pad, window.innerWidth - width - pad),
    );
    setPos({ top, left, maxH: Math.max(140, maxH) });
  }, [dropUp]);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    place();
    const on = () => place();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const payload = () => buildExternalPayload({ path, rawText: text ?? "", action, directive, repo });

  const go = async (p: ExternalProvider) => {
    setOpen(false);
    if (!text) {
      toast.error("SPEC_NOT_LOADED");
      return;
    }
    const { copied } = await launchExternalAi(p, payload());
    toast.success(
      copied
        ? `[ ⚡ Content copied & passed to ${p.label}. Press Ctrl+V if field isn't pre-filled ]`
        : `[ ⚡ ${p.label} opened — clipboard blocked, copy the payload manually ]`,
    );
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        disabled={!text}
        title="No API key needed — opens the spec + prompt in a free AI web chat"
        className={
          compact
            ? "border border-[#333] px-2 py-1 text-[9px] uppercase tracking-widest text-[#888] hover:border-[#00ff66] hover:text-[#00ff66] disabled:opacity-40"
            : "border border-[#333] px-3 py-1.5 text-[11px] uppercase tracking-widest hover:border-[#00ff66] hover:text-[#00ff66] disabled:opacity-40 disabled:hover:border-[#333] disabled:hover:text-inherit"
        }
      >
        {compact ? "🌐 TEST IN EXTERNAL AI" : "[ 🌐 OPEN IN EXTERNAL AI (ALT+E) ▾ ]"}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] w-[290px] overflow-y-auto border border-hard bg-black"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              maxHeight: pos ? Math.min(pos.maxH, window.innerHeight - 32) : undefined,
              visibility: pos ? "visible" : "hidden",
            }}
          >
          <div className="border-b border-[#222] px-3 py-2 text-[10px] uppercase tracking-widest text-[#666]">
            ZERO-COST // NO API KEY REQUIRED
          </div>
          {EXTERNAL_PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => void go(p)}
              className="flex w-full items-center gap-2 border-b border-[#161616] px-3 py-2 text-left text-[11px] uppercase tracking-widest text-[#ccc] hover:bg-[#0d0d0d]"
              style={{ borderLeft: `2px solid transparent` }}
              onMouseEnter={(e) => (e.currentTarget.style.borderLeftColor = p.color)}
              onMouseLeave={(e) => (e.currentTarget.style.borderLeftColor = "transparent")}
            >
              <span>{p.dot}</span>
              <span className="flex-1">{p.label}</span>
              <span className="text-[9px] text-[#555]">{p.urlLimit ? "PREFILL" : "PASTE"}</span>
            </button>
          ))}
          <button
            onClick={async () => {
              setOpen(false);
              if (!text) return toast.error("SPEC_NOT_LOADED");
              toast[(await copyText(payload())) ? "success" : "error"](
                "PAYLOAD COPIED TO CLIPBOARD",
              );
            }}
            className="w-full px-3 py-2 text-left text-[11px] uppercase tracking-widest text-[#666] hover:text-[#00ff66]"
          >
            [ 📋 COPY PAYLOAD ONLY ]
          </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
