import { describe, it, expect } from "vitest";
import { derive, focusToBank, computeBankCeiling } from "./derive";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

describe("training intensity scales run size (owner fix)", () => {
  it("full focus is identity; low focus makes runs sip Compute proportionally", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 30, rack_server: 10 }; // enough production to clear minCompute
    const full = derive(s).runComputeCost;
    s.computeFocus = 0.25;
    const light = derive(s).runComputeCost;
    const floor = balance.run.focusCostFloor;
    const expected = floor + (1 - floor) * 0.25;
    expect(light.div(full).toNumber()).toBeCloseTo(expected, 6);
    // Yields stay proportional to the invested compute (no free lunch).
    const dFull = derive({ ...s, computeFocus: 1 });
    const dLight = derive(s);
    expect(dLight.runDataYield.div(dFull.runDataYield).toNumber()).toBeCloseTo(expected, 6);
  });

  it("focus 0 still floors at the minimum run fraction (a held lab can hand-fire light runs)", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 30 };
    s.computeFocus = 0;
    const held = derive(s).runComputeCost;
    const full = derive({ ...s, computeFocus: 1 }).runComputeCost;
    expect(held.div(full).toNumber()).toBeCloseTo(balance.run.focusCostFloor, 6);
  });
});

describe("run-yield curve pin (DELIBERATE global-mult double-apply — do not 'fix' blind)", () => {
  // Global multipliers (Legacy, ascension, preprints, charters, …) fold into
  // computePerSec → runComputeCost, AND into moneyMult/dataMult which the yields
  // multiply again — so globally-scaled yields carry those mults SQUARED. The tuned
  // curve is BUILT on this (TASK.md flag). These tests pin the as-built magnitude so
  // a well-meaning cleanup can't silently retune it. (A pure lane EVENT modifier,
  // by contrast, lives only in moneyMult/dataMult and correctly applies once.)
  it("a lane event modifier applies exactly once", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 30, rack_server: 10 }; // clear minCompute
    s.modifiers = [
      { id: "pin_x2", target: "moneyMult", factor: 2, remainingSec: 60, label: "×2 money", tone: "good" },
    ];
    const d = derive(s);
    const expected =
      d.runComputeCost.toNumber() * balance.run.moneyPerCompute * d.moneyMult.toNumber();
    expect(d.runMoneyYield.toNumber()).toBeCloseTo(expected, 4);
  });

  // Regression guard for the silent-economy-death class (2026-08 audit, Part 4 §2):
  // Math.pow overflows to Infinity past ~1e308, and break_infinity absorbs a
  // non-finite operand to ZERO instead of throwing — so an uncapped multiplicative
  // upgrade used to turn the entire economy off and persist that to the save.
  // derive() is pure and must survive a hostile/extreme level, capped or not.
  it("an extreme computeMult level stays finite and positive (never collapses to 0)", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 30, rack_server: 10, overclock: 10_000 };
    const d = derive(s);
    expect(d.computeMult.gt(0)).toBe(true);
    expect(d.computePerSec.gt(0)).toBe(true);
    // Math.pow(1.08, 10000) is Infinity; Big.pow carries it as a real magnitude.
    expect(Math.pow(1.08, 10_000)).toBe(Infinity);
    expect(d.computeMult.gt(Big.of(1e308))).toBe(true);
  });

  it("computeMult still compounds per level at ordinary levels", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 30, rack_server: 10, overclock: 10 };
    const d = derive(s);
    const base = derive({ ...s, upgrades: { rack_basic: 30, rack_server: 10 } });
    expect(d.computeMult.div(base.computeMult).toNumber()).toBeCloseTo(Math.pow(1.08, 10), 6);
  });

  it("global mults scale yields SQUARED (legacy rides cost AND yield)", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 30, rack_server: 10 };
    s.prestige.legacyWeights = Big.of(1000);
    const d = derive(s);
    const base = derive({ ...s, prestige: { legacyWeights: Big.of(0), ships: 0 } });
    const lm = d.legacyMult.toNumber();
    expect(lm).toBeGreaterThan(1);
    // As-built: ×lm² (once inside runComputeCost, once via moneyMult/dataMult).
    expect(d.runMoneyYield.div(base.runMoneyYield).toNumber()).toBeCloseTo(lm * lm, 3);
    expect(d.runDataYield.div(base.runDataYield).toNumber()).toBeCloseTo(lm * lm, 3);
  });
});

describe("focusToBank — how far to ease intensity for a Compute-walled node", () => {
  it("returns an intensity whose bank ceiling clears the cost, never above the current one", () => {
    const s = createInitialState();
    // Fast (compute-bound) runs, so the full-intensity ceiling genuinely binds.
    s.upgrades = { ...s.upgrades, rack_basic: 20, auto_claim: 1, auto_train: 1, batching: 12 };
    s.research = ["caching", "distillation"];
    s.computeFocus = 1;
    const d = derive(s);
    const ceiling = computeBankCeiling(s, d)!;
    // Already within reach → no change.
    expect(focusToBank(s, d, ceiling.mul(0.5))).toBe(1);
    // Twice the ceiling → a lower intensity whose own ceiling clears it.
    const cost = ceiling.mul(2);
    const f = focusToBank(s, d, cost);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
    // At the eased intensity no run fires until the bank reaches runCost / f, so it
    // climbs at full production all the way to the cost.
    const eased = { ...s, computeFocus: f };
    expect(derive(eased).runComputeCost.div(f).gte(cost)).toBe(true);
    // Unreachable at any running intensity → hold training (0, unbounded bank).
    expect(focusToBank(s, d, ceiling.mul(1e6))).toBe(0);
  });
});
