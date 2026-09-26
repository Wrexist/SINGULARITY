import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { derive, computeBankCeiling, computeBankReach, focusToBank } from "./derive";
import { tick } from "./tick";
import { researchStalled, researchCost, canBuyResearch } from "./actions";
import { advisorItems } from "./advisor";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * Under compute-bound auto-train the bank's ceiling is the firing level runCost / focus —
 * but the tick that lifts the bank to it also spends it on the next run, so no frame ever
 * shows the bank there. At full intensity a 10Hz frame tops out ~5% under it. A research
 * node costing between that and the ceiling was reported reachable ("~1s", a full ring,
 * often the "Recommended next" card) yet never became affordable, and since it was not
 * "walled" the advisor stayed quiet and its card could not be tapped to save for it.
 */
const NODE = "backprop"; // 1000 Compute, no Data

/** A compute-bound lab at full intensity whose ceiling sits 3% above NODE's cost. */
function bandLab(): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 20, rack_server: 10, auto_claim: 1, auto_train: 1, batching: 12 };
  s.research = ["caching", "distillation"];
  s.resources = { compute: Big.ZERO, data: Big.of(1e9), money: Big.ZERO };
  s.computeFocus = 1;
  const cost = researchCost(s, balance.research.find((r) => r.id === NODE)!).compute;
  const ceiling = computeBankCeiling(s, derive(s))!;
  // A standing Compute factor (never expires in the test) to place the ceiling.
  const factor = cost.mul(1.03).div(ceiling).toNumber();
  s.modifiers = [{ id: "t", target: "computeMult", factor, remainingSec: 1e9, label: "t", tone: "good" }];
  return s;
}

describe("the Compute bank's reachable peak", () => {
  it("the fixture's node sits under the ceiling, but live ticks never make it affordable", () => {
    let s = bandLab();
    const d = derive(s);
    const cost = researchCost(s, balance.research.find((r) => r.id === NODE)!).compute;
    expect(cost.lt(computeBankCeiling(s, d)!)).toBe(true);
    let everAffordable = false;
    for (let i = 0; i < 600; i++) {
      s = tick(s, 100);
      if (canBuyResearch(s, NODE)) everAffordable = true;
    }
    expect(everAffordable).toBe(false);
  });

  it("counts that node as walled: research is stalled and the advisor offers to save for it", () => {
    const s = bandLab();
    const d = derive(s);
    const cost = researchCost(s, balance.research.find((r) => r.id === NODE)!).compute;
    expect(cost.gt(computeBankReach(s, d)!)).toBe(true);
    expect(researchStalled(s, d)).toBe(true);
    expect(advisorItems(s, d).some((i) => i.text.includes("save for it"))).toBe(true);
  });

  it("agrees with Save for this: the intensity it picks puts the node within reach", () => {
    const s = bandLab();
    const d = derive(s);
    const cost = researchCost(s, balance.research.find((r) => r.id === NODE)!).compute;
    const f = focusToBank(s, d, cost);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
    let eased = { ...s, computeFocus: f };
    expect(cost.lte(computeBankReach(eased, derive(eased)) ?? cost)).toBe(true);
    let bought = false;
    for (let i = 0; i < 600 && !bought; i++) {
      eased = tick(eased, 100);
      bought = canBuyResearch(eased, NODE);
    }
    expect(bought).toBe(true);
  });

  it("is null exactly when the ceiling is (an unbounded bank)", () => {
    const s = createInitialState();
    expect(computeBankReach(s, derive(s))).toBeNull();
    const held = { ...bandLab(), computeFocus: 0 };
    expect(computeBankReach(held, derive(held))).toBeNull();
  });
});
