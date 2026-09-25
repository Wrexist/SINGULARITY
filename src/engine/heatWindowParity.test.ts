import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { applyOffline } from "./offline";
import { maybeHeatEvent } from "./actions";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState, ProductState } from "./types";

/**
 * Regulatory Heat must not depend on how the time was sliced.
 *
 * Domain Expert, Science Co-Pilot and AI Companion products add a little Heat every
 * second, far less than the lab cools (0.02/s against 0.45/s), so with the app open
 * Heat sits at zero. tick() used to cool first, floor at zero, and only then add the
 * window's product Heat — so a long window (a resume from the background, every 5-minute
 * step of an offline catch-up) threw away its cooling against the zero floor and landed
 * on `heatPerSec × window` instead: ~11 Heat after a 3-minute app switch with three
 * Domain products, ~45 after any offline stretch with a full Domain portfolio. That
 * phantom Heat then rolled a regulatory event at up to the 50% cap (a fine of a quarter
 * of the lab's cash) on the resume, and raised product churn through every step of the
 * offline catch-up.
 */

function domain(id: string): ProductState {
  return {
    id, name: id, type: "domain", version: 1, quality: 40, priceMult: 1,
    enterprise: false, enterprisePrice: 1, marketingPerSec: 0, channelMix: {},
    mau: 50_000, paid: 5_000, buzzSec: 0, ageSec: 600, upgrade: null, features: [],
  };
}

function lab(): GameState {
  const s = createInitialState();
  return {
    ...s,
    resources: { ...s.resources, money: Big.of(1e9) },
    upgrades: { rack_basic: 10 },
    prestige: { ...s.prestige, ships: 5 },
    products: { ...s.products, frontier: 40, active: [domain("p1"), domain("p2"), domain("p3")] },
  };
}

/** The app open: 10 Hz frames. */
function live(state: GameState, ms: number): GameState {
  let s = state;
  for (let t = 0; t < ms; t += 100) s = tick(s, 100);
  return s;
}

describe("Heat is the same however the window is sliced", () => {
  it("a resume after a 3-minute app switch leaves Heat where the app left open does", () => {
    const s = lab();
    const open = live(s, 180_000);
    const resumed = tick(s, 180_000);
    expect(open.heat).toBeLessThan(0.1);
    expect(resumed.heat).toBeLessThan(0.1);
  });

  it("an 8-hour offline catch-up does not come back hot", () => {
    const off = applyOffline(lab(), 8 * 3_600_000, 8).state;
    expect(off.heat).toBeLessThan(0.1);
  });

  it("the resume therefore cannot roll a regulatory fine that live play never would", () => {
    const resumed = tick(lab(), 180_000);
    // The store rolls the audit on the resumed state over the whole window.
    const hit = maybeHeatEvent(resumed, 180, 0.2, 0);
    expect(hit).toBeNull();
  });

  it("Heat still builds when the portfolio out-heats the cooling, and cools off after", () => {
    // Above the cooling rate (a crafted rate, no real type gets there), the net
    // climb is the same in one window as in many.
    const hot: GameState = { ...lab(), heat: 10 };
    const cool = balance.heat.coolPerSec;
    const net = (tick(hot, 1000).heat - 10);
    expect(net).toBeCloseTo(-cool + 3 * 0.02, 5);
    // A lab with Heat and no products cools exactly as before.
    const bare: GameState = { ...createInitialState(), heat: 30 };
    expect(tick(bare, 10_000).heat).toBeCloseTo(30 - cool * 10, 6);
    expect(tick(bare, 600_000).heat).toBe(0);
  });
});
