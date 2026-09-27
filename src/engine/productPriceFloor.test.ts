import { describe, it, expect } from "vitest";
import {
  launchDraft, setProductPrice, setEnterprise, setEnterprisePrice, simulateProducts, productMetrics, typeDef,
} from "./products";
import { products as P, type ProductTypeId } from "./balance/products";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import type { GameState } from "./types";

/**
 * Lowest-price margin (round 8, owner call). Revenue and serving cost per paid user
 * both scale with quality, so a price dial below computePerUser / baseArpu loses money
 * on every subscriber whatever the lab does. Reasoning Engine's break-even is ×0.533
 * and the dial went down to ×0.5, so the bottom of the slider ran at a structural loss
 * even with marketing at 0. Each type's lowest selectable price now covers its own
 * serving cost.
 */
const TYPES = P.types.map((t) => t.id) as ProductTypeId[];

/** A live product of `type` with half its market, marketing at 0, the price dial
 *  pushed as low as it goes, run long enough for the paying base to settle. */
function lowestPriced(type: ProductTypeId, enterprise = false): GameState {
  let s = createInitialState();
  s.prestige.ships = 10; // every type and the Enterprise tier unlocked
  s.products.frontier = 20;
  s.products.drafts = [{ id: "d", quality: 20, ships: 9 }];
  s = launchDraft(s, { draftId: "d", type, name: "P", id: "p" });
  s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, mau: typeDef(type).tam / 2, buzzSec: 0 })) } };
  s = setProductPrice(s, "p", 0); // clamps to the lowest selectable price
  if (enterprise) s = setEnterprisePrice(setEnterprise(s, "p", true), "p", 0);
  const settled = simulateProducts({ ...s.products, frontier: 20 }, 20_000);
  return { ...s, products: { ...settled.products, frontier: 20 } };
}

describe("the lowest selectable price never runs at a structural loss", () => {
  for (const type of TYPES) {
    it(`${type}: non-negative margin at zero marketing, settled`, () => {
      for (const enterprise of [false, true]) {
        const s = lowestPriced(type, enterprise);
        const p = s.products.active[0]!;
        expect(p.marketingPerSec).toBe(0);
        expect(p.paid).toBeGreaterThan(0);
        const m = productMetrics(p, s.products.frontier);
        expect(m.margin, `${type} at x${p.priceMult}${enterprise ? " + Enterprise" : ""}`).toBeGreaterThanOrEqual(0);
      }
    });
  }

  it("only Reasoning Engine's floor moves; every other type keeps x0.5", () => {
    for (const type of TYPES) {
      const floor = lowestPriced(type).products.active[0]!.priceMult;
      if (type === "reasoning") expect(floor).toBeCloseTo(0.6, 9);
      else expect(floor).toBeCloseTo(P.priceMin, 9);
    }
  });

  it("a save priced below the floor loads at the floor (the setter's own clamp)", () => {
    let s = lowestPriced("reasoning");
    s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, priceMult: 0.5 })) } };
    const back = deserialize(serialize(s))!;
    expect(back.products.active).toHaveLength(1);
    expect(back.products.active[0]!.priceMult).toBeCloseTo(0.6, 9);
    // Other types keep the global floor on load.
    let g = lowestPriced("general");
    g = { ...g, products: { ...g.products, active: g.products.active.map((p) => ({ ...p, priceMult: 0.5 })) } };
    expect(deserialize(serialize(g))!.products.active[0]!.priceMult).toBeCloseTo(0.5, 9);
  });
});
