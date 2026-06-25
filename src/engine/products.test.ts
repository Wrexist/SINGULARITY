import { describe, it, expect } from "vitest";
import {
  productsUnlocked, canReleaseProduct, releaseProduct, pushVersion, canPushVersion,
  setProductPrice, setProductMarketing, renameProduct, retireProduct, retirePayout,
  simulateProducts, productMetrics, versionCost,
  churnReason, maybeChurnFlavor,
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

  it("gates premium model types behind ship count", () => {
    const s = shipped(); // ships = 1
    // Entry types available immediately…
    expect(canReleaseProduct(s, "general")).toBe(true);
    expect(canReleaseProduct(s, "code")).toBe(true);
    // …premium types are locked until you've shipped more.
    expect(canReleaseProduct(s, "domain")).toBe(false);
    expect(canReleaseProduct(s, "reasoning")).toBe(false);
    expect(releaseProduct(s, { type: "domain", name: "x", id: "p" })).toBe(s); // no-op
    const veteran = { ...s, prestige: { ...s.prestige, ships: 4 } };
    expect(canReleaseProduct(veteran, "domain")).toBe(true);
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
    s = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, mau: 100000, paid: 5000, buzzSec: 0 }], frontier: s.products.frontier + 50 } };
    const sim = simulateProducts(s.products, 60);
    expect(sim.products.active[0]!.paid).toBeLessThan(5000); // bled subscribers
  });

  it("over-marketing yields negative margin (a real decision)", () => {
    let s = release();
    s = setProductMarketing(s, "p1", 1e9); // absurd spend, ~no users yet
    const m = productMetrics(s.products.active[0]!, s.products.frontier);
    expect(m.margin).toBeLessThan(0);
  });

  it("a long offline tick does NOT wipe a still-competitive product's paid base (regression)", () => {
    let s = release(shipped(), "code"); // the stickiest type
    // Keep quality well above the frontier so it stays competitive across the
    // window — this isolates the CHURN MODEL from (legit) staleness churn.
    s = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, quality: 1000, mau: 300000, paid: 50000 }] } };
    // 8h in a single tick (the offline cap). The old linear churn term drove paid
    // massively negative → clamped to 0, wiping the base on every reopen.
    const sim = simulateProducts(s.products, 8 * 3600);
    const p = sim.products.active[0]!;
    expect(p.paid).toBeGreaterThan(10000); // retained (old model gave exactly 0)
    expect(Number.isFinite(p.paid)).toBe(true);
    expect(Number.isFinite(sim.moneyDelta)).toBe(true);
    expect(sim.moneyDelta).toBeGreaterThan(0); // earned, not nonsense
  });

  it("marketing is clamped to the quality-gated cap at the engine", () => {
    let s = release(); // quality = frontier = frontierStart (1)
    s = setProductMarketing(s, "p1", 1e9);
    const p = s.products.active[0]!;
    expect(p.marketingPerSec).toBe(p.quality * B.marketingCapPerQuality);
  });
});

describe("products — churn-reason flavor", () => {
  // A released product carries a launch-buzz window; clear it to read steady-state churn.
  const settled = () => {
    const s = release();
    return { ...s.products.active[0]!, buzzSec: 0, paid: 500 };
  };

  it("classifies a competitive, fairly-priced product as healthy", () => {
    const p = { ...settled(), quality: 5, priceMult: 1 };
    expect(churnReason(p, 5)).toBe("healthy");
  });

  it("a product inside its buzz window is never roasted", () => {
    const p = { ...settled(), buzzSec: 10, quality: 1 };
    expect(churnReason(p, 100)).toBe("healthy"); // stale on paper, but freshly shipped
  });

  it("blames staleness when the frontier has run far ahead", () => {
    const p = { ...settled(), quality: 1, priceMult: 1 };
    expect(churnReason(p, 51)).toBe("stale");
  });

  it("blames pricing when the dial is cranked but quality is current", () => {
    const p = { ...settled(), quality: 5, priceMult: 1.8 };
    expect(churnReason(p, 5)).toBe("pricey");
  });

  it("picks the dominant pressure when both apply (huge gap → stale)", () => {
    const p = { ...settled(), quality: 1, priceMult: 1.8 };
    expect(churnReason(p, 51)).toBe("stale");
  });

  it("fires a flavor quip naming a materially-bleeding product", () => {
    const stale = { ...settled(), quality: 1, priceMult: 1, paid: 500 };
    const ps = { active: [stale], frontier: 51, sold: 0 };
    const res = maybeChurnFlavor(ps, 10, 0, 0, 0); // rollFire 0 → fires
    expect(res).not.toBeNull();
    expect(res!.reason).toBe("stale");
    expect(res!.message).toContain(stale.name);
  });

  it("stays silent on the dice when the fire roll misses", () => {
    const stale = { ...settled(), quality: 1, priceMult: 1, paid: 500 };
    const ps = { active: [stale], frontier: 51, sold: 0 };
    expect(maybeChurnFlavor(ps, 0.1, 0.99, 0, 0)).toBeNull(); // tiny window, high roll
  });

  it("won't quip about a product with no real subscriber base", () => {
    const tiny = { ...settled(), quality: 1, priceMult: 1, paid: 5 }; // below flavor.minPaid
    const ps = { active: [tiny], frontier: 51, sold: 0 };
    expect(maybeChurnFlavor(ps, 10, 0, 0, 0)).toBeNull();
  });

  it("won't quip about a healthy portfolio", () => {
    const healthy = { ...settled(), quality: 50, priceMult: 1, paid: 500 };
    const ps = { active: [healthy], frontier: 50, sold: 0 };
    expect(maybeChurnFlavor(ps, 10, 0, 0, 0)).toBeNull();
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

  it("retiring increments the lifetime 'sold' badge, and it survives prestige", () => {
    let s = release();
    expect(s.products.sold).toBe(0);
    s = retireProduct(s, "p1");
    expect(s.products.sold).toBe(1);
    // Carry it through a ship.
    s = release(s, "code");
    s.lifetimeMoney = Big.of("1e9");
    s.research = ["inference_api"];
    const after = prestige(retireProduct(s, "p1"));
    expect(after.products.sold).toBe(2);
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
