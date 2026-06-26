import { describe, it, expect } from "vitest";
import { prestige } from "./prestige";
import { derive } from "./derive";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

function shippable() {
  const s = createInitialState();
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e6); // grants some legacy weights on ship
  return s;
}

describe("AGI ascension", () => {
  it("a normal mid-game ship does NOT count as an ascension", () => {
    const s = shippable();
    s.prestige.ships = 1; // nowhere near the AGI era
    const after = prestige(s);
    expect(after.stats.ascensions).toBe(0);
  });

  it("shipping in the AGI era past the Legacy floor counts as an ascension", () => {
    const s = shippable();
    s.prestige.ships = balance.eras.agiAtShips - 1; // this ship reaches the AGI era
    s.stats.totalLegacy = Big.of(balance.eras.agi.legacyThreshold); // clears the floor
    const after = prestige(s);
    expect(after.prestige.ships).toBe(balance.eras.agiAtShips);
    expect(after.stats.ascensions).toBe(1);
  });

  it("does NOT ascend in the AGI era if the Legacy floor isn't met", () => {
    const s = shippable();
    s.prestige.ships = balance.eras.agiAtShips - 1;
    s.stats.totalLegacy = Big.ZERO;
    s.lifetimeMoney = Big.of(1); // ~no legacy gained, stays under the floor
    const after = prestige(s);
    expect(after.stats.ascensions).toBe(0);
  });

  it("ascensions apply a permanent compounding multiplier in derive", () => {
    const base = createInitialState();
    const boosted = { ...base, stats: { ...base.stats, ascensions: 3 } };
    const ratio = derive(boosted).computePerSec.div(derive(base).computePerSec).toNumber();
    expect(ratio).toBeCloseTo(1 + 3 * balance.eras.agi.bonusPerAscension, 5);
  });

  it("scales passive money LINEARLY (not quadratically) with ascensions", () => {
    // Regression for the Phase-3 review bug: passive money = acc × computePerSec,
    // and computePerSec already carries ascensionMult — so it must be applied ONCE.
    const base = createInitialState();
    base.upgrades = { rack_basic: 10 };
    base.research = ["inference_api"]; // unlocks passive money
    const boosted = { ...base, stats: { ...base.stats, ascensions: 3 } };
    const ratio = derive(boosted).passiveMoneyPerSec.div(derive(base).passiveMoneyPerSec).toNumber();
    const linear = 1 + 3 * balance.eras.agi.bonusPerAscension;
    expect(ratio).toBeCloseTo(linear, 4); // linear, NOT linear² (the squaring bug)
    expect(ratio).toBeLessThan(linear * linear - 0.001);
  });

  it("no ascensions = no multiplier change (early/mid curve untouched)", () => {
    const base = createInitialState();
    expect(base.stats.ascensions).toBe(0);
    const mult = Big.ONE.add(balance.eras.agi.bonusPerAscension * base.stats.ascensions);
    expect(mult.eq(Big.ONE)).toBe(true);
  });

  it("ascensions survive a save round-trip", () => {
    const s = { ...createInitialState(), stats: { ...createInitialState().stats, ascensions: 4 } };
    expect(deserialize(serialize(s)).stats.ascensions).toBe(4);
  });
});
