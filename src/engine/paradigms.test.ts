import { describe, it, expect } from "vitest";
import {
  paradigmsBalance, paradigmsUnlocked, canBuyParadigm, buyParadigm, paradigmMods, paradigmSpent,
} from "./paradigms";
import { reputationAvailable } from "./reputation";
import { derive } from "./derive";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const NEURO = paradigmsBalance.list.find((p) => p.id === "para_neuromorphic")!;
const REVEAL = paradigmsBalance.revealAtShips;

/** A deep-endgame veteran with plenty of unspent Reputation. */
function veteran(ships = REVEAL) {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.stats.totalShips = 100_000; // lots of earned Reputation
  return s;
}

describe("paradigm research", () => {
  it("is hidden and identity until the reveal ship count (curve-safe)", () => {
    const fresh = createInitialState();
    expect(paradigmsUnlocked(fresh)).toBe(false);
    expect(paradigmMods(fresh)).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
    expect(paradigmsUnlocked(veteran(REVEAL - 1))).toBe(false);
    expect(paradigmsUnlocked(veteran())).toBe(true);
    // derive is byte-identical with the paradigm fold present but nothing owned.
    expect(derive(veteran()).computePerSec.toNumber()).toBe(derive({ ...veteran(), paradigms: [] }).computePerSec.toNumber());
  });

  it("buys with Reputation (charged to spent), respects prereqs, and folds into derive", () => {
    const s = veteran();
    expect(canBuyParadigm(s, "para_quantum")).toBe(false); // needs para_neuromorphic first
    expect(canBuyParadigm(s, "para_neuromorphic")).toBe(true);
    const availBefore = reputationAvailable(s);
    const bought = buyParadigm(s, "para_neuromorphic");
    expect(bought.paradigms).toContain("para_neuromorphic");
    expect(paradigmSpent(bought)).toBe(NEURO.cost);
    expect(reputationAvailable(bought)).toBe(availBefore - NEURO.cost); // charged
    expect(canBuyParadigm(bought, "para_quantum")).toBe(true); // prereq now met
    // The capability boost reaches derive (+45% Compute).
    const ratio = derive({ ...bought, upgrades: { rack_basic: 10 } }).computePerSec
      .div(derive({ ...s, upgrades: { rack_basic: 10 } }).computePerSec).toNumber();
    expect(ratio).toBeCloseTo(1 + NEURO.effect.value, 5);
  });

  it("can't afford beyond the Reputation pool", () => {
    const poor = createInitialState();
    poor.prestige.ships = REVEAL;
    poor.stats.totalShips = 1; // ~no Reputation
    expect(canBuyParadigm(poor, "para_neuromorphic")).toBe(false);
    expect(buyParadigm(poor, "para_neuromorphic")).toBe(poor); // no-op
  });

  it("persists across prestige and round-trips; a crafted save reconciles the spend", () => {
    let s = veteran();
    s.research = [balance.prestige.capabilityResearch];
    s.lifetimeMoney = Big.of(1e6);
    s = buyParadigm(s, "para_neuromorphic");
    expect(prestige(s).paradigms).toContain("para_neuromorphic"); // survives the ship
    expect(deserialize(serialize(s)).paradigms).toContain("para_neuromorphic");
    // Anti-cheat: a save claiming a paradigm with zero spend gets `spent` reconciled up.
    const crafted = JSON.parse(serialize(s));
    crafted.reputation.spent = 0;
    const fixed = deserialize(JSON.stringify(crafted));
    expect(fixed.paradigms).toContain("para_neuromorphic");
    expect(fixed.reputation.spent).toBeGreaterThanOrEqual(NEURO.cost);
    // Unknown ids are dropped.
    const bogus = JSON.parse(serialize(s));
    bogus.paradigms = ["para_neuromorphic", "para_bogus"];
    expect(deserialize(JSON.stringify(bogus)).paradigms).toEqual(["para_neuromorphic"]);
  });
});
