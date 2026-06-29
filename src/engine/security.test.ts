import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { buyDataOffer, applyHeatEvent } from "./actions";
import { releaseProduct } from "./products";
import { balance } from "./balance/config";
import { products as PRODUCTS } from "./balance/products";
import { Big } from "./math/Big";

/** Helper: take a valid base save, mutate the raw JSON, run it back through the loader. */
function loadMutated(mutate: (raw: any) => void) {
  const base = JSON.parse(serialize(createInitialState()));
  mutate(base);
  return deserialize(JSON.stringify(base));
}
const finite = (b: Big) => Number.isFinite(b.toNumber()) || b.gt(Big.of("1e300")); // huge-but-valid ok; NaN/Inf not

describe("security — a save is untrusted input (backup/import is editable text)", () => {
  describe("resources / power fields can't be NaN, Infinity, or negative", () => {
    it("garbage / NaN / Infinity money → 0, never a NaN Big that bricks the run", () => {
      for (const bad of ["NaN", "Infinity", "-Infinity", "garbage", "1e", "0x10", "-500"]) {
        const s = loadMutated((r) => { r.resources.money = bad; });
        expect(finite(s.resources.money)).toBe(true);
        expect(s.resources.money.gte(Big.ZERO)).toBe(true);
      }
    });
    it("a legitimately huge late-game value is preserved (not clamped away)", () => {
      const s = loadMutated((r) => { r.resources.money = "1e250"; });
      expect(s.resources.money.gt(Big.of("1e249"))).toBe(true);
    });
    it("NaN/negative lifetimeMoney + legacyWeights fall back, so prestige math can't go NaN", () => {
      const s = loadMutated((r) => { r.lifetimeMoney = "NaN"; r.prestige.legacyWeights = "-1"; });
      expect(finite(s.lifetimeMoney)).toBe(true);
      expect(s.prestige.legacyWeights.gte(Big.ZERO)).toBe(true);
    });
  });

  describe("collections are validated, not passed through", () => {
    it("upgrades map drops NaN / negative / non-number / __proto__ entries", () => {
      const s = loadMutated((r) => { r.upgrades = { rack_basic: 5, bad: NaN, neg: -3, str: "x", __proto__: { evil: 1 } }; });
      expect(s.upgrades.rack_basic).toBe(5);
      expect(s.upgrades.bad).toBeUndefined();
      expect(s.upgrades.neg).toBeUndefined();
      expect(s.upgrades.str).toBeUndefined();
      expect((s.upgrades as any).evil).toBeUndefined();
    });
    it("research that isn't a string[] is rejected; non-strings filtered", () => {
      expect(loadMutated((r) => { r.research = "inference_api"; }).research).toEqual([]);
      expect(loadMutated((r) => { r.research = ["backprop", 5, null, "rlhf"]; }).research).toEqual(["backprop", "rlhf"]);
    });
    it("run.progress is clamped to [0,1] and flags coerced to bool", () => {
      const s = loadMutated((r) => { r.run = { active: "yes", progress: 1e9, readyToClaim: 1 }; });
      expect(s.run.progress).toBe(1);
      expect(s.run.active).toBe(false);
      expect(s.run.readyToClaim).toBe(false);
    });
    it("ships coerces to a non-negative integer", () => {
      expect(loadMutated((r) => { r.prestige.ships = -4.7; }).prestige.ships).toBe(0);
    });
  });

  describe("product fields are clamped to their design ranges (mirror the setters)", () => {
    function withProduct(over: Record<string, unknown>) {
      let s = createInitialState();
      s.resources.compute = Big.of(1e12); s.resources.data = Big.of(1e12); s.prestige.ships = 1;
      s = releaseProduct(s, { type: "general", name: "X", id: "p1" });
      const raw = JSON.parse(serialize(s));
      Object.assign(raw.products.active[0], over);
      return deserialize(JSON.stringify(raw)).products.active[0]!;
    }
    it("priceMult / enterprisePrice / marketingPerSec / quality / version / paid clamp", () => {
      const p = withProduct({ priceMult: 0.001, enterprisePrice: 1e-9, marketingPerSec: 1e12, quality: 1e308, version: 1e6, paid: 1e30, mau: 1000 });
      expect(p.priceMult).toBeGreaterThanOrEqual(PRODUCTS.priceMin);
      expect(p.priceMult).toBeLessThanOrEqual(PRODUCTS.priceMax);
      expect(p.enterprisePrice).toBeGreaterThanOrEqual(PRODUCTS.enterprise.priceMin);
      expect(p.quality).toBeLessThanOrEqual(1e12);
      expect(p.paid).toBeLessThanOrEqual(p.mau); // paid can never exceed MAU
      expect(p.marketingPerSec).toBeLessThanOrEqual(p.quality * PRODUCTS.marketingCapPerQuality);
      expect(Number.isFinite(p.version)).toBe(true);
    });
    it("duplicate features are deduped (can't stack a multiplier)", () => {
      const p = withProduct({ features: ["sso", "sso", "sso"] });
      expect(p.features).toEqual(["sso"]);
    });
    it("a crafted overflow product can NO LONGER brick Money with NaN (the C1 repro)", () => {
      let s = createInitialState();
      s.resources.compute = Big.of(1e12); s.resources.data = Big.of(1e12); s.prestige.ships = 1;
      s = releaseProduct(s, { type: "general", name: "X", id: "p1" });
      const raw = JSON.parse(serialize(s));
      Object.assign(raw.products.active[0], { quality: 1e308, priceMult: 0.5, mau: 1e6, paid: 1e6 });
      const loaded = deserialize(JSON.stringify(raw));
      const after = tick(loaded, 5000); // would previously fold Infinity−Infinity = NaN into Money
      expect(Number.isFinite(after.resources.money.toNumber())).toBe(true);
      expect(after.resources.money.gte(Big.ZERO)).toBe(true);
    });
  });

  describe("negative/absurd frontier can't grant a permanent buff", () => {
    it("frontier is clamped to ≥ frontierStart on load", () => {
      const s = loadMutated((r) => { r.products = { ...r.products, frontier: -1e9, active: [], drafts: [], sold: 0, milestones: [] }; });
      expect(s.products.frontier).toBeGreaterThanOrEqual(PRODUCTS.frontierStart);
    });
  });
});

describe("security — runtime event hardening", () => {
  it("an unknown heat-event id is a no-op (no applying a DIFFERENT event's fine)", () => {
    const s = { ...createInitialState(), heat: 50, resources: { ...createInitialState().resources, money: Big.of(1000) } };
    const { state } = applyHeatEvent(s, "does_not_exist");
    expect(state.resources.money.eq(Big.of(1000))).toBe(true); // unchanged
    expect(state.heat).toBe(50);
  });

  it("dodging a raid fine by being broke converts the shortfall to Heat + suspicion", () => {
    const offer = balance.dataMarket.find((o) => o.risk)!;
    const s = createInitialState();
    s.research = ["backprop"];
    s.resources.money = Big.of(offer.cost); // exactly the cost → can't pay the fine
    const { state, outcome } = buyDataOffer(s, offer.id, 0); // roll 0 → guaranteed raid
    expect(outcome?.kind).toBe("raid");
    expect(state.resources.money.gte(Big.ZERO)).toBe(true); // never negative
    // Spending-down didn't get off free: the dodged fine became Heat + suspicion.
    expect(state.heat).toBeGreaterThan(0);
    expect(state.suspicion).toBeGreaterThan(balance.regulator.perShadyBuy);
  });
});
