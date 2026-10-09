import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The 3D Lab (beta) switch is a stored setting, and stored settings are hostile input
 * like the save: only a real `true` turns the 3D renderer on. Everything else — a
 * missing key, an older settings blob, a garbled value — reads as the shipped 2D hall.
 */

function memStorage(seed: Record<string, string>) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}

const KEY = "singularity.settings.v1";

describe("3D Lab (beta) setting", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("is off for everyone by default, including an older settings blob without it", async () => {
    vi.stubGlobal("localStorage", memStorage({ [KEY]: JSON.stringify({ sound: false, onboarded: true }) }));
    const { useSettings } = await import("./settings");
    expect(useSettings.getState().lab3d).toBe(false);
  });

  it("reads a garbled stored value as off", async () => {
    vi.stubGlobal("localStorage", memStorage({ [KEY]: JSON.stringify({ lab3d: "yes" }) }));
    const { useSettings } = await import("./settings");
    expect(useSettings.getState().lab3d).toBe(false);
  });

  it("toggles on, persists, and survives a reload", async () => {
    const store = memStorage({});
    vi.stubGlobal("localStorage", store);
    const first = await import("./settings");
    first.useSettings.getState().toggle("lab3d");
    expect(first.useSettings.getState().lab3d).toBe(true);
    expect(JSON.parse(store.dump()[KEY]!).lab3d).toBe(true);
    vi.resetModules();
    const second = await import("./settings");
    expect(second.useSettings.getState().lab3d).toBe(true);
  });
});
