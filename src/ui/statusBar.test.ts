import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * iOS status bar vs the Dark appearance (2026-09). The web view now runs edge to edge
 * (contentInset "never") so the page paints the strip behind the status bar, and the
 * status TEXT colour follows the app's theme through @capacitor/status-bar — instead
 * of following the SYSTEM appearance (white text over the Light app on a dark phone).
 * Capacitor names styles by background: Style.Light = dark text, Style.Dark = light text.
 */

const h = vi.hoisted(() => ({ native: true, calls: [] as string[], fail: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.native } }));
vi.mock("@capacitor/status-bar", () => ({
  Style: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
  StatusBar: {
    setStyle: async ({ style }: { style: string }) => {
      if (h.fail) throw new Error("plugin not implemented");
      h.calls.push(style);
    },
  },
}));

const KEY = "singularity.settings.v1";
type Listener = (e: { matches: boolean }) => void;
const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let osDark = false;
let listeners: Set<Listener>;

function install(stored?: Record<string, unknown>) {
  const store: Record<string, string> = stored ? { [KEY]: JSON.stringify(stored) } : {};
  const attrs: Record<string, string> = {};
  listeners = new Set();
  g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  g.window = {
    matchMedia: () => ({
      get matches() { return osDark; },
      addEventListener: (_t: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_t: string, fn: Listener) => listeners.delete(fn),
    }),
  };
  g.document = {
    documentElement: { getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => { attrs[k] = v; } },
    querySelector: () => null,
  };
}
/** Wait for every queued status-bar update of this test's appearance module. */
const settle = async () => {
  const m = (await import("./appearance")) as { statusBarIdle?: () => Promise<void> };
  await m.statusBarIdle?.();
};
function flipDevice(dark: boolean) {
  osDark = dark;
  for (const fn of listeners) fn({ matches: dark });
}

beforeEach(() => {
  for (const k of ["localStorage", "window", "document"]) saved[k] = g[k];
  h.native = true;
  h.calls = [];
  h.fail = false;
  osDark = false;
  vi.resetModules();
});
afterEach(() => {
  for (const k of ["localStorage", "window", "document"]) { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; }
});

describe("iOS status-bar text follows the app theme", () => {
  it("Light at startup → dark text (Style.Light), even on a dark-mode phone", async () => {
    install({ appearance: "light" });
    osDark = true;
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    await settle();
    expect(h.calls).toEqual(["LIGHT"]);
    stop();
  });

  it("Dark at startup → light text (Style.Dark)", async () => {
    install({ appearance: "dark" });
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    await settle();
    expect(h.calls).toEqual(["DARK"]);
    stop();
  });

  it("switching the setting re-styles the bar, once per change", async () => {
    install({ appearance: "light" });
    const { useSettings } = await import("./settings");
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    await settle();
    useSettings.getState().setAppearance("dark");
    await settle();
    useSettings.getState().setAppearance("system"); // device is light → Light again
    await settle();
    useSettings.getState().setAppearance("light"); // resolved theme unchanged: no call
    await settle();
    expect(h.calls).toEqual(["LIGHT", "DARK", "LIGHT"]);
    stop();
  });

  it("Match device follows the phone flipping light/dark with the app open", async () => {
    install({ appearance: "system" });
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    await settle();
    flipDevice(true);
    await settle();
    flipDevice(false);
    await settle();
    expect(h.calls).toEqual(["LIGHT", "DARK", "LIGHT"]);
    stop();
  });

  it("rapid flips land on the LAST theme", async () => {
    install({ appearance: "light" });
    const { useSettings } = await import("./settings");
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    useSettings.getState().setAppearance("dark");
    useSettings.getState().setAppearance("light");
    useSettings.getState().setAppearance("dark");
    await settle();
    expect(h.calls.at(-1)).toBe("DARK");
    // Calls run in order, never two at once, and never repeat the style already shown.
    expect(h.calls).toEqual(["LIGHT", "DARK", "LIGHT", "DARK"]);
    stop();
  });

  it("never touches the plugin on the web", async () => {
    h.native = false;
    install({ appearance: "dark" });
    const { startAppearance } = await import("./appearance");
    const stop = startAppearance();
    await settle();
    expect(h.calls).toEqual([]);
    stop();
  });

  it("a failing plugin never throws and is retried on the next change", async () => {
    h.fail = true;
    install({ appearance: "dark" });
    const { useSettings } = await import("./settings");
    const { startAppearance, syncStatusBar } = await import("./appearance");
    const stop = startAppearance();
    await settle();
    await expect(syncStatusBar("dark")).resolves.toBeUndefined();
    h.fail = false;
    useSettings.getState().setAppearance("light");
    await settle();
    expect(h.calls).toEqual(["LIGHT"]);
    stop();
  });
});

describe("edge-to-edge iOS shell", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  it("capacitor.config.ts lets the page paint under the status bar", () => {
    const cfg = read("../../capacitor.config.ts");
    expect(cfg).toMatch(/contentInset:\s*"never"/);
    expect(cfg).toMatch(/backgroundColor:\s*"#eef1f8"/);
  });

  it("the status-bar plugin is a dependency at the Capacitor 7 major", () => {
    const pkg = JSON.parse(read("../../package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@capacitor/status-bar"]).toMatch(/^\^7\./);
    expect(pkg.dependencies["@capacitor/core"]).toMatch(/^\^7\./);
  });

  it("every official Capacitor package shares core's major (a mixed major breaks pod install)", () => {
    const pkg = JSON.parse(read("../../package.json")) as { dependencies: Record<string, string> };
    const major = (v: string) => v.replace(/^[\^~]/, "").split(".")[0];
    const core = major(pkg.dependencies["@capacitor/core"] ?? "");
    const caps = Object.entries(pkg.dependencies).filter(([n]) => n.startsWith("@capacitor/"));
    expect(caps.length).toBeGreaterThan(3);
    for (const [, v] of caps) expect(major(v)).toBe(core);
  });

  it("every safe-area inset in the stylesheet is overridable (var(--sa*, env(...)))", () => {
    const css = read("./styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const all = [...css.matchAll(/env\(safe-area-inset-(top|bottom|left|right)[^)]*\)/g)];
    expect(all.length).toBeGreaterThan(10);
    const bare = [...css.matchAll(/(?<!var\(--sa[tblr], )env\(safe-area-inset-[a-z]+[^)]*\)/g)].map((m) => m[0]);
    expect(bare).toEqual([]);
  });

  it("at rest the resource bar's opaque slab stops at the 8px gap, not over the brand", () => {
    // With a real top inset, "-8px - inset" reached up over the brand header on every
    // notched phone (browser check: slab top 60px, brand 77-107px at a 59px inset).
    const css = read("./styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rest = /:root:not\(\[data-scrolled\]\) \.resource-bar::before \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rest).toMatch(/top:\s*-8px;/);
    const slab = /\.resource-bar::before \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(slab).toMatch(/--sal/);
    expect(slab).toMatch(/--sar/);
  });
});
