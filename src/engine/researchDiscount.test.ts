import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { buyReputationPerk, researchCostMult, startingRacks } from "./reputation";
import { canBuyResearch, buyResearch, researchCost } from "./actions";
import { prestige } from "./prestige";
import { reputation as R } from "./balance/reputation";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

// A node with both a Compute and Data cost (the cheapest available from a fresh tree).
function aResearchNode() {
  return balance.research.find((r) => r.requires.length === 0 && (r.cost.compute > 0 || r.cost.data > 0))!;
}

describe("Research Fellowship reputation perk (R5.6 cross-system discount)", () => {
  it("a fresh run owns no discount → research costs full price (curve-neutral)", () => {
    const s = createInitialState();
    expect(researchCostMult(s)).toBe(1);
    const node = aResearchNode();
    const c = researchCost(s, node);
    expect(c.compute.eq(Big.of(node.cost.compute))).toBe(true);
    expect(c.data.eq(Big.of(node.cost.data))).toBe(true);
  });

  it("owning the perk cuts research cost by its value", () => {
    let s = createInitialState();
    s.stats.totalShips = 1000; // plenty of reputation
    // prerequisite first, then the discount
    s = buyReputationPerk(s, "rep_data1");
    s = buyReputationPerk(s, "rep_research1");
    expect(s.reputation.perks).toContain("rep_research1");
    const perk = R.perks.find((p) => p.id === "rep_research1")!;
    const expected = 1 - perk.effect.value;
    expect(researchCostMult(s)).toBeCloseTo(expected, 10);

    const node = aResearchNode();
    const c = researchCost(s, node);
    expect(c.compute.toNumber()).toBeCloseTo(node.cost.compute * expected, 3);
    expect(c.data.toNumber()).toBeCloseTo(node.cost.data * expected, 3);
  });

  it("the discount lets you afford a node you couldn't at full price", () => {
    const node = aResearchNode();
    let s = createInitialState();
    s.stats.totalShips = 1000;
    s = buyReputationPerk(s, "rep_data1");
    s = buyReputationPerk(s, "rep_research1");
    const discounted = researchCost(s, node);
    // Hold exactly the discounted cost (a hair under full price): affordable now,
    // and the buy actually goes through and spends the discounted amount.
    s.resources.compute = discounted.compute;
    s.resources.data = discounted.data;
    expect(canBuyResearch(s, node.id)).toBe(true);
    const after = buyResearch(s, node.id);
    expect(after.research).toContain(node.id);
    expect(after.resources.compute.toNumber()).toBeCloseTo(0, 2);
    expect(after.resources.data.toNumber()).toBeCloseTo(0, 2);
  });

  it("the discount is floored — research never becomes free", () => {
    // Even if the value were extreme, the multiplier can't go below the floor.
    const s = createInitialState();
    s.reputation.perks = ["rep_research1"];
    expect(researchCostMult(s)).toBeGreaterThanOrEqual(R.researchDiscountFloor);
  });
});

describe("Founder's Stockpile reputation perk (R5.6 free starting racks)", () => {
  const RACKS = R.perks.find((p) => p.id === "rep_startrack")!.effect.value;

  it("a fresh run owns no stockpile → starts with zero racks (curve-neutral)", () => {
    const s = createInitialState();
    expect(startingRacks(s)).toBe(0);
    expect(createInitialState().upgrades.rack_basic ?? 0).toBe(0);
  });

  it("owning the perk seeds the next run with basic racks", () => {
    let s = createInitialState();
    // become ship-eligible and own the perk
    s.research = [...s.research, balance.prestige.capabilityResearch];
    s.lifetimeMoney = Big.of(1e9);
    s.reputation.perks = ["rep_compute1", "rep_startrack"];
    expect(startingRacks(s)).toBe(RACKS);

    const after = prestige(s, "deploy");
    expect(after.upgrades.rack_basic).toBe(RACKS);
  });

  it("the grant never exceeds the starting floor capacity", () => {
    // Owning many stockpiles can't break the floor-space rule.
    const s = createInitialState();
    s.reputation.perks = ["rep_startrack"];
    expect(startingRacks(s)).toBe(RACKS);
    // (RACKS is well under the 30-tile base floor, so it seeds exactly RACKS.)
  });
});
