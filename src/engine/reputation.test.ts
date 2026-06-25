import { describe, it, expect } from "vitest";
import {
  earnedReputation, reputationAvailable, canBuyReputationPerk, buyReputationPerk, reputationMods, reputationBalance,
} from "./reputation";
import { derive } from "./derive";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const perkCost = (id: string) => reputationBalance.perks.find((p) => p.id === id)!.cost;

describe("lab reputation", () => {
  it("a fresh lab has earned 0 and owns no perks (curve-neutral)", () => {
    const s = createInitialState();
    expect(earnedReputation(s)).toBe(0);
    const m = reputationMods(s);
    expect([m.computeMult, m.dataMult, m.moneyMult, m.payrollMult]).toEqual([1, 1, 1, 1]);
  });

  it("earns from achievements, ships, and ascensions", () => {
    const s = createInitialState();
    s.achievements = ["hire_1", "ship_1"]; // 2 + 2 = 4 (default rep)
    s.stats.totalShips = 3; // +3
    s.stats.ascensions = 2; // +16
    expect(earnedReputation(s)).toBe(4 + 3 + 2 * reputationBalance.perAscension);
  });

  it("available = earned − spent", () => {
    const s = createInitialState();
    s.stats.totalShips = 20; // earned 20
    s.reputation.spent = 8;
    expect(reputationAvailable(s)).toBe(12);
  });

  it("gates a perk on prerequisite and affordability", () => {
    const s = createInitialState();
    s.stats.totalShips = 100; // plenty of points
    // rep_compute2 requires rep_compute1.
    expect(canBuyReputationPerk(s, "rep_compute2")).toBe(false);
    s.reputation.perks = ["rep_compute1"];
    expect(canBuyReputationPerk(s, "rep_compute2")).toBe(true);
    // Already-owned can't be re-bought.
    expect(canBuyReputationPerk(s, "rep_compute1")).toBe(false);
  });

  it("won't buy a perk you can't afford", () => {
    const s = createInitialState();
    s.stats.totalShips = perkCost("rep_compute1") - 1; // one short
    expect(buyReputationPerk(s, "rep_compute1")).toBe(s); // no-op (same ref)
  });

  it("buying a perk spends points and records ownership", () => {
    let s = createInitialState();
    s.stats.totalShips = 100;
    s = buyReputationPerk(s, "rep_compute1");
    expect(s.reputation.perks).toContain("rep_compute1");
    expect(s.reputation.spent).toBe(perkCost("rep_compute1"));
    expect(reputationAvailable(s)).toBe(100 - perkCost("rep_compute1"));
  });

  it("a bought perk measurably boosts derive output", () => {
    const base = createInitialState();
    base.upgrades = { rack_basic: 10 };
    const withPerk = { ...base, reputation: { spent: 0, perks: ["rep_compute1"] } };
    const ratio = derive(withPerk).computePerSec.div(derive(base).computePerSec).toNumber();
    expect(ratio).toBeCloseTo(1.1, 5); // +10% Compute
  });

  it("survives prestige and a save round-trip", () => {
    let s = createInitialState();
    s.research = [balance.prestige.capabilityResearch];
    s.lifetimeMoney = Big.of(1e6);
    s.reputation = { spent: 8, perks: ["rep_compute1"] };
    s = prestige(s);
    expect(s.reputation.perks).toContain("rep_compute1");
    expect(s.reputation.spent).toBe(8);
    const restored = deserialize(serialize(s));
    expect(restored.reputation.perks).toContain("rep_compute1");
    expect(restored.reputation.spent).toBe(8);
  });
});
