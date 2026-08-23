import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { applyOffline } from "./offline";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * Offline must pay approximately what the same wall-clock would have paid with the
 * app open. Offline is "just a tick with a big elapsedMs" (LEARNINGS) — but that is
 * only true for the parts of the sim that are dt-invariant. The product business is
 * NOT: the competitive frontier advances to its end-of-window value before the
 * window's economics are priced, and MAU integrates with a single forward-Euler
 * step. Applied as one 8h tick, both effects compound into a large shortfall.
 *
 * These tests pin the property that matters to the player — close the app for 8
 * hours, get roughly what you'd have got leaving it open — rather than pinning any
 * particular internal step size.
 */

/** Reference: advance `ms` in small live-sized steps, the way the app does when open. */
function online(state: GameState, ms: number, stepMs = 1000): GameState {
  let s = state;
  for (let t = 0; t < ms; t += stepMs) s = tick(s, Math.min(stepMs, ms - t));
  return s;
}

/** A lab with a live product — the case where the dt-sensitivity actually bites. */
function labWithProduct(): GameState {
  const s = createInitialState();
  return {
    ...s,
    resources: { ...s.resources, compute: Big.of(1e9), data: Big.of(1e9), money: Big.of(1e9) },
    upgrades: { ...s.upgrades, rack_basic: 40 },
    prestige: { ...s.prestige, ships: 3 },
    products: {
      ...s.products,
      frontier: 40,
      active: [
        {
          id: "p_test",
          name: "Test API",
          type: "general",
          version: 1,
          quality: 40,
          priceMult: 1,
          enterprise: false,
          enterprisePrice: 1,
          marketingPerSec: 500,
          channelMix: {},
          mau: 5_000,
          paid: 500,
          buzzSec: 0,
          ageSec: 600,
          upgrade: null,
          features: [],
        },
      ],
    },
  };
}

const EIGHT_HOURS = 8 * 3600 * 1000;

describe("offline parity", () => {
  it("pays a lab-only save about the same offline as online", () => {
    // No products: the pure lab loop IS dt-invariant, so this should already hold.
    // It is the control for the product case below.
    const s = { ...createInitialState(), upgrades: { rack_basic: 10 } } as GameState;
    const off = applyOffline(s, EIGHT_HOURS, 8).state;
    const on = online(s, EIGHT_HOURS);
    const ratio = off.resources.compute.div(on.resources.compute.max(1)).toNumber();
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it("pays a product portfolio about the same offline as online", () => {
    const s = labWithProduct();
    const off = applyOffline(s, EIGHT_HOURS, 8).state;
    const on = online(s, EIGHT_HOURS);

    // Money earned over the window is the number the player actually feels.
    const offMoney = off.resources.money.sub(s.resources.money).toNumber();
    const onMoney = on.resources.money.sub(s.resources.money).toNumber();
    const ratio = offMoney / Math.max(1, onMoney);

    // Generous band: sub-stepping will never match a 1s reference exactly, and
    // erring slightly LOW offline is the safe direction. Anything below 0.75 is the
    // bug this test exists to catch (it measured ~0.01-0.2 before the fix).
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.25);
  });

  it("grows the user base offline about as much as online", () => {
    const s = labWithProduct();
    const off = applyOffline(s, EIGHT_HOURS, 8).state;
    const on = online(s, EIGHT_HOURS);
    const ratio = off.products.active[0]!.mau / Math.max(1, on.products.active[0]!.mau);
    expect(ratio).toBeGreaterThan(0.75);
  });

  it("still honours the offline cap", () => {
    const s = labWithProduct();
    const { summary } = applyOffline(s, 100 * 3600 * 1000, 8);
    expect(summary.capped).toBe(true);
    expect(summary.appliedMs).toBe(EIGHT_HOURS);
  });

  it("treats a zero / negative / non-finite window as no time at all", () => {
    const s = labWithProduct();
    expect(applyOffline(s, 0, 8).summary.appliedMs).toBe(0);
    expect(applyOffline(s, -5000, 8).summary.appliedMs).toBe(0);
    expect(applyOffline(s, NaN, 8).summary.appliedMs).toBe(0);
    // A non-finite window is coerced to 0 (offline.ts) rather than clamped to the
    // cap — a corrupt clock must never read as "you were away the maximum time".
    expect(applyOffline(s, Infinity, 8).summary.appliedMs).toBe(0);
  });
});
