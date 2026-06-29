import { describe, it, expect } from "vitest";
import { shipHeadline } from "./headlines";
import { Big } from "../engine/math/Big";

const base = { gen: 2, rank: null as number | null, peakCompute: Big.of(0), peakMrr: 0 };

describe("A3 — history-aware ship headlines", () => {
  it("celebrates #1 market rank above everything else", () => {
    expect(shipHeadline({ ...base, rank: 1, peakCompute: Big.of(1e15), peakMrr: 1e9 })).toBe("Market Leader — You're #1");
  });

  it("calls out a scaling triumph at 1T+ peak compute", () => {
    expect(shipHeadline({ ...base, peakCompute: Big.of(1e12) })).toBe("The Scaling Triumph");
  });

  it("calls out strong revenue, then a top-three finish", () => {
    expect(shipHeadline({ ...base, peakMrr: 100_000 })).toBe("Cash-Flow Positive (Briefly)");
    expect(shipHeadline({ ...base, rank: 3 })).toBe("Cracking the Top Three");
  });

  it("falls back to generation milestones with no standout achievement", () => {
    expect(shipHeadline({ ...base, gen: 1 })).toBe("Your First Ship");
    expect(shipHeadline({ ...base, gen: 5 })).toBe("Five and Counting");
    expect(shipHeadline({ ...base, gen: 12 })).toBe("Double Digits");
    expect(shipHeadline({ ...base, gen: 25 })).toBe("The Veteran's Run");
  });

  it("is deterministic and stable per generation in the rotation tier", () => {
    const a = shipHeadline({ ...base, gen: 3 });
    const b = shipHeadline({ ...base, gen: 3 });
    expect(a).toBe(b);
    expect(typeof a).toBe("string");
  });
});
