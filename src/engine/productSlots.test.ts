import { describe, it, expect } from "vitest";
import { maxActiveProducts, canReleaseProduct, releaseProduct } from "./products";
import { bonusProductSlots } from "./reputation";
import { products as B } from "./balance/products";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

function shipped() {
  const s = createInitialState();
  s.prestige.ships = 1;
  s.resources.compute = Big.of(1e12);
  s.resources.data = Big.of(1e12);
  s.resources.money = Big.of(1e9);
  return s;
}

describe("R5.6 — Portfolio Expansion perk (+1 product slot)", () => {
  it("base slots without the perk; +1 with it", () => {
    const s = shipped();
    expect(bonusProductSlots(s)).toBe(0);
    expect(maxActiveProducts(s)).toBe(B.maxActive);
    s.reputation.perks = ["rep_slot"];
    expect(bonusProductSlots(s)).toBe(1);
    expect(maxActiveProducts(s)).toBe(B.maxActive + 1);
  });

  it("lets you launch one more product than the base cap", () => {
    let s = shipped();
    s.reputation.perks = ["rep_slot"];
    for (let i = 0; i < B.maxActive; i++) {
      s = releaseProduct(s, { type: "general", name: `P${i}`, id: `p${i}` });
    }
    // Base cap reached, but the extra slot is still open.
    expect(s.products.active).toHaveLength(B.maxActive);
    expect(canReleaseProduct(s, "general")).toBe(true);
    s = releaseProduct(s, { type: "general", name: "extra", id: "px" });
    expect(s.products.active).toHaveLength(B.maxActive + 1);
    // Now truly full.
    expect(canReleaseProduct(s, "general")).toBe(false);
  });
});
