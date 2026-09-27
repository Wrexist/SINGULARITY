import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

/**
 * The in-app "Reduced motion" toggle defaults to OFF.
 *
 * settings.ts used to seed the toggle from the OS `prefers-reduced-motion` on first run.
 * Since the OS preference is now read live (motionReduced = OS || toggle), that seed only
 * baked a device setting into the save: a player who later turned Reduce Motion off in
 * iOS stayed reduced, because the copied in-app toggle was still on and nothing said why.
 * The toggle is now the player's own choice (off until they flip it); the device still
 * reduces motion live. A saved choice is kept exactly as stored.
 */

type Win = { matchMedia: (q: string) => { matches: boolean; addEventListener: () => void } };
const g = globalThis as unknown as { window?: Win; localStorage?: unknown };
const hadWindow = "window" in g;
const hadStorage = "localStorage" in g;
let saved: Record<string, string> = {};

beforeEach(() => {
  vi.resetModules();
  saved = {};
  g.localStorage = { getItem: (k: string) => saved[k] ?? null, setItem: (k: string, v: string) => { saved[k] = v; }, removeItem: (k: string) => { delete saved[k]; } };
  // The device asks for reduced motion.
  g.window = { matchMedia: (q: string) => ({ matches: q.includes("reduce"), addEventListener: () => {} }) };
});
afterAll(() => {
  if (!hadWindow) delete g.window;
  if (!hadStorage) delete g.localStorage;
});

describe("the in-app reduced-motion toggle", () => {
  it("defaults to off on a fresh install, while the device still reduces motion live", async () => {
    const { useSettings, motionReduced } = await import("./settings");
    expect(useSettings.getState().reducedMotion).toBe(false);
    expect(motionReduced()).toBe(true);
  });

  it("keeps a saved choice: on stays on", async () => {
    saved["singularity.settings.v1"] = JSON.stringify({ reducedMotion: true, onboarded: true });
    const { useSettings } = await import("./settings");
    expect(useSettings.getState().reducedMotion).toBe(true);
  });

  it("keeps a saved choice: off stays off", async () => {
    saved["singularity.settings.v1"] = JSON.stringify({ reducedMotion: false, onboarded: true });
    const { useSettings } = await import("./settings");
    expect(useSettings.getState().reducedMotion).toBe(false);
  });
});
