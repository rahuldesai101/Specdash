import { useEffect, useRef, useState } from "react";
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
  dropUp = false,
  className = "",
}: {
  path: string;
  text: string | null;
  action: string;
  directive?: string;
  dropUp?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const payload = () => buildExternalPayload({ path, rawText: text ?? "", action, directive });

  const go = async (p: ExternalProvider) => {
    setOpen(false);
    if (!text) {
      toast.error("SPEC_NOT_LOADED");
      return;
    }
    const { copied, prefilled } = await launchExternalAi(p, payload());
    toast.success(
      prefilled
        ? `${p.label} OPENED — prompt prefilled`
        : copied
          ? `${p.label} OPENED — payload copied, paste with Ctrl/Cmd+V`
          : `${p.label} OPENED — clipboard blocked, copy manually`,
    );
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={!text}
        title="No API key needed — opens the spec + prompt in a free AI web chat"
        className="border border-[#333] px-3 py-1.5 text-[11px] uppercase tracking-widest hover:border-[#00ff66] hover:text-[#00ff66] disabled:opacity-40 disabled:hover:border-[#333] disabled:hover:text-inherit"
      >
        [ 🌐 OPEN IN EXTERNAL AI ▾ ]
      </button>
      {open && (
        <div className={`absolute right-0 z-[70] w-[290px] border border-hard bg-black ${dropUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
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
        </div>
      )}
    </div>
  );
}
