import { describe, it, expect } from "vitest";
import { canPrestige, legacyWeightsGain, prestige } from "./prestige";
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
    s.lifetimeMoney = Big.of(1e8); // (1e8/1e4)^0.5 = sqrt(1e4) = 100
    expect(legacyWeightsGain(s).eq(Big.of(100))).toBe(true);
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
