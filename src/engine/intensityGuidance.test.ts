import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { derive, computeBankCeiling } from "./derive";
import { researchStalled } from "./actions";
import { advisorItems } from "./advisor";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

/** A state with auto-train owned (so the Compute bank has a ceiling) at a given focus. */
function autoTrainingAt(focus: number) {
  const s = createInitialState();
  s.upgrades["auto_train"] = 1; // enables the autoTrain effect in derive
  s.computeFocus = focus;
  return s;
}

describe("computeBankCeiling", () => {
  it("is null (unbounded) when auto-train is off — the bank accrues freely", () => {
    const s = createInitialState();
    expect(computeBankCeiling(s, derive(s))).toBeNull();
  });

  it("is null at focus 0 — training halts, so the bank floats with no drain", () => {
    const s = autoTrainingAt(0);
    expect(computeBankCeiling(s, derive(s))).toBeNull();
  });

  it("equals runComputeCost at full intensity, and RISES as intensity eases", () => {
    const full = autoTrainingAt(1);
    const dFull = derive(full);
    const cFull = computeBankCeiling(full, dFull);
    expect(cFull).not.toBeNull();
    // At focus 1 the ceiling is exactly the run cost (the run fires the instant the
    // bank reaches runComputeCost/1).
    expect(cFull!.eq(dFull.runComputeCost)).toBe(true);

    // Easing intensity (lower focus) must raise the ceiling — that's the whole lever.
    const eased = autoTrainingAt(0.4);
    const cEased = computeBankCeiling(eased, derive(eased));
    expect(cEased!.gt(cFull!)).toBe(true);
  });
});

describe("researchStalled", () => {
  it("is false when auto-train is off (no ceiling to wall against)", () => {
    const s = createInitialState();
    expect(researchStalled(s, derive(s))).toBe(false);
  });

  it("is true when the only available node costs more Compute than the bank can hold", () => {
    const s = autoTrainingAt(1); // ceiling ≈ 2× a tiny compute/sec; node[0] costs ~hundreds
    s.resources.compute = Big.of(1); // nowhere near affordable
    s.resources.data = Big.of(1e9); // data is NOT the blocker — Compute is
    expect(balance.research.length).toBeGreaterThan(0);
    expect(researchStalled(s, derive(s))).toBe(true);
  });

  it("is false when a node is affordable right now (nothing is stalling)", () => {
    const s = autoTrainingAt(1);
    s.resources.compute = Big.of(1e9);
    s.resources.data = Big.of(1e9);
    expect(researchStalled(s, derive(s))).toBe(false);
  });

  it("clears once intensity eases enough to lift the ceiling past the node", () => {
    const walled = autoTrainingAt(1);
    walled.resources.compute = Big.of(1);
    walled.resources.data = Big.of(1e9);
    expect(researchStalled(walled, derive(walled))).toBe(true);

    // Same bank, far lower intensity → the ceiling clears the node → no longer stalled.
    const eased = { ...walled, computeFocus: 0.001 };
    expect(researchStalled(eased, derive(eased))).toBe(false);
  });

  it("is false when the tree is fully climbed — nothing left to chase is not a stall", () => {
    const s = autoTrainingAt(1);
    s.resources.compute = Big.of(1);
    s.research = balance.research.map((r) => r.id); // own everything
    expect(researchStalled(s, derive(s))).toBe(false);
  });
});

describe("advisor surfaces the intensity lever exactly when research stalls", () => {
  it("nudges to ease training intensity when the bank is walled, and stays quiet otherwise", () => {
    const walled = autoTrainingAt(1);
    walled.resources.compute = Big.of(1);
    walled.resources.data = Big.of(1e9);
    expect(advisorItems(walled).some((i) => i.text.toLowerCase().includes("training intensity"))).toBe(true);

    // Auto-train not owned → no ceiling → no nudge (the mechanic doesn't exist yet).
    const early = createInitialState();
    early.resources.compute = Big.of(1);
    expect(advisorItems(early).some((i) => i.text.toLowerCase().includes("training intensity"))).toBe(false);
  });
});
