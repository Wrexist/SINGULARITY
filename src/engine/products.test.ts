import { describe, it, expect } from "vitest";
import {
  productsUnlocked, canReleaseProduct, releaseProduct, pushVersion, canPushVersion,
  setProductPrice, setProductMarketing, renameProduct, retireProduct, retirePayout,
  simulateProducts, productMetrics, versionCost,
  churnReason, maybeChurnFlavor,
  canLaunchDraft, launchDraft, canStartUpgrade, startUpgrade, advanceUpgrades, upgradeDurationSec,
  applyMilestones, milestoneValue, maybeProductEvent,
  canBuyFeature, buyFeature, featureMods,
  setEnterprise, enterpriseUnlocked, suggestChannelMix, typeDef,
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

  it("blames pricing when only pricing crossed, even if staleness is numerically larger", () => {
    // gap 0.75 → staleExcess 0.45 (< staleMin 0.5, NOT hot) but > priceExcess 0.42;
    // priceMult 1.42 → priceExcess 0.42 (≥ priceMin 0.4, hot). Must read "pricey",
    // not "stale" — only the price pressure actually crossed its threshold.
    const p = { ...settled(), quality: 5, priceMult: 1.42 };
    expect(churnReason(p, 5.75)).toBe("pricey");
  });

  it("fires a flavor quip naming a materially-bleeding product", () => {
    const stale = { ...settled(), quality: 1, priceMult: 1, paid: 500 };
    const ps = { active: [stale], frontier: 51, sold: 0, drafts: [], milestones: [] };
    const res = maybeChurnFlavor(ps, 10, 0, 0, 0); // rollFire 0 → fires
    expect(res).not.toBeNull();
    expect(res!.reason).toBe("stale");
    expect(res!.message).toContain(stale.name);
  });

  it("stays silent on the dice when the fire roll misses", () => {
    const stale = { ...settled(), quality: 1, priceMult: 1, paid: 500 };
    const ps = { active: [stale], frontier: 51, sold: 0, drafts: [], milestones: [] };
    expect(maybeChurnFlavor(ps, 0.1, 0.99, 0, 0)).toBeNull(); // tiny window, high roll
  });

  it("won't quip about a product with no real subscriber base", () => {
    const tiny = { ...settled(), quality: 1, priceMult: 1, paid: 5 }; // below flavor.minPaid
    const ps = { active: [tiny], frontier: 51, sold: 0, drafts: [], milestones: [] };
    expect(maybeChurnFlavor(ps, 10, 0, 0, 0)).toBeNull();
  });

  it("won't quip about a healthy portfolio", () => {
    const healthy = { ...settled(), quality: 50, priceMult: 1, paid: 500 };
    const ps = { active: [healthy], frontier: 50, sold: 0, drafts: [], milestones: [] };
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

describe("products — drafts from shipping", () => {
  const shippable = () => {
    const s = shipped();
    s.lifetimeMoney = Big.of("1e9");
    s.research = ["inference_api"]; // the capability research that unlocks shipping
    return s;
  };

  it("Ship the Model deposits a raw-model draft sized to the frontier", () => {
    const s = shippable();
    s.products = { ...s.products, frontier: 7 };
    const after = prestige(s);
    expect(after.products.drafts).toHaveLength(1);
    expect(after.products.drafts[0]!.quality).toBe(7);
    expect(after.products.drafts[0]!.ships).toBe(s.prestige.ships + 1);
    // the reset still happened (compute zeroed) but the business + draft carried over
    expect(after.resources.compute.toNumber()).toBe(0);
  });

  it("caps the draft pile at maxDrafts (oldest drops off)", () => {
    let s = shippable();
    for (let i = 0; i < B.maxDrafts + 3; i++) s = { ...prestige(s), lifetimeMoney: Big.of("1e9"), research: ["inference_api"] };
    expect(s.products.drafts.length).toBe(B.maxDrafts);
  });

  it("launches a draft into a product at the DRAFT's quality, paying the launch cost", () => {
    const s = shipped();
    s.products = { ...s.products, drafts: [{ id: "draft-1", quality: 12, ships: 1 }] };
    expect(canLaunchDraft(s, "draft-1", "general")).toBe(true);
    const next = launchDraft(s, { draftId: "draft-1", type: "general", name: "Nimbus", id: "prod-1" });
    expect(next.products.active).toHaveLength(1);
    expect(next.products.active[0]!.quality).toBe(12); // not the frontier — the model you shipped
    expect(next.products.drafts).toHaveLength(0);
    expect(next.resources.compute.lt(s.resources.compute)).toBe(true);
  });

  it("won't launch a locked type or past the slot cap", () => {
    const s = shipped(); // ships = 1
    s.products = { ...s.products, drafts: [{ id: "draft-1", quality: 5, ships: 1 }] };
    expect(canLaunchDraft(s, "draft-1", "domain")).toBe(false); // premium type still gated
    expect(launchDraft(s, { draftId: "missing", type: "general", name: "x", id: "p" })).toBe(s);
  });
});

describe("products — timed version upgrades", () => {
  const ready = () => {
    let s = release(); // p1, v1, quality = frontier
    s = { ...s, products: { ...s.products, frontier: s.products.frontier + 10 } }; // frontier ran ahead
    s.resources.compute = Big.of(1e9);
    s.resources.data = Big.of(1e9);
    return s;
  };

  it("research duration escalates with version", () => {
    expect(upgradeDurationSec(2)).toBeGreaterThan(upgradeDurationSec(1));
  });

  it("starting an upgrade pays upfront and arms the research timer (one at a time)", () => {
    let s = ready();
    const before = s.resources.compute;
    expect(canStartUpgrade(s, "p1")).toBe(true);
    s = startUpgrade(s, "p1");
    const u = s.products.active[0]!.upgrade!;
    expect(u.targetVersion).toBe(2);
    expect(u.remainingSec).toBeGreaterThan(0);
    expect(u.totalSec).toBe(upgradeDurationSec(1));
    expect(s.resources.compute.lt(before)).toBe(true); // upfront paid
    expect(canStartUpgrade(s, "p1")).toBe(false); // can't stack a second
  });

  it("completes after its research window: version bumps, quality catches the frontier, buzz fires", () => {
    let s = startUpgrade(ready(), "p1");
    const u = s.products.active[0]!.upgrade!;
    const res = advanceUpgrades(s.products, 1e9, 1e9, u.totalSec + 1);
    const p = res.products.active[0]!;
    expect(p.upgrade).toBeNull();
    expect(p.version).toBe(2);
    expect(p.quality).toBe(s.products.frontier); // caught up
    expect(p.buzzSec).toBeGreaterThan(0);
    expect(res.computeSpent).toBeGreaterThan(0);
    expect(res.completed).toHaveLength(1);
  });

  it("stalls (no progress, no spend) on a tick the player can't afford the drain", () => {
    const s = startUpgrade(ready(), "p1");
    const u = s.products.active[0]!.upgrade!;
    const res = advanceUpgrades(s.products, 0, 0, u.totalSec + 1); // broke
    expect(res.products.active[0]!.upgrade!.remainingSec).toBeCloseTo(u.remainingSec, 5);
    expect(res.computeSpent).toBe(0);
  });

  it("a long offline tick completes an affordable in-flight upgrade", () => {
    let s = startUpgrade(ready(), "p1");
    const dur = s.products.active[0]!.upgrade!.totalSec;
    const next = tick(s, (dur + 5) * 1000);
    expect(next.products.active[0]!.version).toBe(2);
    expect(next.products.active[0]!.upgrade).toBeNull();
  });
});

describe("products — employee (staff) buffs", () => {
  it("acquisition + churn buffs lift users and cut losses; serve buff raises margin", () => {
    let s = release();
    s = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, mau: 50000, paid: 3000, marketingPerSec: 0, buzzSec: 0, quality: 5 }], frontier: 5 } };
    const base = simulateProducts(s.products, 60);
    const buffed = simulateProducts(s.products, 60, { p1: { upgradeSpeed: 1, acq: 1.5, churn: 0.5, serveCost: 0.5, arpu: 1, heat: 1 } });
    expect(buffed.products.active[0]!.mau).toBeGreaterThan(base.products.active[0]!.mau); // more acquisition
    expect(buffed.products.active[0]!.paid).toBeGreaterThan(base.products.active[0]!.paid); // less churn
    expect(buffed.moneyDelta).toBeGreaterThan(base.moneyDelta); // cheaper to serve
  });

  it("research-speed buff completes an upgrade in fewer seconds", () => {
    let s = release();
    s = { ...s, products: { ...s.products, frontier: s.products.frontier + 10 } };
    s.resources.compute = Big.of(1e9); s.resources.data = Big.of(1e9);
    s = startUpgrade(s, "p1");
    const total = s.products.active[0]!.upgrade!.totalSec;
    // Half the real time, but 2× speed → completes.
    const fast = advanceUpgrades(s.products, 1e9, 1e9, total / 2, { p1: { upgradeSpeed: 2, acq: 1, churn: 1, serveCost: 1, arpu: 1, heat: 1 } });
    expect(fast.products.active[0]!.upgrade).toBeNull();
    // Same wall-time at 1× speed would NOT finish.
    const slow = advanceUpgrades(s.products, 1e9, 1e9, total / 2);
    expect(slow.products.active[0]!.upgrade).not.toBeNull();
  });
});

describe("products — milestones", () => {
  it("awards a milestone once when crossed, pays its reward, and is idempotent", () => {
    const s = release(); // launching a product crosses the 'first_launch' (live ≥ 1) milestone
    expect(milestoneValue(s, "live")).toBe(1);
    const before = s.resources.money;
    const r = applyMilestones(s);
    expect(r.achieved.some((a) => a.def.id === "first_launch")).toBe(true);
    expect(r.state.products.milestones).toContain("first_launch");
    expect(r.state.resources.money.gt(before)).toBe(true); // reward paid
    // Re-running grants nothing new.
    expect(applyMilestones(r.state).achieved).toHaveLength(0);
  });

  it("surfaces milestones through tick as users grow", () => {
    let s = release();
    s = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, mau: 200_000, paid: 1000 }] } };
    const next = tick(s, 1000);
    expect(next.products.milestones).toContain("users_100k");
  });
});

describe("products — per-product features", () => {
  it("buys a feature once, spending Money, and folds its effect into the sim", () => {
    let s = release();
    s.resources.money = Big.of(1e6);
    expect(canBuyFeature(s, "p1", "cdn")).toBe(true);
    const before = s.resources.money;
    s = buyFeature(s, "p1", "cdn"); // −25% serve cost
    expect(s.products.active[0]!.features).toContain("cdn");
    expect(s.resources.money.lt(before)).toBe(true);
    expect(featureMods(s.products.active[0]!).serveCost).toBeCloseTo(0.75, 5);
    // Can't buy the same feature twice.
    expect(canBuyFeature(s, "p1", "cdn")).toBe(false);
    expect(buyFeature(s, "p1", "cdn")).toBe(s); // no-op
  });

  it("a CDN feature lowers serving cost → higher margin in the sim", () => {
    let base = release();
    base = { ...base, products: { ...base.products, active: [{ ...base.products.active[0]!, mau: 100000, paid: 8000, buzzSec: 0 }] } };
    const withCdn = { ...base, products: { ...base.products, active: [{ ...base.products.active[0]!, features: ["cdn"] }] } };
    const a = simulateProducts(base.products, 30).moneyDelta;
    const b = simulateProducts(withCdn.products, 30).moneyDelta;
    expect(b).toBeGreaterThan(a);
  });

  it("can't buy a feature you can't afford", () => {
    const s = release(); // money = 1e6 from shipped(); drop it
    s.resources.money = Big.of(10);
    expect(canBuyFeature(s, "p1", "api")).toBe(false);
  });
});

describe("products — pricing tiers", () => {
  it("Enterprise tier unlocks with ship count and is gated in setEnterprise", () => {
    const s = release(); // ships = 1
    expect(enterpriseUnlocked(s)).toBe(false);
    expect(setEnterprise(s, "p1", true).products.active[0]!.enterprise).toBe(false); // locked
    const vet = { ...s, prestige: { ...s.prestige, ships: 5 } };
    expect(enterpriseUnlocked(vet)).toBe(true);
    expect(setEnterprise(vet, "p1", true).products.active[0]!.enterprise).toBe(true);
  });

  it("opening Enterprise raises MRR via a premium high-ARPU slice", () => {
    let s = release();
    s = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, mau: 200000, paid: 10000, buzzSec: 0 }] } };
    const base = simulateProducts(s.products, 30).moneyDelta;
    const ent = { ...s.products, active: [{ ...s.products.active[0]!, enterprise: true }] };
    expect(simulateProducts(ent, 30).moneyDelta).toBeGreaterThan(base);
  });
});

describe("products — marketing channels", () => {
  it("at low penetration: Organic (cheap) acquires more than Ads, which beats Events (pricey)", () => {
    const base = release();
    const seed = { ...base.products.active[0]!, quality: 100, marketingPerSec: 1000, mau: 1000, paid: 0 };
    const mauAfter = (channel: string) =>
      simulateProducts({ ...base.products, active: [{ ...seed, channelMix: { [channel]: 1 } }] }, 2).products.active[0]!.mau;
    expect(mauAfter("organic")).toBeGreaterThan(mauAfter("ads"));
    expect(mauAfter("ads")).toBeGreaterThan(mauAfter("events"));
  });

  it("default {ads:1} reproduces the baseline acquisition (curve undisturbed)", () => {
    const base = release();
    const seed = { ...base.products.active[0]!, quality: 100, marketingPerSec: 1000, mau: 1000 };
    const withDefault = simulateProducts({ ...base.products, active: [{ ...seed, channelMix: { ads: 1 } }] }, 2).products.active[0]!.mau;
    const withEmpty = simulateProducts({ ...base.products, active: [{ ...seed, channelMix: {} }] }, 2).products.active[0]!.mau;
    expect(withEmpty).toBeCloseTo(withDefault, 3); // empty mix falls back to ads
  });
});

describe("products — ops events", () => {
  const withUsers = () => {
    let s = release();
    return { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, mau: 200_000, paid: 20_000, buzzSec: 0 }] } };
  };

  it("won't fire for a product without a real user base", () => {
    const s = release(); // mau = 0
    expect(maybeProductEvent(s, 10, 0, 0, 0)).toBeNull();
  });

  it("stays silent when the fire roll misses", () => {
    expect(maybeProductEvent(withUsers(), 0.1, 0.999, 0, 0)).toBeNull();
  });

  it("fires an event that nudges the product and returns a toast", () => {
    const s = withUsers();
    const res = maybeProductEvent(s, 10, 0, 0, 0); // rollFire 0 → fires; first event = viral (good)
    expect(res).not.toBeNull();
    expect(res!.tone).toBe("good");
    expect(res!.message).toContain("Test AI");
    // viral spikes users and arms buzz
    expect(res!.state.products.active[0]!.mau).toBeGreaterThan(s.products.active[0]!.mau);
    expect(res!.state.products.active[0]!.buzzSec).toBeGreaterThan(0);
  });

  it("a bad event (last in the list) reduces subs", () => {
    const s = withUsers();
    const res = maybeProductEvent(s, 10, 0, 0, 0.999)!; // last event = price_war (bad)
    expect(res.tone).toBe("bad");
    expect(res.state.products.active[0]!.paid).toBeLessThan(s.products.active[0]!.paid);
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

describe("products — suggest channel mix", () => {
  it("favours the cheapest channel on a fresh product and normalises to ≤ 1", () => {
    const p = release().products.active[0]!;
    p.mau = 0; // zero penetration
    const mix = suggestChannelMix(p, typeDef(p.type));
    // Organic (cacMult 0.5) is cheapest at pen 0 → it should be the 1.0 anchor.
    expect(mix.organic).toBe(1);
    expect(mix.organic).toBeGreaterThan(mix.ads!);
    expect(mix.ads!).toBeGreaterThan(mix.influencer!);
    for (const w of Object.values(mix)) { expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1); }
  });

  it("shifts away from fast-saturating channels as the market fills", () => {
    const t = typeDef(release().products.active[0]!.type);
    const fresh = release().products.active[0]!; fresh.mau = 0;
    const saturated = release().products.active[0]!; saturated.mau = t.tam; // fully penetrated
    const a = suggestChannelMix(fresh, t);
    const b = suggestChannelMix(saturated, t);
    // Organic saturates fastest (satMult 3); its share of budget should fall as the
    // market fills, relative to the slow-saturating Conferences (satMult 0.15).
    expect(b.organic! / b.events!).toBeLessThan(a.organic! / a.events!);
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
