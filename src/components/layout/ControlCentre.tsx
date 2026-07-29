import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EXTERNAL_PROVIDERS } from "@/lib/external-ai";
import { getPreferredProviderId, setPreferredProviderId } from "@/lib/external-ai";
import { getThemeMode, setThemeMode, type ThemeMode } from "@/lib/theme";

export { applyStoredTheme } from "@/lib/theme";

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string }> = [
  { id: "light", label: "☀️ LIGHT" },
  { id: "dark", label: "🌙 DARK" },
  { id: "system", label: "💻 SYSTEM" },
];

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
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setThemeAndStore = (t: ThemeMode) => {
    setTheme(t);
    setThemeMode(t);
  };

  return (
    <div className="fixed inset-0 z-[90]">
      <button aria-label="Close control centre" onClick={onClose} className="absolute inset-0 bg-[var(--t-bg)]/85" />
      <aside className="absolute inset-y-0 right-0 flex w-[92vw] max-w-[420px] flex-col border-l border-hard bg-[var(--t-bg)]">
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <span className="text-[11px] uppercase tracking-widest text-[var(--t-green)]">[ ⚙️ CONTROL CENTRE ]</span>
          <button onClick={onClose} className="min-h-9 min-w-9 text-[var(--t-dim-2)] hover:text-[var(--t-orange)]">
            [X]
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="API & ACCESS TOKENS">
            <Row
              label={hasPat ? "GITHUB PAT: CONNECTED" : "GITHUB PAT: NOT SET"}
              icon={hasPat ? "🟢" : "🔴"}
              tone={hasPat ? "var(--t-green)" : "var(--t-orange)"}
              onClick={onOpenPat}
            />
            <Row label={aiLabel} icon="⚡" tone="var(--t-purple)" onClick={onOpenAi} />
            <Row label="SWITCH REPOSITORY" icon="⇄" onClick={onSwitchRepo} />
            <Row label="LOCAL WORKSPACE CLI BRIDGE" icon="🔌" tone="var(--t-amber)" onClick={onOpenBridge} />
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
                    borderColor: target === p.id ? p.color : "var(--t-line)",
                    color: target === p.id ? p.color : "var(--t-dim)",
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
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  aria-pressed={theme === t.id}
                  onClick={() => setThemeAndStore(t.id)}
                  className="flex-1 border px-1 py-2 text-[10px] uppercase tracking-widest transition-colors duration-150"
                  style={{
                    borderColor: theme === t.id ? "var(--t-green)" : "var(--t-line)",
                    color: theme === t.id ? "var(--t-green)" : "var(--t-dim)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Row
              label="CLEAR IN-MEMORY SEARCH INDEX"
              icon="🧹"
              tone="var(--t-amber)"
              onClick={() => {
                sessionStorage.clear();
                toast.success("SEARCH INDEX CLEARED — REBUILDING");
                setTimeout(() => window.location.reload(), 300);
              }}
            />
            <Row
              label="RESET WORKSPACE STATE"
              icon="⌫"
              tone="var(--t-orange)"
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
      <div className="px-4 py-2 text-[9px] uppercase tracking-widest text-[var(--t-dim-3)]">[ {title} ]</div>
      {children}
    </section>
  );
}

function Row({
  label,
  icon,
  tone = "var(--t-fg-2)",
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
      className="flex w-full items-center gap-2 border-t border-[var(--t-surface-2)] px-4 py-3 text-left text-[11px] uppercase tracking-widest hover:bg-[var(--t-surface-2)]"
      style={{ color: tone }}
    >
      <span className="w-4 shrink-0 text-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[var(--t-line)]">›</span>
    </button>
  );
}