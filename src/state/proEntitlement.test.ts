import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasPro, isPremium, setPremium, proUntil, setProUntil, sanitizeProUntil, onProChange, PRO_UNTIL_KEY, MAX_PRO_AHEAD_MS } from "./premium";

/**
 * Pro entitlement (state layer). Pro = the lifetime unlock (grant-only flag) OR a
 * subscription expiry in the future. The expiry is hostile storage like the save: a
 * value no real plan could carry is ignored rather than granting Pro forever, and a
 * lapse clears only the subscription, never the lifetime flag.
 */

const DAY = 24 * 3_600_000;
const NOW = 1_800_000_000_000;

let store: Record<string, string>;
let prev: unknown;

beforeEach(() => {
  store = {};
  prev = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
});
afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prev;
});

describe("hasPro", () => {
  it("is off on a fresh install", () => {
    expect(hasPro(NOW)).toBe(false);
  });

  it("is on for lifetime owners, with no expiry at all", () => {
    setPremium(true);
    expect(hasPro(NOW)).toBe(true);
    expect(hasPro(NOW + 10_000 * DAY)).toBe(true);
  });

  it("is on until a subscription's expiry, then lapses on its own", () => {
    setProUntil(NOW + 7 * DAY, NOW);
    expect(proUntil(NOW)).toBe(NOW + 7 * DAY);
    expect(hasPro(NOW)).toBe(true);
    expect(hasPro(NOW + 7 * DAY - 1)).toBe(true);
    expect(hasPro(NOW + 7 * DAY)).toBe(false);
  });

  it("a lapse (null) clears the subscription but never the lifetime flag", () => {
    setPremium(true);
    setProUntil(NOW + 30 * DAY, NOW);
    setProUntil(null, NOW);
    expect(store[PRO_UNTIL_KEY]).toBeUndefined();
    expect(isPremium()).toBe(true);
    expect(hasPro(NOW)).toBe(true);
  });

  it("a lapse leaves a subscriber-only player without Pro", () => {
    setProUntil(NOW + 30 * DAY, NOW);
    setProUntil(null, NOW);
    expect(hasPro(NOW)).toBe(false);
  });
});

describe("hostile storage", () => {
  it.each([
    ["garbage", "banana"],
    ["negative", "-5"],
    ["zero", "0"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["empty", ""],
    ["far future", String(NOW + MAX_PRO_AHEAD_MS + DAY)],
    ["max safe", String(Number.MAX_SAFE_INTEGER)],
  ])("ignores a %s expiry", (_label, raw) => {
    store[PRO_UNTIL_KEY] = raw;
    expect(proUntil(NOW)).toBe(0);
    expect(hasPro(NOW)).toBe(false);
  });

  it("accepts a real yearly expiry", () => {
    store[PRO_UNTIL_KEY] = String(NOW + 365 * DAY);
    expect(hasPro(NOW)).toBe(true);
  });

  it("sanitizeProUntil floors and rejects non-numbers", () => {
    expect(sanitizeProUntil(NOW + 1.7, NOW)).toBe(NOW + 1);
    expect(sanitizeProUntil({}, NOW)).toBe(0);
    expect(sanitizeProUntil(null, NOW)).toBe(0);
    expect(sanitizeProUntil(NOW + DAY, NaN)).toBe(0);
  });

  it("refuses to store a value it would not read back", () => {
    setProUntil(NOW + 10 * 365 * DAY, NOW);
    expect(store[PRO_UNTIL_KEY]).toBeUndefined();
  });

  it("an unreadable storage reads as no Pro instead of throwing", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(hasPro(NOW)).toBe(false);
    expect(() => setProUntil(NOW + DAY, NOW)).not.toThrow();
  });
});

describe("change notifications", () => {
  it("fires on a grant and a lapse, not on a repeat", () => {
    let n = 0;
    const off = onProChange(() => { n += 1; });
    setProUntil(NOW + DAY, NOW);
    setProUntil(NOW + DAY, NOW);
    setProUntil(null, NOW);
    setPremium(true);
    setPremium(true);
    off();
    setPremium(false);
    expect(n).toBe(3);
  });
});
