import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { serialize, deserialize } from "../engine/save";

/**
 * Cold launch (2026-09 bug hunt): init() ran the offline catch-up, then stamped
 * lastSeen = now WITHOUT writing the caught-up save. An app killed in the first
 * seconds (before any autosave) relaunched on the PRE-catch-up save with lastSeen
 * already reset — the whole time away was lost. The caught-up save and the new
 * lastSeen must land together.
 */
const SAVE_KEY = "singularity.save.v1";
const TIME_KEY = "singularity.lastSeen.v1";

let store: Record<string, string>;
let prevStorage: unknown;

beforeEach(() => {
  store = {};
  prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    key: () => null,
    length: 0,
  };
});
afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
});

describe("cold launch persists the offline catch-up", () => {
  it("writes the caught-up save together with the new lastSeen", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 10 };
    store[SAVE_KEY] = serialize(s);
    store[TIME_KEY] = String(Date.now() - 60 * 60 * 1000); // an hour away
    useGame.getState().init();
    const live = useGame.getState().game;
    expect(live.resources.compute.gt(s.resources.compute)).toBe(true); // it caught up
    // What a crash right now would reload: the caught-up lab, not the old one.
    const onDisk = deserialize(store[SAVE_KEY]!);
    expect(onDisk.resources.compute.toNumber()).toBeCloseTo(live.resources.compute.toNumber(), 3);
    expect(Number(store[TIME_KEY])).toBeGreaterThan(Date.now() - 5_000);
  });
});
