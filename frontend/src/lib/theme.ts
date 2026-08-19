/**
 * Theme helpers — Eduardo OS Next.
 * Persists light/dark to localStorage (`eduardoos-theme`) and syncs html attrs.
 */

export const THEME_STORAGE_KEY = "eduardoos-theme";

export type SiteTheme = "light" | "dark";

export function readStoredTheme(): SiteTheme | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode */
  }
  return null;
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(): SiteTheme {
  return readStoredTheme() ?? (systemPrefersDark() ? "dark" : "light");
}

export function applyTheme(theme: SiteTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function toggleTheme(): SiteTheme {
  const next: SiteTheme = resolveTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
