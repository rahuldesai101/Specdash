/**
 * Global developer hotkey engine.
 *
 * A single window-level keydown listener translates key combos (including the
 * vim-style `g` chord) into named actions. Any component can subscribe to an
 * action without owning keyboard logic.
 */

export type HotkeyAction =
  | "search"
  | "help"
  | "goHome"
  | "goPlayground"
  | "goReadme"
  | "specPlayground"
  | "specExternalAi"
  | "specToggleDiagram"
  | "specToggleSideBySide"
  | "specCopyRaw"
  | "specOpenGithub"
  | "toggleRail"
  | "toggleReader"
  | "escape";

type Handler = () => void;

const subs = new Map<HotkeyAction, Set<Handler>>();

export function onHotkey(action: HotkeyAction, fn: Handler): () => void {
  const set = subs.get(action) ?? new Set<Handler>();
  set.add(fn);
  subs.set(action, set);
  return () => set.delete(fn);
}

export function emitHotkey(action: HotkeyAction) {
  subs.get(action)?.forEach((fn) => fn());
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable === true;
}

/** Installs the listener. Returns an unsubscribe/cleanup function. */
export function installHotkeys(): () => void {
  let chord = false;
  let chordTimer: ReturnType<typeof setTimeout> | null = null;

  const clearChord = () => {
    chord = false;
    if (chordTimer) clearTimeout(chordTimer);
    chordTimer = null;
  };

  const handler = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const typing = isTyping(e.target);

    if (key === "escape") {
      clearChord();
      emitHotkey("escape");
      return;
    }

    // --- always-on combos (work even inside inputs) ---------------------------
    if (mod && key === "k") {
      e.preventDefault();
      emitHotkey("search");
      return;
    }
    if (mod && key === "/") {
      e.preventDefault();
      emitHotkey("help");
      return;
    }

    if (e.altKey && !mod) {
      const map: Record<string, HotkeyAction> = {
        p: "specPlayground",
        e: "specExternalAi",
        d: "specToggleDiagram",
        v: "specToggleSideBySide",
        c: "specCopyRaw",
        g: "specOpenGithub",
      };
      const action = map[key];
      if (action) {
        e.preventDefault();
        emitHotkey(action);
      }
      return;
    }

    if (typing || mod) return;

    // --- `g` chord navigation --------------------------------------------------
    if (chord) {
      clearChord();
      const nav: Record<string, HotkeyAction> = {
        h: "goHome",
        p: "goPlayground",
        r: "goReadme",
      };
      const action = nav[key];
      if (action) {
        e.preventDefault();
        emitHotkey(action);
        return;
      }
    }
    if (key === "g") {
      chord = true;
      chordTimer = setTimeout(clearChord, 1200);
      return;
    }

    if (e.key === "?" || (e.shiftKey && e.key === "/")) {
      e.preventDefault();
      emitHotkey("help");
      return;
    }
    if (e.key === "[") {
      e.preventDefault();
      emitHotkey("toggleRail");
      return;
    }
    if (e.key === "]") {
      e.preventDefault();
      emitHotkey("toggleReader");
    }
  };

  window.addEventListener("keydown", handler);
  return () => {
    clearChord();
    window.removeEventListener("keydown", handler);
  };
}

export type HotkeyRow = { keys: string[]; desc: string };
export type HotkeyGroup = { title: string; rows: HotkeyRow[] };

export const HOTKEY_GROUPS: HotkeyGroup[] = [
  {
    title: "GLOBAL & NAVIGATION",
    rows: [
      { keys: ["Ctrl/⌘", "K"], desc: "Open full-text search" },
      { keys: ["?"], desc: "Toggle this shortcuts overlay" },
      { keys: ["Ctrl/⌘", "/"], desc: "Toggle this shortcuts overlay" },
      { keys: ["G", "then", "H"], desc: "Go home / repository root" },
      { keys: ["G", "then", "P"], desc: "Go to AI Playground" },
      { keys: ["G", "then", "R"], desc: "Go to README / How It Works" },
      { keys: ["["], desc: "Toggle left navigation rail" },
      { keys: ["]"], desc: "Toggle spec reader" },
      { keys: ["Esc"], desc: "Close drawers, modals and reader" },
    ],
  },
  {
    title: "SPEC VIEWER ACTIONS",
    rows: [
      { keys: ["Alt", "P"], desc: "Open active spec in AI Playground" },
      { keys: ["Alt", "E"], desc: "Open External AI deep-link studio" },
      { keys: ["Alt", "D"], desc: "Toggle visual workflow / raw diagram source" },
      { keys: ["Alt", "V"], desc: "Toggle side-by-side raw markdown view" },
      { keys: ["Alt", "C"], desc: "Copy raw file content" },
      { keys: ["Alt", "G"], desc: "Open active file on GitHub" },
    ],
  },
  {
    title: "AI PLAYGROUND",
    rows: [
      { keys: ["Ctrl/⌘", "Enter"], desc: "Execute active prompt" },
      { keys: ["Enter"], desc: "Send message" },
      { keys: ["Shift", "Enter"], desc: "Newline" },
    ],
  },
];