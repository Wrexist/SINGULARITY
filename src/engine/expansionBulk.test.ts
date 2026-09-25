import { describe, it, expect } from "vitest";
import { planBulkUpgrade, buyUpgradeBulk, buyUpgrade, upgradeCost, canBuyUpgrade } from "./actions";
import { hallCapacity, floorDrawnOut } from "./hall";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState } from "./types";

const lab = (e: number, s: number): GameState => {
  const g = createInitialState();
  return { ...g, upgrades: { ...g.upgrades, expand_e: e, expand_s: s }, resources: { ...g.resources, money: Big.of(1e7) } };
};

/**
 * Once the floor meets the per-frame draw cap, another expansion level adds tiles no
 * rack can stand on. The panel stops offering expansions at that point, but a ×10 /
 * Max tap on a card still on offer used to walk straight past it and charge for the
 * dead level too.
 */
describe("bulk hall expansion (×10 / Max) stops at the draw cap", () => {
  it("buys only the level that draws the floor out, never a level that adds nothing", () => {
    const g = lab(4, 2);
    expect(floorDrawnOut(g)).toBe(false); // the Front Expansion card is still offered
    const def = balance.upgrades.find((u) => u.id === "expand_s")!;
    const one = upgradeCost(def, 2);

    for (const want of [10, Infinity]) {
      const plan = planBulkUpgrade(g, "expand_s", want);
      expect(plan.count).toBe(1);
      expect(plan.totalCost.toNumber()).toBeCloseTo(one.toNumber(), 3);

      const after = buyUpgradeBulk(g, "expand_s", want);
      expect(after.upgrades.expand_s).toBe(3);
      expect(floorDrawnOut(after)).toBe(true);
      expect(hallCapacity(after)).toBeGreaterThan(hallCapacity(g));
      expect(g.resources.money.sub(after.resources.money).toNumber()).toBeCloseTo(one.toNumber(), 3);
    }
  });

  it("does the same for Right Expansion when Front is maxed", () => {
    const g = lab(2, 4);
    expect(floorDrawnOut(g)).toBe(false);
    const after = buyUpgradeBulk(g, "expand_e", Infinity);
    expect(after.upgrades.expand_e).toBe(3);
    expect(floorDrawnOut(after)).toBe(true);
    expect(planBulkUpgrade(g, "expand_e", Infinity).count).toBe(1);
  });

  it("every level a bulk buy pays for adds rack slots", () => {
    for (const [e, s] of [[0, 0], [1, 0], [0, 3], [2, 2], [3, 1], [4, 0], [0, 4]] as [number, number][]) {
      for (const id of ["expand_e", "expand_s"]) {
        const g = lab(e, s);
        const plan = planBulkUpgrade(g, id, Infinity);
        let step = g;
        for (let i = 0; i < plan.count; i++) {
          const before = hallCapacity(step);
          step = buyUpgrade(step, id);
          expect(hallCapacity(step)).toBeGreaterThan(before);
        }
        // The plan and the real batch agree.
        expect(buyUpgradeBulk(g, id, Infinity).upgrades).toEqual(step.upgrades);
      }
    }
  });

  it("still batches several useful levels while the floor is far from the cap", () => {
    const g = lab(0, 0);
    expect(planBulkUpgrade(g, "expand_e", Infinity).count).toBeGreaterThan(1);
  });

  it("buys nothing in bulk on an already drawn-out floor, but a single buy stays legal", () => {
    const g = lab(4, 3);
    expect(floorDrawnOut(g)).toBe(true);
    expect(planBulkUpgrade(g, "expand_s", Infinity).count).toBe(0);
    expect(buyUpgradeBulk(g, "expand_s", 10)).toBe(g);
    // canBuyUpgrade (what the balance sim reads) is deliberately unchanged.
    expect(canBuyUpgrade(g, "expand_s")).toBe(true);
    expect(buyUpgrade(g, "expand_s").upgrades.expand_s).toBe(4);
  });
});
