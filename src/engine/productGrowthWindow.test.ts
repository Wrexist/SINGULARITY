import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { applyOffline } from "./offline";
import { products as PRODUCTS } from "./balance/products";
import { Big } from "./math/Big";
import type { GameState, ProductState } from "./types";

/**
 * A product's users must grow the same whether the app was open or not.
 *
 * Word of mouth is per capita (users × virality), so a young product compounds until
 * it fills its market. simulateProducts applied a whole window as ONE forward step,
 * i.e. linear growth: a 5-minute app switch right after a launch came back with ~2.5K
 * users where the app left open had ~8.6M, and because the window's marketing was
 * billed in full against those missing users, the lab often came back with LESS money
 * than it left with. The 5-minute catch-up steps in tick() are far too coarse for a
 * rate like this (a buzzing AI Companion doubles every ~7 s).
 */

function product(type: ProductState["type"], mau: number, marketingPerSec: number, buzzSec: number): ProductState {
  return {
    id: "p1", name: "P", type, version: 1, quality: 30, priceMult: 1, enterprise: false, enterprisePrice: 1,
    marketingPerSec, channelMix: { ads: 1 }, mau, paid: mau * 0.01, buzzSec, ageSec: 0, upgrade: null, features: [],
  };
}

function lab(p: ProductState): GameState {
  const s = createInitialState();
  return {
    ...s,
    resources: { ...s.resources, money: Big.of(1e9) },
    prestige: { ...s.prestige, ships: 6 },
    products: { ...s.products, frontier: 40, active: [p] },
  };
}

/** The app open: 10 Hz frames. */
function live(state: GameState, ms: number): GameState {
  let s = state;
  for (let t = 0; t < ms; t += 100) s = tick(s, 100);
  return s;
}

const users = (s: GameState) => s.products.active[0]!.mau;
const gained = (from: GameState, to: GameState) => to.resources.money.sub(from.resources.money).toNumber();

describe("product growth does not depend on how the window is sliced", () => {
  it("a freshly launched product grows as much over a 5-minute app switch as with the app open", () => {
    const s = lab(product("general", 100, 50, PRODUCTS.buzzDurationSec));
    const open = live(s, 300_000);
    const resumed = tick(s, 300_000);
    expect(users(resumed) / users(open)).toBeGreaterThan(0.9);
    expect(gained(s, resumed) / gained(s, open)).toBeGreaterThan(0.9);
  });

  it("a one-minute switch keeps a viral product's growth too", () => {
    const s = lab(product("companion", 1_000, 0, PRODUCTS.buzzDurationSec));
    const open = live(s, 60_000);
    const resumed = tick(s, 60_000);
    expect(users(resumed) / users(open)).toBeGreaterThan(0.9);
    expect(users(resumed) / users(open)).toBeLessThan(1.1);
  });

  it("an offline catch-up that starts at a launch reaches the market the app-open lab reaches", () => {
    const s = lab(product("multimodal", 100, 50, PRODUCTS.buzzDurationSec));
    const off = applyOffline(s, 30 * 60_000, 8).state;
    const open = live(s, 30 * 60_000);
    expect(gained(s, off) / gained(s, open)).toBeGreaterThan(0.95);
  });

  it("slicing keeps a full day's catch-up of a young portfolio cheap", () => {
    const types = ["companion", "multimodal", "general", "code", "small"] as const;
    const s = lab(product("companion", 10, 50, PRODUCTS.buzzDurationSec));
    const portfolio: GameState = {
      ...s,
      products: { ...s.products, active: types.map((t, i) => ({ ...product(t, 10, 50, PRODUCTS.buzzDurationSec), id: `p${i}` })) },
    };
    const t0 = performance.now();
    const off = applyOffline(portfolio, 24 * 3_600_000, 24).state;
    expect(performance.now() - t0).toBeLessThan(1500);
    for (const p of off.products.active) expect(Number.isFinite(p.mau) && p.mau > 10).toBe(true);
  });
});
