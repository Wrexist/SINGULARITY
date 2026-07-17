import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { releaseProduct } from "./products";
import { prestige } from "./prestige";
import { setFlagship, flagshipMoneyMult, flagshipTenure, advanceFlagship } from "./flagship";
import { products as B } from "./balance/products";
import { serialize, deserialize } from "./save";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

/** A shippable state with one active product ("p1"). */
function withProduct() {
  const s = createInitialState();
  s.prestige.ships = 1;
  s.resources = { compute: Big.of(1e9), data: Big.of(1e9), money: Big.of(1e6) };
  s.research = [balance.prestige.capabilityResearch]; // prestige-eligible
  s.lifetimeMoney = Big.of(1e6);
  return releaseProduct(s, { type: "general", name: "Flagship AI", id: "p1" });
}

describe("flagship brand (cross-ship memory)", () => {
  it("is identity with none designated (curve-safe)", () => {
    const fresh = createInitialState();
    expect(flagshipTenure(fresh)).toBe(0);
    expect(flagshipMoneyMult(fresh)).toBe(1);
  });

  it("designates only an ACTIVE product, starting at tenure 0 (no bonus yet)", () => {
    const s = withProduct();
    expect(setFlagship(s, "ghost")).toBe(s); // not an active product → no-op
    const flagged = setFlagship(s, "p1");
    expect(flagged.flagship).toEqual({ productId: "p1", tenure: 0 });
    expect(flagshipMoneyMult(flagged)).toBe(1); // tenure 0 → brand not yet built
  });

  it("tenure grows each ship the flagship survives, and the revenue bonus follows", () => {
    const flagged = setFlagship(withProduct(), "p1");
    const shipped1 = prestige(flagged); // p1 survives the reset (products persist)
    expect(shipped1.flagship).toEqual({ productId: "p1", tenure: 1 });
    expect(flagshipMoneyMult(shipped1)).toBeCloseTo(1 + B.flagship.perShip, 6);
    const shipped2 = prestige({ ...shipped1, lifetimeMoney: Big.of(1e6), research: [balance.prestige.capabilityResearch] });
    expect(shipped2.flagship.tenure).toBe(2);
  });

  it("the bonus is BOUNDED at the tenure cap (can't trivialize the economy)", () => {
    const overCap = { ...withProduct(), flagship: { productId: "p1", tenure: 9999 } };
    expect(flagshipTenure(overCap)).toBe(B.flagship.capShips);
    expect(flagshipMoneyMult(overCap)).toBeCloseTo(1 + B.flagship.capShips * B.flagship.perShip, 6);
  });

  it("the brand is LOST if the flagship product is gone at ship time", () => {
    const flagged = { ...setFlagship(withProduct(), "p1"), flagship: { productId: "p1", tenure: 5 } };
    const retired = { ...flagged, products: { ...flagged.products, active: [] } };
    expect(advanceFlagship(retired)).toEqual({ productId: null, tenure: 0 });
  });

  it("round-trips and sanitizes hostile saves (phantom id cleared, tenure clamped)", () => {
    const s = setFlagship(withProduct(), "p1");
    expect(deserialize(serialize(s)).flagship).toEqual({ productId: "p1", tenure: 0 });
    // Phantom product id → cleared.
    const ghost = JSON.parse(serialize(s));
    ghost.flagship = { productId: "ghost", tenure: 999 };
    const fixedGhost = deserialize(JSON.stringify(ghost));
    expect(fixedGhost.flagship).toEqual({ productId: null, tenure: 0 });
    // Real id but over-tenure → clamped to the cap.
    const over = JSON.parse(serialize(s));
    over.flagship = { productId: "p1", tenure: 999 };
    expect(deserialize(JSON.stringify(over)).flagship.tenure).toBe(B.flagship.capShips);
  });
});
