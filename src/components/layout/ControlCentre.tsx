import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EXTERNAL_PROVIDERS } from "@/lib/external-ai";
import { getPreferredProviderId, setPreferredProviderId } from "@/lib/external-ai";

const THEME_KEY = "sd:theme";

export function applyStoredTheme() {
  if (typeof document === "undefined") return;
  const t = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
}

/**
 * ⚙️ CONTROL CENTRE — right-side slide-over holding every global setting:
 * access tokens, default external LLM, appearance and cache resets.
 */
export function ControlCentre({
  onClose,
  hasPat,
  aiLabel,
  onOpenPat,
  onOpenAi,
  onSwitchRepo,
  onOpenBridge,
  onOpenShortcuts,
  onOpenReadme,
}: {
  onClose: () => void;
  hasPat: boolean;
  aiLabel: string;
  onOpenPat: () => void;
  onOpenAi: () => void;
  onSwitchRepo: () => void;
  onOpenBridge: () => void;
  onOpenShortcuts: () => void;
  onOpenReadme: () => void;
}) {
  const [target, setTarget] = useState(getPreferredProviderId());
  const [theme, setTheme] = useState<"dark" | "light">(
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setThemeAndStore = (t: "dark" | "light") => {
    setTheme(t);
    localStorage.setItem(THEME_KEY, t);
    document.documentElement.setAttribute("data-theme", t);
  };

  return (
    <div className="fixed inset-0 z-[90]">
      <button aria-label="Close control centre" onClick={onClose} className="absolute inset-0 bg-black/85" />
      <aside className="absolute inset-y-0 right-0 flex w-[92vw] max-w-[420px] flex-col border-l border-hard bg-black">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <span className="text-[11px] uppercase tracking-widest text-[#00ff66]">[ ⚙️ CONTROL CENTRE ]</span>
          <button onClick={onClose} className="min-h-9 min-w-9 text-[#666] hover:text-[#ff5500]">
            [X]
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="API & ACCESS TOKENS">
            <Row
              label={hasPat ? "GITHUB PAT: CONNECTED" : "GITHUB PAT: NOT SET"}
              icon={hasPat ? "🟢" : "🔴"}
              tone={hasPat ? "#00ff66" : "#ff5500"}
              onClick={onOpenPat}
            />
            <Row label={aiLabel} icon="⚡" tone="#c07cff" onClick={onOpenAi} />
            <Row label="SWITCH REPOSITORY" icon="⇄" onClick={onSwitchRepo} />
            <Row label="LOCAL WORKSPACE CLI BRIDGE" icon="🔌" tone="#ffaa00" onClick={onOpenBridge} />
          </Section>

          <Section title="TARGET LLM DEFAULT">
            <div className="grid grid-cols-2 gap-1 px-3 pb-3">
              {EXTERNAL_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setTarget(p.id);
                    setPreferredProviderId(p.id);
                    toast.success(`DEFAULT EXTERNAL AI → ${p.label.toUpperCase()}`);
                  }}
                  className="flex items-center gap-2 border px-2 py-2 text-left text-[10px] uppercase tracking-widest"
                  style={{
                    borderColor: target === p.id ? p.color : "#333",
                    color: target === p.id ? p.color : "#888",
                  }}
                >
                  <span>{p.dot}</span>
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="APPEARANCE & CACHE">
            <div className="flex gap-1 px-3 pb-2">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setThemeAndStore(t)}
                  className="flex-1 border px-2 py-2 text-[10px] uppercase tracking-widest"
                  style={{ borderColor: theme === t ? "#00ff66" : "#333", color: theme === t ? "#00ff66" : "#888" }}
                >
                  {t === "dark" ? "🌑 DARK" : "☀ LIGHT"}
                </button>
              ))}
            </div>
            <Row
              label="CLEAR IN-MEMORY SEARCH INDEX"
              icon="🧹"
              tone="#ffaa00"
              onClick={() => {
                sessionStorage.clear();
                toast.success("SEARCH INDEX CLEARED — REBUILDING");
                setTimeout(() => window.location.reload(), 300);
              }}
            />
            <Row
              label="RESET WORKSPACE STATE"
              icon="⌫"
              tone="#ff5500"
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                toast.success("WORKSPACE RESET");
                setTimeout(() => window.location.assign("/"), 300);
              }}
            />
          </Section>

          <Section title="HELP">
            <Row label="KEYBOARD SHORTCUTS" icon="⌨" onClick={onOpenShortcuts} />
            <Row label="READ ME / HOW IT WORKS" icon="📖" onClick={onOpenReadme} />
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-hard">
      <div className="px-4 py-2 text-[9px] uppercase tracking-widest text-[#555]">[ {title} ]</div>
      {children}
    </section>
  );
}

function Row({
  label,
  icon,
  tone = "#ddd",
  onClick,
}: {
  label: string;
  icon: string;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 border-t border-[#151515] px-4 py-3 text-left text-[11px] uppercase tracking-widest hover:bg-[#0d0d0d]"
      style={{ color: tone }}
    >
      <span className="w-4 shrink-0 text-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[#444]">›</span>
    </button>
  );
}