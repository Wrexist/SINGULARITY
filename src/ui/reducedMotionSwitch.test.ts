import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * The Settings "Reduced motion" switch under the OS preference.
 *
 * Motion is reduced when EITHER the in-app toggle OR the device's Reduce Motion is on
 * (settings.ts `motionReduced`). The switch showed only the stored in-app value, so a
 * player with Reduce Motion on in iOS (and the in-app toggle off — any save whose
 * settings were written before they turned it on) saw "Reduced motion: off" while
 * every animation was held still, and tapping it did nothing they could see: on, off,
 * the game stayed exactly as calm. The switch now reads what the game does and says
 * the device is holding it on.
 */

type Win = { matchMedia: (q: string) => { matches: boolean; addEventListener: () => void } };
const g = globalThis as unknown as { window?: Win; localStorage?: unknown };
let hadWindow = false;
let hadStorage = false;

beforeAll(() => {
  hadWindow = "window" in g;
  hadStorage = "localStorage" in g;
  // Settings saved before the player turned Reduce Motion on in iOS: toggle off.
  const saved: Record<string, string> = { "singularity.settings.v1": JSON.stringify({ reducedMotion: false, onboarded: true }) };
  if (!hadStorage) g.localStorage = { getItem: (k: string) => saved[k] ?? null, setItem: () => {}, removeItem: () => {} };
  // The device asks for reduced motion; the stored in-app toggle is off.
  g.window = { matchMedia: (q: string) => ({ matches: q.includes("reduce"), addEventListener: () => {} }) };
});
afterAll(() => {
  if (!hadWindow) delete g.window;
  if (!hadStorage) delete g.localStorage;
});

/** The Reduced motion row's switch markup. */
function row(html: string): string {
  const m = /<button[^>]*role="switch"[^>]*>(?:(?!<\/button>).)*Reduced motion(?:(?!<\/button>).)*<\/button>/s.exec(html);
  return m?.[0] ?? "";
}

describe("Reduced motion switch honours the device setting", () => {
  it("reads on, and cannot be turned off, while the device reduces motion", async () => {
    const { useSettings, motionReduced } = await import("./settings");
    expect(useSettings.getState().reducedMotion).toBe(false);
    expect(motionReduced()).toBe(true); // the game IS holding motion still
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { SettingsSheet } = await import("./SettingsSheet");
    const html = renderToStaticMarkup(createElement(SettingsSheet, { onClose: () => {}, onReset: () => {} }));
    const r = row(html);
    expect(r).not.toBe("");
    expect(r).toContain('aria-checked="true"');
    // A tap cannot change what the device decides, so the switch says so rather than
    // flipping to a state the game will not honour.
    expect(r).toMatch(/aria-disabled="true"|disabled=""/);
    expect(r).toMatch(/device|system/i);
  });

  it("still follows the in-app toggle when the device does not reduce motion", async () => {
    const { rowState } = await import("./SettingsSheet");
    expect(rowState(false, false)).toEqual({ value: false, locked: false });
    expect(rowState(true, false)).toEqual({ value: true, locked: false });
    expect(rowState(false, true)).toEqual({ value: true, locked: true });
    expect(rowState(true, true)).toEqual({ value: true, locked: true });
  });
});
