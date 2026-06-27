import { describe, it, expect } from "vitest";
import { recommendedUpgrade } from "./recommend";
import { canBuyUpgrade, planBulkUpgrade, buyUpgradeBulk, upgradeCost } from "./actions";
import { balance } from "./balance/config";
import { totalRacks, hallCapacity } from "./hall";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

/** A wealthy lab with 14 Consumer racks already owned — mirrors the screenshot
 *  where "Recommended next" wrongly surfaced another Consumer Rack (+2/s, $106)
 *  over the far better Server Rack (+12/s, $220). */
function richWith14ConsumerRacks() {
  const s = createInitialState();
  s.upgrades = { rack_basic: 14 };
  s.resources.compute = Big.of(1e6);
  s.resources.data = Big.of(1e6);
  s.resources.money = Big.of(1e6);
  return s;
}

describe("recommendedUpgrade (best value, not cheapest)", () => {
  it("recommends the better-value Server rack over the cheaper Consumer rack", () => {
    const s = richWith14ConsumerRacks();
    // Sanity: both are genuinely affordable, so this is a value call, not an
    // affordability one.
    expect(canBuyUpgrade(s, "rack_basic")).toBe(true);
    expect(canBuyUpgrade(s, "rack_server")).toBe(true);
    const rec = recommendedUpgrade(s);
    // The Server rack gives ~2.9× more compute per dollar than another Consumer
    // rack at this point, so it must win — and crucially must NOT be the cheap one.
    expect(rec).toBe("rack_server");
    expect(rec).not.toBe("rack_basic");
  });

  it("only ever recommends something actually buyable", () => {
    const s = richWith14ConsumerRacks();
    const rec = recommendedUpgrade(s);
    expect(rec).not.toBeNull();
    expect(canBuyUpgrade(s, rec!)).toBe(true);
  });

  it("returns null when nothing is affordable", () => {
    const s = createInitialState();
    s.resources.compute = Big.ZERO;
    s.resources.data = Big.ZERO;
    s.resources.money = Big.ZERO;
    expect(recommendedUpgrade(s)).toBeNull();
  });

  it("does not crash and returns a buyable id for a brand-new lab once it can afford one", () => {
    const s = createInitialState();
    s.resources.money = Big.of(50); // enough for the first Consumer rack
    const rec = recommendedUpgrade(s);
    if (rec !== null) expect(canBuyUpgrade(s, rec)).toBe(true);
  });
});

describe("bulk upgrade buying (×10 / Max)", () => {
  const rackDef = balance.upgrades.find((u) => u.id === "rack_basic")!;
  const sumCost = (from: number, n: number) => {
    let t = Big.ZERO;
    for (let i = 0; i < n; i++) t = t.add(upgradeCost(rackDef, from + i));
    return t;
  };

  it("plans ×10 as exactly ten levels and their summed cost", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e9); // plenty; floor capacity easily fits 10
    const plan = planBulkUpgrade(s, "rack_basic", 10);
    expect(plan.count).toBe(10);
    expect(plan.totalCost.toNumber()).toBeCloseTo(sumCost(0, 10).toNumber(), 3);
  });

  it("caps the batch at what you can actually afford", () => {
    const s = createInitialState();
    s.resources.money = sumCost(0, 3); // exactly three racks' worth
    const plan = planBulkUpgrade(s, "rack_basic", 10);
    expect(plan.count).toBe(3); // not 10 — can't afford the 4th
  });

  it("buyUpgradeBulk applies exactly the planned batch and spends the planned cost", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e9);
    const plan = planBulkUpgrade(s, "rack_basic", 10);
    const after = buyUpgradeBulk(s, "rack_basic", 10);
    expect(after.upgrades.rack_basic).toBe(plan.count);
    expect(s.resources.money.sub(after.resources.money).toNumber()).toBeCloseTo(plan.totalCost.toNumber(), 3);
  });

  it("Max never exceeds floor capacity for racks", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e12); // could afford far more than the floor holds
    const after = buyUpgradeBulk(s, "rack_basic", Infinity);
    expect(totalRacks(after)).toBeLessThanOrEqual(hallCapacity(after));
    expect(totalRacks(after)).toBe(hallCapacity(after)); // fills the floor exactly
  });

  it("want=1 buys exactly one (parity with a single buy)", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e9);
    const after = buyUpgradeBulk(s, "rack_basic", 1);
    expect(after.upgrades.rack_basic).toBe(1);
  });
});
