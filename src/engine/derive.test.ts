import { describe, it, expect } from "vitest";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { balance } from "./balance/config";

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
