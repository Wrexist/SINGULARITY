import { describe, it, expect } from "vitest";
import { preprintMult, treeComplete, preprintsUnlocked, preprintCost, canBuyPreprint, buyPreprint, preprintTitle } from "./preprints";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

/** A state that owns every non-exclusive node + ONE side of each exclusive fork. */
function fullTree() {
  const s = createInitialState();
  const chosen = new Set<string>();
  s.research = balance.research
    .filter((d) => {
      if (!d.exclusiveGroup) return true;
      if (chosen.has(d.exclusiveGroup)) return false;
      chosen.add(d.exclusiveGroup);
      return true;
    })
    .map((d) => d.id);
  return s;
}

describe("frontier preprints (IDEAS #10)", () => {
  it("is identity at zero papers (curve-safe by construction)", () => {
    const s = createInitialState();
    expect(preprintMult(s).eq(Big.ONE)).toBe(true);
    expect(treeComplete(s)).toBe(false);
    expect(preprintsUnlocked(s)).toBe(false);
    expect(canBuyPreprint(s)).toBe(false);
    expect(buyPreprint(s)).toBe(s); // same-ref no-op
  });

  it("unlocks only when the tree is complete (exclusive forks count as done)", () => {
    const s = fullTree();
    expect(treeComplete(s)).toBe(true);
    expect(preprintsUnlocked(s)).toBe(true);
    // Missing one non-exclusive node → not complete.
    const partial = fullTree();
    partial.research = partial.research.filter((id) => id !== "backprop");
    expect(treeComplete(partial)).toBe(false);
  });

  it("publishing spends the escalating cost, boosts all lanes, and hard-caps per run", () => {
    const s = fullTree();
    s.resources.compute = Big.of(1e12);
    s.resources.data = Big.of(1e12);
    const c0 = preprintCost(s);
    const base = derive(s);

    const after1 = buyPreprint(s);
    expect(after1.preprints).toBe(1);
    expect(after1.resources.compute.eq(s.resources.compute.sub(c0.compute))).toBe(true);
    expect(after1.resources.data.eq(s.resources.data.sub(c0.data))).toBe(true);
    // Each lane rises by exactly perLevelMult.
    const d1 = derive(after1);
    const ratio = d1.computePerSec.div(base.computePerSec).toNumber();
    expect(ratio).toBeCloseTo(balance.preprints.perLevelMult, 5);
    // Cost escalates by `growth` per paper.
    const c1 = preprintCost(after1);
    expect(c1.compute.toNumber()).toBeCloseTo(c0.compute.toNumber() * balance.preprints.growth, 3);

    // With finite resources, the ESCALATING COST is the gate (not the cap): you
    // publish a bounded number of papers, then the next buy is refused for
    // affordability — well before the high safety cap. The panel never goes inert.
    let cur = s; // 1e12 compute/data
    let n = 0;
    while (canBuyPreprint(cur) && n < 1000) { cur = buyPreprint(cur); n++; }
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(balance.preprints.maxPerRun); // stopped on COST, not the cap
    expect(canBuyPreprint(cur)).toBe(false);
    expect(buyPreprint(cur)).toBe(cur); // same-ref no-op when unaffordable
    // The boost is exactly perLevelMult^papers (compounding, uncapped in practice).
    expect(preprintMult(cur).toNumber()).toBeCloseTo(Math.pow(balance.preprints.perLevelMult, n), 4);
  });

  it("the per-run cap is a high safety bound, reached only with unlimited resources", () => {
    const s = fullTree();
    s.resources.compute = Big.of("1e80");
    s.resources.data = Big.of("1e80");
    let cur = s;
    for (let i = 0; i < balance.preprints.maxPerRun + 5; i++) cur = buyPreprint(cur);
    expect(cur.preprints).toBe(balance.preprints.maxPerRun); // clamps at the bound
    expect(canBuyPreprint(cur)).toBe(false);
  });

  it("titles rotate deterministically per level", () => {
    expect(preprintTitle(0)).toBe(balance.preprints.titles[0]);
    expect(preprintTitle(balance.preprints.titles.length)).toBe(balance.preprints.titles[0]);
    expect(preprintTitle(3)).toBe(balance.preprints.titles[3]);
  });

  it("resets on prestige like the research tree it extends", () => {
    const s = fullTree();
    s.resources.compute = Big.of(1e12);
    s.resources.data = Big.of(1e12);
    s.lifetimeMoney = Big.of(1e6);
    const withPapers = buyPreprint(buyPreprint(s));
    expect(withPapers.preprints).toBe(2);
    expect(prestige(withPapers).preprints).toBe(0);
  });

  it("round-trips through the save; crafted counts clamp to the cap", () => {
    const s = fullTree();
    s.resources.compute = Big.of(1e12);
    s.resources.data = Big.of(1e12);
    const withPaper = buyPreprint(s);
    expect(deserialize(serialize(withPaper)).preprints).toBe(1);
    const crafted = JSON.parse(serialize(withPaper));
    crafted.preprints = 9_999;
    expect(deserialize(JSON.stringify(crafted)).preprints).toBe(balance.preprints.maxPerRun);
  });
});
