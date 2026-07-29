import type { ReactNode } from "react";

/** Shared brutalist modal shell for the Dev Tools suite. */
export function DevModal({
  title,
  accent = "#00ff66",
  onClose,
  toolbar,
  footer,
  children,
  wide,
}: {
  title: string;
  accent?: string;
  onClose: () => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/85 p-2 pt-[4vh] sm:p-3 sm:pt-[6vh]"
      onMouseDown={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col border border-hard bg-black ${wide ? "max-w-6xl" : "max-w-4xl"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-hard px-4 py-3">
          <div className="truncate text-[12px] uppercase tracking-widest" style={{ color: accent }}>
            [ {title} ]
          </div>
          <button onClick={onClose} className="shrink-0 text-[11px] text-[#666] hover:text-white">
            [ESC]
          </button>
        </div>
        {toolbar && (
          <div className="flex flex-wrap items-center gap-2 border-b border-hard px-3 py-2 text-[10px] uppercase tracking-widest">
            {toolbar}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px]">{children}</div>
        {footer && (
          <div className="border-t border-hard px-4 py-2 text-[9px] uppercase tracking-widest text-[#555]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="border px-2 py-1"
      style={{ borderColor: active ? "#00ff66" : "#333", color: active ? "#00ff66" : "#888" }}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] uppercase tracking-widest text-[#666]">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full border border-[#333] bg-black px-2 py-1.5 font-mono text-[11px] text-[#ccc] outline-none focus:border-[#00ff66]";