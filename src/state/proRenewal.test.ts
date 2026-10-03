import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import { balance } from "../engine/balance/config";
import { PRO_UNTIL_KEY, hadProAt, proLapseConfirmed, hasPro, setProUntil } from "./premium";

/**
 * A subscription renews at Apple, usually while an idle game is closed. The device's
 * stored expiry only moves when the store next answers — after the launch catch-up
 * has already run. The away window is paid at the tier the player LEFT with, and a
 * lapse that has only happened on the device clock is not treated as confirmed (Pro
 * cosmetics wait for the store).
 */
const SAVE_KEY = "singularity.save.v1";
const TIME_KEY = "singularity.lastSeen.v1";
const H = 3_600_000;
const T0 = 20_000 * 24 * H + 9 * H;

let storage: Record<string, string>;
let prevStorage: unknown;

beforeEach(() => {
  storage = {};
  prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  vi.setSystemTime(T0);
});

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Close at `left` with the subscription stored as expiring at `until`, reopen at `back`;
 *  returns the seconds of play the catch-up credited. */
function awayWindow(left: number, until: number | null, back: number): number {
  vi.setSystemTime(left);
  const s = createInitialState();
  s.upgrades = { rack_basic: 5 };
  storage = { [SAVE_KEY]: serialize(s), [TIME_KEY]: String(left) };
  if (until !== null) storage[PRO_UNTIL_KEY] = String(until);
  vi.setSystemTime(back);
  const before = s.stats.playtimeSec;
  useGame.getState().init();
  return useGame.getState().game.stats.playtimeSec - before;
}

describe("away window across a renewal", () => {
  it("a subscriber who left with Pro is paid as Pro, though the stored expiry passed while away", () => {
    // Expiry one day after leaving; back three days later (renewed at Apple, not yet synced).
    const credited = awayWindow(T0, T0 + 24 * H, T0 + 72 * H);
    const freeCapSec = balance.offline.maxHours * 3600;
    expect(credited).toBeGreaterThan(freeCapSec * 1.5);
  });

  it("a player without Pro when they left is paid at the free tier", () => {
    const credited = awayWindow(T0, T0 - H, T0 + 72 * H);
    expect(credited).toBeLessThanOrEqual(balance.offline.maxHours * 3600 + 1);
  });

  it("matches a never-subscribed player at the free tier", () => {
    expect(awayWindow(T0, T0 - H, T0 + 72 * H)).toBe(awayWindow(T0, null, T0 + 72 * H));
  });
});

describe("hadProAt / proLapseConfirmed", () => {
  it("reads Pro at a past moment from the stored expiry", () => {
    setProUntil(T0 + H);
    expect(hadProAt(T0)).toBe(true);
    expect(hadProAt(T0 + 2 * H)).toBe(false);
    expect(hadProAt(NaN)).toBe(false);
  });

  it("an expiry that only passed on the device clock is not a confirmed lapse", () => {
    setProUntil(T0 + H);
    vi.setSystemTime(T0 + 2 * H);
    expect(hasPro()).toBe(false);
    expect(proLapseConfirmed()).toBe(false);
    setProUntil(null); // the store reports the lapse
    expect(proLapseConfirmed()).toBe(true);
  });

  it("is not a lapse for a player who never subscribed... but nothing to keep either", () => {
    expect(proLapseConfirmed()).toBe(true);
    storage["singularity.premium.v1"] = "1";
    expect(proLapseConfirmed()).toBe(false);
  });
});
