import { describe, it, expect } from "vitest";
import {
  productsUnlocked, canReleaseProduct, releaseProduct, pushVersion, canPushVersion,
  setProductPrice, setProductMarketing, renameProduct, retireProduct, retirePayout,
  simulateProducts, productMetrics, versionCost,
} from "./products";
import { applyWorldEvent } from "./actions";
import { tick } from "./tick";
import { prestige } from "./prestige";
import { createInitialState } from "./state";
import { products as B } from "./balance/products";
import { Big } from "./math/Big";

function shipped() {
  // A state past the first ship (products unlock) with resources to release.
  const s = createInitialState();
  s.prestige.ships = 1;
  s.resources.compute = Big.of(1e9);
  s.resources.data = Big.of(1e9);
  s.resources.money = Big.of(1e6);
  return s;
}
const release = (s = shipped(), type: "general" | "code" = "general") =>
  releaseProduct(s, { type, name: "Test AI", id: "p1" });

describe("products — unlock + release", () => {
  it("locks the system until the first ship", () => {
    expect(productsUnlocked(createInitialState())).toBe(false);
    expect(canReleaseProduct(createInitialState(), "general")).toBe(false);
    expect(productsUnlocked(shipped())).toBe(true);
  });

  it("releases a product, spending Compute + Data, at the current frontier", () => {
    const s = shipped();
    const next = release(s);
    expect(next.products.active).toHaveLength(1);
    const p = next.products.active[0]!;
    expect(p.version).toBe(1);
    expect(p.quality).toBe(s.products.frontier);
    expect(next.resources.compute.lt(s.resources.compute)).toBe(true);
    expect(next.resources.data.lt(s.resources.data)).toBe(true);
  });

  it("caps the active portfolio at maxActive", () => {
    let s = shipped();
    for (let i = 0; i < B.maxActive + 2; i++) {
      s = releaseProduct(s, { type: "general", name: `AI ${i}`, id: `p${i}` });
    }
    expect(s.products.active.length).toBe(B.maxActive);
  });

  it("can't release without enough Compute/Data", () => {
    const s = shipped();
    s.resources.compute = Big.of(0);
    expect(canReleaseProduct(s, "general")).toBe(false);
    expect(releaseProduct(s, { type: "general", name: "x", id: "p" })).toBe(s);
  });
});

describe("products — versioning", () => {
  it("push version costs resources, bumps version, refreshes quality + buzz", () => {
    let s = release();
    // advance the frontier so a fresh version is a real catch-up
    s = { ...s, products: { ...s.products, frontier: s.products.frontier + 5 } };
    const before = s.products.active[0]!;
    expect(canPushVersion(s, "p1")).toBe(true);
    const next = pushVersion(s, "p1");
    const after = next.products.active[0]!;
    expect(after.version).toBe(before.version + 1);
    expect(after.quality).toBe(s.products.frontier); // caught up to frontier
    expect(after.buzzSec).toBeGreaterThan(0);
    expect(versionCost(2).compute).toBeGreaterThan(versionCost(1).compute); // escalates
  });
});

describe("products — simulation", () => {
  it("drifts the frontier even with no active products (so a future launch is current)", () => {
    const s = shipped(); // no products released yet
    const before = s.products.frontier;
    const next = tick(s, 60_000);
    expect(next.products.frontier).toBeGreaterThan(before);
  });

  it("marketing acquires users and converts some to paid", () => {
    let s = release();
    s = setProductMarketing(s, "p1", 100000);
    const sim = simulateProducts(s.products, 30);
    const p = sim.products.active[0]!;
    expect(p.mau).toBeGreaterThan(0);
    expect(p.paid).toBeGreaterThan(0);
  });

  it("a healthy product (paying users, no over-spend) produces positive Money margin via tick", () => {
    let s = release();
    // Seed paying users; no marketing spend → margin = revenue − serving > 0.
    s = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, mau: 100000, paid: 5000, marketingPerSec: 0 }] } };
    const before = s.resources.money;
    const next = tick(s, 5000);
    expect(next.resources.money.gt(before)).toBe(true);
  });

  it("a stale product (frontier far ahead) churns its users down", () => {
    let s = release();
    s = { ...s, products: { active: [{ ...s.products.active[0]!, mau: 100000, paid: 5000, buzzSec: 0 }], frontier: s.products.frontier + 50 } };
    const sim = simulateProducts(s.products, 60);
    expect(sim.products.active[0]!.paid).toBeLessThan(5000); // bled subscribers
  });

  it("over-marketing yields negative margin (a real decision)", () => {
    let s = release();
    s = setProductMarketing(s, "p1", 1e9); // absurd spend, ~no users yet
    const m = productMetrics(s.products.active[0]!, s.products.frontier);
    expect(m.margin).toBeLessThan(0);
  });
});

describe("products — persistence", () => {
  it("survives a prestige reset", () => {
    let s = release(shipped(), "code");
    s.lifetimeMoney = Big.of("1e9");
    s.research = ["inference_api"]; // make shippable
    const after = prestige(s);
    expect(after.products.active).toHaveLength(1);
    expect(after.products.active[0]!.id).toBe("p1");
    expect(after.prestige.ships).toBe(s.prestige.ships + 1);
  });

  it("price/marketing setters clamp", () => {
    let s = release();
    s = setProductPrice(s, "p1", 99);
    expect(s.products.active[0]!.priceMult).toBe(B.priceMax);
    s = setProductPrice(s, "p1", 0.01);
    expect(s.products.active[0]!.priceMult).toBe(B.priceMin);
    s = setProductMarketing(s, "p1", -5);
    expect(s.products.active[0]!.marketingPerSec).toBe(0);
    s = retireProduct(s, "p1");
    expect(s.products.active).toHaveLength(0);
  });
});

describe("products — rename + retire payout", () => {
  it("rename trims, caps length, and falls back to a default", () => {
    let s = release();
    s = renameProduct(s, "p1", "  Nimbus  ");
    expect(s.products.active[0]!.name).toBe("Nimbus");
    s = renameProduct(s, "p1", "x".repeat(40));
    expect(s.products.active[0]!.name.length).toBe(24);
    s = renameProduct(s, "p1", "   ");
    expect(s.products.active[0]!.name).toBe("Untitled");
  });

  it("retiring pays out a buyout (≈ retireValuationSec of MRR) into Money + lifetime", () => {
    let s = release();
    // Seed a profitable book so MRR > 0 and the payout is meaningful.
    s = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, paid: 5000 }] } };
    const quote = retirePayout(s, "p1");
    expect(quote).toBeGreaterThan(0);
    const before = s.resources.money;
    const beforeLifetime = s.lifetimeMoney;
    const next = retireProduct(s, "p1");
    expect(next.products.active).toHaveLength(0);
    expect(next.resources.money.sub(before).toNumber()).toBeCloseTo(quote, 0);
    expect(next.lifetimeMoney.gt(beforeLifetime)).toBe(true);
  });

  it("retirePayout is 0 for an unknown product", () => {
    expect(retirePayout(release(), "nope")).toBe(0);
  });
});

describe("products — market world events", () => {
  it("competitor_launch jumps the frontier (rivals pull ahead)", () => {
    const s = release();
    const before = s.products.frontier;
    const { state } = applyWorldEvent(s, "competitor_launch");
    expect(state.products.frontier).toBeGreaterThan(before);
  });

  it("industry_hype buzzes every live product", () => {
    let s = release();
    // Drain buzz first so the event is what's setting it.
    s = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, buzzSec: 0 }] } };
    const { state } = applyWorldEvent(s, "industry_hype");
    expect(state.products.active[0]!.buzzSec).toBeGreaterThan(0);
  });
});
