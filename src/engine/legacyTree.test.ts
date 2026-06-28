import { describe, it, expect } from "vitest";
import {
  legacySpent, legacyAvailable, canBuyLegacyPerk, buyLegacyPerk, legacyTreeMods,
} from "./legacyTree";
import { derive } from "./derive";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

function withWeights(n: number) {
  const s = createInitialState();
  s.prestige.legacyWeights = Big.of(n);
  return s;
}

describe("R5.4 — Legacy Investments tree", () => {
  it("nothing invested → available equals total, derive is the baseline", () => {
    const s = withWeights(50);
    expect(legacySpent(s)).toBe(0);
    expect(legacyAvailable(s).toNumber()).toBe(50);
    expect(legacyTreeMods(s)).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
    // The global legacy mult is unchanged from the pure-weights formula.
    const fresh = createInitialState();
    fresh.prestige.legacyWeights = Big.of(50);
    expect(derive(s).legacyMult.toNumber()).toBe(derive(fresh).legacyMult.toNumber());
  });

  it("buying a perk spends weights (out of the global pool) and biases its lane", () => {
    const s = withWeights(50);
    const after = buyLegacyPerk(s, "leg_compute1"); // cost 12, +20% compute
    expect(after.legacyInvestments).toContain("leg_compute1");
    expect(legacySpent(after)).toBe(12);
    expect(legacyAvailable(after).toNumber()).toBe(38);
    // The trade-off: global mult DROPS (fewer available weights)…
    expect(derive(after).legacyMult.toNumber()).toBeLessThan(derive(s).legacyMult.toNumber());
    // …but the compute lane is biased up vs no investment.
    expect(legacyTreeMods(after).computeMult).toBeCloseTo(1.2, 6);
    expect(derive(after).computePerSec.toNumber()).toBeGreaterThan(0);
  });

  it("enforces affordability (unspent weights) and prerequisites", () => {
    expect(canBuyLegacyPerk(withWeights(5), "leg_compute1")).toBe(false); // can't afford 12
    const s = withWeights(100);
    expect(canBuyLegacyPerk(s, "leg_compute2")).toBe(false); // needs leg_compute1 first
    const t1 = buyLegacyPerk(s, "leg_compute1");
    expect(canBuyLegacyPerk(t1, "leg_compute2")).toBe(true);
    expect(buyLegacyPerk(s, "leg_compute2")).toBe(s); // prereq missing → no-op
  });

  it("can't double-buy and can't overspend the pool", () => {
    let s = withWeights(12); // exactly one tier-1 perk's worth
    s = buyLegacyPerk(s, "leg_compute1");
    expect(buyLegacyPerk(s, "leg_compute1")).toBe(s); // already owned
    expect(canBuyLegacyPerk(s, "leg_data1")).toBe(false); // 0 left to spend
  });

  it("persists across prestige and a save round-trip (and migrates from v13)", () => {
    let s = withWeights(50);
    s = buyLegacyPerk(s, "leg_money1");
    s.research = ["inference_api"]; // allow a ship
    expect(prestige(s).legacyInvestments).toContain("leg_money1"); // survives reset
    expect(deserialize(serialize(s)).legacyInvestments).toEqual(["leg_money1"]);
    const old = JSON.parse(serialize(s));
    delete old.legacyInvestments; old.version = 13;
    expect(deserialize(JSON.stringify(old)).legacyInvestments).toEqual([]);
  });
});
