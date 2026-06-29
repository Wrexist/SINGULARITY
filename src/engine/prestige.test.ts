import { describe, it, expect } from "vitest";
import { canPrestige, legacyWeightsGain, legacyWeightsForMode, prestige } from "./prestige";
import { applyOffline } from "./offline";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

describe("prestige", () => {
  it("is gated until the Inference API capability is researched", () => {
    const s = createInitialState();
    s.lifetimeMoney = Big.of(1e9);
    expect(canPrestige(s)).toBe(false);
    s.research = [balance.prestige.capabilityResearch];
    expect(canPrestige(s)).toBe(true);
  });

  it("grants Legacy Weights per the formula and resets the run", () => {
    const s = createInitialState();
    s.research = [balance.prestige.capabilityResearch, "backprop"];
    s.lifetimeMoney = Big.of(1e6);
    s.resources.money = Big.of(1e6);
    s.upgrades = { rack_basic: 10 };
    const gain = legacyWeightsGain(s);
    expect(gain.gt(0)).toBe(true);

    const next = prestige(s);
    expect(next.prestige.ships).toBe(1);
    expect(next.prestige.legacyWeights.eq(gain)).toBe(true);
    expect(next.resources.money.eq(0)).toBe(true);
    expect(next.upgrades).toEqual({});
    expect(next.research).toEqual([]);
  });

  it("matches the formula exactly (Big-native, no float round-trip)", () => {
    const s = createInitialState();
    s.research = [balance.prestige.capabilityResearch];
    // Derive from balance so it survives difficulty/scale dials.
    s.lifetimeMoney = Big.of(1e10);
    const expected = Math.floor(Math.pow(1e10 / balance.prestige.scale, balance.prestige.exponent));
    expect(legacyWeightsGain(s).eq(Big.of(expected))).toBe(true);
  });

  it("does NOT overflow to Infinity past 1e308 (the whole point of Big)", () => {
    const s = createInitialState();
    s.research = [balance.prestige.capabilityResearch];
    s.lifetimeMoney = Big.of("1e400"); // far beyond Number.MAX_VALUE
    const gain = legacyWeightsGain(s);
    // (1e400/1e4)^0.5 = 1e198 — a finite, enormous Big, not Infinity.
    expect(gain.gt(Big.of("1e197"))).toBe(true);
    expect(gain.lt(Big.of("1e199"))).toBe(true);
    // And it must survive a prestige without poisoning the multiplier.
    const next = prestige(s);
    expect(derive(next).computePerSec.gt(0)).toBe(true);
    expect(Number.isFinite(derive(next).legacyMult.toNumber())).toBe(true);
  });

  it("makes the next run measurably faster (permanent multiplier applies)", () => {
    const base = createInitialState();
    const boosted = createInitialState();
    boosted.prestige.legacyWeights = Big.of(100);
    expect(derive(boosted).computePerSec.gt(derive(base).computePerSec)).toBe(true);
  });

  it("is a no-op when not eligible", () => {
    const s = createInitialState();
    expect(prestige(s)).toBe(s);
  });

  describe("ship modes (GDD §4 flavored choice)", () => {
    const eligible = () => {
      const s = createInitialState();
      s.research = [balance.prestige.capabilityResearch];
      s.lifetimeMoney = Big.of(1e8); // base gain = 100
      s.products.frontier = 12;
      return s;
    };

    it("defaults to deploy = the historical behavior (keeps a product draft, no cash)", () => {
      const s = eligible();
      const def = prestige(s);
      const deploy = prestige(s, "deploy");
      expect(def.prestige.legacyWeights.eq(deploy.prestige.legacyWeights)).toBe(true);
      expect(def.products.drafts.length).toBe(1); // flagship banked as a draft
      expect(def.resources.money.eq(0)).toBe(true);
      expect(def.prestige.legacyWeights.eq(legacyWeightsGain(s))).toBe(true);
    });

    it("open-source banks more Legacy but leaves no product draft", () => {
      const s = eligible();
      const deploy = prestige(s, "deploy");
      const os = prestige(s, "open_source");
      expect(os.prestige.legacyWeights.gt(deploy.prestige.legacyWeights)).toBe(true);
      expect(os.products.drafts.length).toBe(0);
      expect(legacyWeightsForMode(s, "open_source").gt(legacyWeightsForMode(s, "deploy"))).toBe(true);
    });

    it("hard ship banks more Legacy but leaps the frontier (products start behind)", () => {
      const s = eligible();
      s.prestige.ships = 3; // hard mode is unlocked
      const deploy = prestige(s, "deploy");
      const hard = prestige(s, "hard");
      expect(hard.prestige.legacyWeights.gt(deploy.prestige.legacyWeights)).toBe(true);
      expect(hard.products.frontier).toBeGreaterThan(deploy.products.frontier);
      expect(hard.products.drafts.length).toBe(1); // still keeps the draft
    });

    it("sell banks less Legacy, hands over cash, and leaves no draft", () => {
      const s = eligible();
      const deploy = prestige(s, "deploy");
      const sell = prestige(s, "sell");
      expect(sell.prestige.legacyWeights.lt(deploy.prestige.legacyWeights)).toBe(true);
      expect(sell.resources.money.gt(0)).toBe(true);
      expect(sell.products.drafts.length).toBe(0);
    });
  });
});

describe("offline progress", () => {
  it("accrues resources for elapsed time and summarizes the gain", () => {
    const s = createInitialState();
    const { state, summary } = applyOffline(s, 10_000);
    expect(state.resources.compute.gt(0)).toBe(true);
    expect(summary.gained.compute.gt(0)).toBe(true);
    expect(summary.capped).toBe(false);
  });

  it("clamps the offline window to the cap (reward, not exploit)", () => {
    const s = createInitialState();
    const tenDaysMs = 10 * 24 * 3600 * 1000;
    const { summary } = applyOffline(s, tenDaysMs);
    expect(summary.capped).toBe(true);
    expect(summary.appliedMs).toBe(balance.offline.maxHours * 3600 * 1000);
  });

  it("honors a larger offline cap (the premium QoL perk)", () => {
    const s = createInitialState();
    const tenDaysMs = 10 * 24 * 3600 * 1000;
    const { summary } = applyOffline(s, tenDaysMs, balance.offline.premiumMaxHours);
    expect(summary.appliedMs).toBe(balance.offline.premiumMaxHours * 3600 * 1000);
    expect(balance.offline.premiumMaxHours).toBeGreaterThan(balance.offline.maxHours);
  });
});
