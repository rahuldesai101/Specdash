import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const KEY = "sd:theme";
const EVT = "sd:theme-change";

/** Resolves the mode the user picked (may be "system"). */
export function getThemeMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "dark";
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "dark";
}

/** Resolves the concrete palette to paint right now. */
export function resolveTheme(mode: ThemeMode = getThemeMode()): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function paint(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(KEY, mode);
  paint(mode);
  window.dispatchEvent(new CustomEvent(EVT, { detail: mode }));
}

/** Applies the stored theme on boot and keeps "system" in sync with the OS. */
export function applyStoredTheme() {
  if (typeof document === "undefined") return;
  paint(getThemeMode());
  if (!window.matchMedia) return;
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (getThemeMode() === "system") {
      paint("system");
      window.dispatchEvent(new CustomEvent(EVT, { detail: "system" }));
    }
  });
}

/** Re-renders a component whenever the resolved theme flips. */
export function useThemeMode(): "light" | "dark" {
  const [t, setT] = useState<"light" | "dark">(() =>
    typeof document === "undefined"
      ? "dark"
      : document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark",
  );
  useEffect(() => {
    const sync = () => setT(resolveTheme());
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  return t;
}
