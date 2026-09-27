import { useSettings, type Appearance } from "./settings";

/**
 * Appearance → the `data-theme` attribute on <html> (2026-09).
 *
 * The dark palette lives entirely in styles.css as `:root[data-theme="dark"]`
 * overrides of the same custom properties the light theme uses, so this module only
 * decides WHICH theme applies and keeps the attribute in sync:
 *   - Light (the default): `data-theme="light"` — the pre-existing look, untouched.
 *   - Dark: `data-theme="dark"`.
 *   - Match device: follows `prefers-color-scheme`, live, while the app is open.
 *
 * Known limitation (documented, deliberately not fixed here): on iOS the status-bar
 * strip is painted natively from capacitor.config.ts `ios.backgroundColor` (#eef1f8)
 * with `contentInset: "always"`, so in Dark that strip stays light until a native
 * change (@capacitor/status-bar, or contentInset "never" + safe-area CSS) has been
 * device-tested.
 */

export type Theme = "light" | "dark";

/** The page colour behind everything in each theme (mirrors `--bg` in styles.css). */
export const THEME_BG: Record<Theme, string> = { light: "#eef1f8", dark: "#0e1119" };

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(appearance: Appearance, osDark: boolean): Theme {
  if (appearance === "dark") return "dark";
  if (appearance === "system") return osDark ? "dark" : "light";
  return "light";
}

type MQ = { matches: boolean; addEventListener?: (t: "change", fn: (e: { matches: boolean }) => void) => void; removeEventListener?: (t: "change", fn: (e: { matches: boolean }) => void) => void };

function darkQuery(): MQ | null {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" ? (window.matchMedia(DARK_QUERY) as unknown as MQ) : null;
  } catch {
    return null;
  }
}

/** Paint `theme` onto the document root (attribute + the browser theme-color). */
export function applyTheme(theme: Theme, doc: Document | undefined = typeof document !== "undefined" ? document : undefined): void {
  if (!doc?.documentElement) return;
  const root = doc.documentElement;
  if (root.getAttribute("data-theme") !== theme) root.setAttribute("data-theme", theme);
  try {
    const meta = doc.querySelector?.('meta[name="theme-color"]');
    if (meta && meta.getAttribute("content") !== THEME_BG[theme]) meta.setAttribute("content", THEME_BG[theme]);
  } catch {
    /* ignore — a document without querySelector just keeps its meta */
  }
}

/**
 * Apply the stored appearance now and keep it applied: re-runs when the setting
 * changes and when the device flips light/dark (for Match device). Call once at boot,
 * before the first render, so a Dark player never sees a light flash.
 * Returns an unsubscribe (tests).
 */
export function startAppearance(): () => void {
  const mq = darkQuery();
  const sync = () => applyTheme(resolveTheme(useSettings.getState().appearance, !!mq?.matches));
  sync();
  const unsub = useSettings.subscribe((s, prev) => { if (s.appearance !== prev.appearance) sync(); });
  const onChange = () => sync();
  try { mq?.addEventListener?.("change", onChange); } catch { /* old WebKit: no live follow */ }
  return () => {
    unsub();
    try { mq?.removeEventListener?.("change", onChange); } catch { /* ignore */ }
  };
}
