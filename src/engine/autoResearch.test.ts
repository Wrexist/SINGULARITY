import { describe, it, expect } from "vitest";
import { applyAutoResearch } from "./actions";
import { autoResearchEnabled } from "./reputation";
import { tick } from "./tick";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

/** A state that owns the Research Director perk and has resources to spend. */
function withDirector() {
  const s = createInitialState();
  s.reputation.perks = ["rep_autoresearch"];
  s.resources.compute = Big.of(1e12);
  s.resources.data = Big.of(1e12);
  return s;
}

describe("R5.3 — research auto-buyer", () => {
  it("is off until the Research Director perk is owned", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(1e12);
    s.resources.data = Big.of(1e12);
    expect(autoResearchEnabled(s)).toBe(false);
    expect(applyAutoResearch(s)).toBe(s); // pure no-op (same reference)
    expect(s.research).toHaveLength(0);
  });

  it("buys affordable, prerequisite-met research when owned", () => {
    const s = withDirector();
    const after = applyAutoResearch(s);
    expect(after.research.length).toBeGreaterThan(0);
    // Everything it bought must have had its prerequisites satisfied at buy time.
    for (const id of after.research) {
      const def = balance.research.find((r) => r.id === id)!;
      for (const req of def.requires) expect(after.research).toContain(req);
    }
  });

  it("respects affordability — broke labs research nothing", () => {
    const s = withDirector();
    s.resources.compute = Big.ZERO;
    s.resources.data = Big.ZERO;
    expect(applyAutoResearch(s).research).toHaveLength(0);
  });

  it("spends the resources it researches with", () => {
    const s = withDirector();
    const after = applyAutoResearch(s);
    expect(after.resources.compute.lt(s.resources.compute) || after.resources.data.lt(s.resources.data)).toBe(true);
  });

  it("runs inside tick() so it works live and offline", () => {
    const s = withDirector();
    const after = tick(s, 1000);
    expect(after.research.length).toBeGreaterThan(0);
    // …and a lab without the perk researches nothing from a plain tick.
    const plain = createInitialState();
    plain.resources.compute = Big.of(1e12);
    plain.resources.data = Big.of(1e12);
    expect(tick(plain, 1000).research).toHaveLength(0);
  });
});
