import { describe, it, expect } from "vitest";
import { derive } from "./derive";
import { alignmentProductMods } from "./alignment";
import { releaseProduct, simulateProducts } from "./products";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

/** A shipped lab with one live product and resources, for product-mod tests. */
function withProduct() {
  const s = createInitialState();
  s.prestige.ships = 1;
  s.resources.compute = Big.of(1e9);
  s.resources.data = Big.of(1e9);
  s.resources.money = Big.of(1e6);
  return releaseProduct(s, { type: "general", name: "P", id: "p1" });
}

describe("R5.5 — alignment → products", () => {
  it("is identity at neutral", () => {
    expect(alignmentProductMods(createInitialState())).toEqual({ acq: 1, heat: 1 });
  });

  it("accelerationist boosts product acquisition; doomer cuts product Heat", () => {
    const accel = createInitialState(); accel.alignment = 1;
    const doom = createInitialState(); doom.alignment = -1;
    expect(alignmentProductMods(accel).acq).toBeCloseTo(1 + balance.alignment.productAcqBonus, 6);
    expect(alignmentProductMods(accel).heat).toBe(1); // accel doesn't reduce product heat
    expect(alignmentProductMods(doom).heat).toBeCloseTo(1 - balance.alignment.productHeatReduction, 6);
    expect(alignmentProductMods(doom).acq).toBe(1);
  });

  it("derive folds the acq bonus into product mods", () => {
    const base = withProduct();
    const accel = { ...base, alignment: 1 };
    expect(derive(accel).productMods.acq).toBeGreaterThan(derive(base).productMods.acq);
  });
});

describe("R5.5 — Heat → product churn", () => {
  it("is identity when cold and rises with Heat in derive", () => {
    const cold = withProduct();
    const hot = { ...cold, heat: balance.heat.max };
    expect(derive(cold).productMods.churn).toBeCloseTo(1, 6);
    expect(derive(hot).productMods.churn).toBeCloseTo(1 + balance.heat.productChurnAtMax, 6);
  });

  it("a hot lab bleeds more product subscribers than a cold one", () => {
    let cold = withProduct();
    cold = { ...cold, products: { ...cold.products, active: [{ ...cold.products.active[0]!, mau: 1e5, paid: 1e4, buzzSec: 0 }] } };
    const hot = { ...cold, heat: balance.heat.max };
    const coldPaid = simulateProducts(cold.products, 60, derive(cold).productModsById).products.active[0]!.paid;
    const hotPaid = simulateProducts(hot.products, 60, derive(hot).productModsById).products.active[0]!.paid;
    expect(hotPaid).toBeLessThan(coldPaid);
  });
});
