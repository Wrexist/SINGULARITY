import { describe, it, expect } from "vitest";
import {
  launchDraft, retirePayout, retireProduct, setProductPrice, setEnterprise, setEnterprisePrice, productMetrics,
} from "./products";
import { tick } from "./tick";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { products as B } from "./balance/products";
import type { GameState } from "./types";

/** A mature Code product with a real user base, settled at the default price dials. */
function matureProduct(): GameState {
  let s = createInitialState();
  s.prestige.ships = B.enterprise.unlockShips + 1; // the Enterprise tier is on offer
  s.products.drafts = [{ id: "draft-1", quality: 20, ships: 1 }];
  s = launchDraft(s, { draftId: "draft-1", type: "code", name: "Coder", id: "prod-1" });
  s = {
    ...s,
    products: {
      ...s.products,
      active: s.products.active.map((p) => ({ ...p, mau: 400_000, ageSec: 2 * B.retireMaturitySec })),
    },
  };
  // Ten minutes at the default dials: the paying count has long since settled.
  for (let i = 0; i < 600; i++) s = tick(s, 1000);
  return s;
}

/** Every price dial to its revenue-maximising extreme, as a player would right before selling. */
function pumpDials(s: GameState): GameState {
  let g = setProductPrice(s, "prod-1", B.priceMax);
  g = setEnterprise(g, "prod-1", true);
  return setEnterprisePrice(g, "prod-1", B.enterprise.priceMax);
}

describe("selling a product", () => {
  it("values the sale on the revenue the product earns with its live ARPU buffs", () => {
    const plain = matureProduct();
    // Product Company multiplies every product's ARPU; the sale must price that in.
    const boosted: GameState = { ...plain, charter: "product_company" };
    const mods = derive(boosted).productModsById["prod-1"]!;
    expect(mods.arpu).toBeGreaterThan(1);
    const p = boosted.products.active[0]!;
    const live = productMetrics(p, boosted.products.frontier, mods).mrr * B.retireValuationSec;
    expect(retirePayout(boosted, "prod-1") / live).toBeCloseTo(1, 6);
    expect(retirePayout(boosted, "prod-1")).toBeGreaterThan(retirePayout(plain, "prod-1") * 2);
    // The credit matches the quote.
    const sold = retireProduct(boosted, "prod-1");
    expect(sold.resources.money.sub(boosted.resources.money).toNumber() / live).toBeCloseTo(1, 6);
  });

  it("values a settled product exactly as before: its revenue/sec × the valuation window", () => {
    const s = matureProduct();
    const p = s.products.active[0]!;
    const expected = productMetrics(p, s.products.frontier).mrr * B.retireValuationSec;
    expect(retirePayout(s, "prod-1")).toBeGreaterThan(0);
    expect(retirePayout(s, "prod-1") / expected).toBeCloseTo(1, 6);
  });

  it("can't be pumped by maxing the price dials right before the sale", () => {
    const s = matureProduct();
    const pumped = pumpDials(s);
    // What those dials actually earn once the paying count has settled to them.
    let settled = pumped;
    for (let i = 0; i < 300; i++) settled = tick(settled, 1000);
    const fair = retirePayout(settled, "prod-1");
    expect(fair).toBeGreaterThan(0);

    // Selling in the same frame as the dial change is worth no more than that…
    expect(retirePayout(pumped, "prod-1")).toBeLessThanOrEqual(fair * 1.001);
    // …nor a few seconds later, before the subscriber count has caught up.
    let lagged = pumped;
    for (let i = 0; i < 50; i++) lagged = tick(lagged, 100);
    expect(retirePayout(lagged, "prod-1")).toBeLessThanOrEqual(fair * 1.001);
  });

  it("credits exactly the payout it shows", () => {
    const pumped = pumpDials(matureProduct());
    const shown = retirePayout(pumped, "prod-1");
    const sold = retireProduct(pumped, "prod-1");
    expect(sold.resources.money.sub(pumped.resources.money).toNumber()).toBeCloseTo(shown, 0);
    expect(sold.lifetimeMoney.sub(pumped.lifetimeMoney).toNumber()).toBeCloseTo(shown, 0);
    expect(sold.products.active).toHaveLength(0);
  });
});
