import { Capacitor } from "@capacitor/core";
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
 * iOS status bar: the web view runs edge to edge (capacitor.config.ts
 * `contentInset: "never"`), so the page itself paints the strip behind the status bar
 * in either theme. What the page can't paint is the status TEXT: left alone, iOS picks
 * it from the SYSTEM appearance, i.e. white text over the Light app on a dark-mode
 * phone. So on device every resolved theme is also pushed to @capacitor/status-bar.
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
function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let statusBarShown: Theme | null = null;
let statusBarQueue: Promise<void> = Promise.resolve();

/**
 * Match the iOS status-bar text to `theme` — on device only, once per change.
 * Capacitor names the styles by the BACKGROUND they suit (@capacitor/status-bar
 * definitions.d.ts): `Style.Light` = dark text for light backgrounds, `Style.Dark` =
 * light text for dark ones — so Light → Style.Light, Dark → Style.Dark.
 * Calls run one after another, so quick flips always end on the latest theme. The
 * plugin is imported lazily so the web build never loads it, and any failure (an
 * older native shell without the plugin, a rejected call) just leaves the bar as it
 * was: it's cosmetic and must never break the app.
 */
export function syncStatusBar(theme: Theme): Promise<void> {
  if (!isNative()) return statusBarQueue;
  statusBarQueue = statusBarQueue.then(async () => {
    if (statusBarShown === theme) return;
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
      statusBarShown = theme;
    } catch {
      /* leave the bar as it is; the next theme change tries again */
    }
  });
  return statusBarQueue;
}

/** Resolves once every queued status-bar update has run (tests). */
export function statusBarIdle(): Promise<void> {
  return statusBarQueue;
}

export function startAppearance(): () => void {
  const mq = darkQuery();
  const sync = () => {
    const theme = resolveTheme(useSettings.getState().appearance, !!mq?.matches);
    applyTheme(theme);
    void syncStatusBar(theme);
  };
  sync();
  const unsub = useSettings.subscribe((s, prev) => { if (s.appearance !== prev.appearance) sync(); });
  const onChange = () => sync();
  try { mq?.addEventListener?.("change", onChange); } catch { /* old WebKit: no live follow */ }
  return () => {
    unsub();
    try { mq?.removeEventListener?.("change", onChange); } catch { /* ignore */ }
  };
}
