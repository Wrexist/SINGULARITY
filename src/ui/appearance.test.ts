import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Opt-in Dark appearance (2026-09). The app was light-only while the hall, the brand
 * and the store shots are dark. Settings → Appearance now offers Light / Dark / Match
 * device. Light is the DEFAULT, so no existing player sees a change until they opt in;
 * the choice lives in the settings store (localStorage), never in the game save.
 */

const KEY = "singularity.settings.v1";
type Listener = (e: { matches: boolean }) => void;
const g = globalThis as unknown as Record<string, unknown>;
let store: Record<string, string>;
let osDark: boolean;
let listeners: Set<Listener>;
let attrs: Record<string, string>;
let meta: Record<string, string>;
const saved: Record<string, unknown> = {};

function install(stored?: Record<string, unknown>) {
  store = stored ? { [KEY]: JSON.stringify(stored) } : {};
  listeners = new Set();
  attrs = {};
  meta = { content: "#eef1f8" };
  g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  g.window = {
    matchMedia: (q: string) => ({
      get matches() { return q.includes("prefers-color-scheme: dark") ? osDark : false; },
      addEventListener: (_t: string, fn: Listener) => { if (q.includes("color-scheme")) listeners.add(fn); },
      removeEventListener: (_t: string, fn: Listener) => { listeners.delete(fn); },
    }),
  };
  g.document = {
    documentElement: { getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => { attrs[k] = v; } },
    querySelector: (s: string) => (s.includes("theme-color") ? { getAttribute: (k: string) => meta[k] ?? null, setAttribute: (k: string, v: string) => { meta[k] = v; } } : null),
  };
}
function flipDevice(dark: boolean) {
  osDark = dark;
  for (const fn of listeners) fn({ matches: dark });
}

beforeEach(() => {
  for (const k of ["localStorage", "window", "document"]) saved[k] = g[k];
  osDark = false;
  vi.resetModules();
});
afterEach(() => {
  for (const k of ["localStorage", "window", "document"]) { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; }
});

describe("Appearance setting", () => {
  it("defaults to Light for an existing player, even on a dark device", async () => {
    install({ onboarded: true, sound: false }); // settings written before this feature
    osDark = true;
    const { useSettings } = await import("./settings");
    const { startAppearance } = await import("./appearance");
    expect(useSettings.getState().appearance).toBe("light");
    const stop = startAppearance();
    expect(attrs["data-theme"]).toBe("light");
    expect(meta.content).toBe("#eef1f8");
    stop();
  });

  it("defaults to Light on a fresh install", async () => {
    install();
    const { useSettings } = await import("./settings");
    expect(useSettings.getState().appearance).toBe("light");
  });

  it("applies Dark when chosen, persists it to the settings store, and back", async () => {
    install({ onboarded: true });
    const { useSettings } = await import("./settings");
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    useSettings.getState().setAppearance("dark");
    expect(attrs["data-theme"]).toBe("dark");
    expect(meta.content).toBe("#0e1119");
    expect(JSON.parse(store[KEY]!).appearance).toBe("dark");
    expect(store["singularity.save.v1"]).toBeUndefined(); // never the game save
    useSettings.getState().setAppearance("light");
    expect(attrs["data-theme"]).toBe("light");
    stop();
  });

  it("restores a saved Dark choice on the next launch", async () => {
    install({ appearance: "dark" });
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    expect(attrs["data-theme"]).toBe("dark");
    stop();
  });

  it("Match device follows prefers-color-scheme live", async () => {
    install({ appearance: "system" });
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    expect(attrs["data-theme"]).toBe("light");
    flipDevice(true);
    expect(attrs["data-theme"]).toBe("dark");
    flipDevice(false);
    expect(attrs["data-theme"]).toBe("light");
    stop();
    flipDevice(true); // unsubscribed: no longer follows
    expect(attrs["data-theme"]).toBe("light");
  });

  it("a Dark device does not darken an explicit Light choice", async () => {
    install({ appearance: "light" });
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    flipDevice(true);
    expect(attrs["data-theme"]).toBe("light");
    stop();
  });

  it("reads a hostile stored value as Light and never persists it", async () => {
    install({ appearance: { evil: 1 } });
    const { useSettings, sanitizeAppearance } = await import("./settings");
    expect(useSettings.getState().appearance).toBe("light");
    for (const bad of ["neon", "", null, 3, "DARK"]) expect(sanitizeAppearance(bad)).toBe("light");
    useSettings.getState().setAppearance("sepia" as never);
    expect(useSettings.getState().appearance).toBe("light");
  });

  it("Settings shows an Appearance radiogroup — Light, Dark, Match device — with Light checked", async () => {
    install({ onboarded: true });
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { SettingsSheet } = await import("./SettingsSheet");
    const html = renderToStaticMarkup(createElement(SettingsSheet, { onClose: () => {}, onReset: () => {} }));
    const group = /<div class="set-appear" role="radiogroup"[^>]*>(.*?)<\/div>/s.exec(html)?.[1] ?? "";
    const opts = [...group.matchAll(/<button[^>]*aria-checked="(true|false)"[^>]*>.*?<span>([^<]+)<\/span><\/button>/gs)].map((m) => [m[2], m[1]]);
    expect(opts).toEqual([["Light", "true"], ["Dark", "false"], ["Match device", "false"]]);
  });
});

describe("Dark theme stylesheet", () => {
  const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");
  const block = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    return i < 0 ? "" : css.slice(i, css.indexOf("\n}", i));
  };
  const tokens = (b: string) => new Set([...b.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]!));

  it("redefines the core surface and ink tokens under :root[data-theme=\"dark\"]", () => {
    const dark = tokens(block(':root[data-theme="dark"]'));
    for (const t of ["--bg", "--bg-2", "--ink", "--ink-2", "--ink-3", "--glass", "--glass-strong", "--surface", "--panel", "--shade-rgb", "--line"]) {
      expect(dark.has(t), t).toBe(true);
    }
  });

  it("only redefines tokens the light theme already defines (no dark-only names)", () => {
    const light = tokens(block(":root"));
    for (const t of tokens(block(':root[data-theme="dark"]'))) expect(light.has(t), t).toBe(true);
  });

  it("paints solid cards from --surface, not a raw white literal (knobs excepted)", () => {
    // Toggle knobs and slider thumbs stay white in both themes (the iOS convention).
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const bad = [...noComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, sel, body]) => /background(-color)?:[^;]*(#fff\b|#ffffff\b|\bwhite\b)/i.test(body!) && !/knob|thumb|align-marker|pd-switch::after/.test(sel!))
      .map(([, sel]) => sel!.trim());
    expect(bad).toEqual([]);
  });
});
