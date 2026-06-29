import { describe, it, expect } from "vitest";
import { shipHeadline, runStory } from "./headlines";
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

describe("A5 — 'this run's story' recap", () => {
  it("summarizes era, alignment stance, and the product business", () => {
    const story = runStory({ ...base, gen: 3, era: 3, alignment: -0.6, productsLive: 2, rivalsBeaten: 3, rank: 4 });
    expect(story).toHaveLength(3);
    expect(story[0]).toMatch(/Generation 3/);
    expect(story[1]).toMatch(/safety/i);
    expect(story[2]).toMatch(/2 products.*3 rivals/i);
  });

  it("flips the alignment line for accelerationist and neutral runs", () => {
    expect(runStory({ ...base, era: 1, alignment: 0.7, productsLive: 0 })[1]).toMatch(/acceleration/i);
    expect(runStory({ ...base, era: 1, alignment: 0, productsLive: 0 })[1]).toMatch(/middle/i);
  });

  it("calls out a #1 finish and a no-product ship", () => {
    expect(runStory({ ...base, era: 4, alignment: 0, productsLive: 1, rank: 1 }).join(" ")).toMatch(/#1 on the market/);
    expect(runStory({ ...base, era: 2, alignment: 0, productsLive: 0 }).join(" ")).toMatch(/before commercialising/i);
  });

  it("omits lines when run context is absent (older callers)", () => {
    expect(runStory(base)).toEqual([]);
  });
});
