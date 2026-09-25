import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { applyWorldEvent } from "./actions";
import { maybeProductEvent, advanceUpgrades } from "./products";
import { products as B } from "./balance/products";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * A product's buzz wave (×3 viral acquisition, ×0.4 churn) comes from its launch, a new
 * version, a good ops event, or an industry-hype world event scaled by the type's hype
 * (a Multimodal Studio rides "AI Is Having A Moment" for 60 s × 1.5 = 90 s). The hype
 * event keeps the longer of the two waves, but a good ops event ("trending", "featured")
 * and a finished version SET the wave to the flat 45 s — so a good thing landing during
 * a hype wave cut it in half.
 */
function trendyLab(): GameState {
  const s = createInitialState();
  s.prestige.ships = 6;
  s.resources = { compute: Big.of(1e12), data: Big.of(1e12), money: Big.ZERO };
  s.products = {
    ...s.products,
    frontier: 10,
    active: [{
      id: "p1", name: "Studio", type: "multimodal", version: 2, quality: 10, priceMult: 1, enterprise: false,
      enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 }, mau: 200_000, paid: 10_000, buzzSec: 0,
      ageSec: 5_000, upgrade: null, features: [],
    }],
  };
  return s;
}

describe("a buzz wave is never cut short by more good news", () => {
  it("the hype event gives a trendy product a wave longer than a launch's", () => {
    const hyped = applyWorldEvent(trendyLab(), "industry_hype").state;
    expect(hyped.products.active[0]!.buzzSec).toBeGreaterThan(B.buzzDurationSec);
  });

  it("a good ops event during the hype wave keeps the longer wave", () => {
    const hyped = applyWorldEvent(trendyLab(), "industry_hype").state;
    const wave = hyped.products.active[0]!.buzzSec;
    // rollFire 0 → fires; rollEvent 0 → the first event, "trending" (good, arms buzz).
    const res = maybeProductEvent(hyped, 1, 0, 0, 0)!;
    expect(res.tone).toBe("good");
    expect(res.state.products.active[0]!.buzzSec).toBe(wave);
  });

  it("a version landing during the hype wave keeps the longer wave", () => {
    const hyped = applyWorldEvent(trendyLab(), "industry_hype").state;
    const wave = hyped.products.active[0]!.buzzSec;
    const ps = {
      ...hyped.products,
      active: [{ ...hyped.products.active[0]!, upgrade: { targetVersion: 3, remainingCompute: 0, remainingData: 0, remainingSec: 1, totalSec: 90 } }],
    };
    const done = advanceUpgrades(ps, 1e12, 1e12, 1);
    expect(done.completed).toHaveLength(1);
    expect(done.products.active[0]!.buzzSec).toBe(wave);
  });

  it("with no wave running, both still arm the standard buzz", () => {
    const s = trendyLab();
    expect(maybeProductEvent(s, 1, 0, 0, 0)!.state.products.active[0]!.buzzSec).toBe(B.buzzDurationSec);
    const ps = { ...s.products, active: [{ ...s.products.active[0]!, upgrade: { targetVersion: 3, remainingCompute: 0, remainingData: 0, remainingSec: 1, totalSec: 90 } }] };
    expect(advanceUpgrades(ps, 1e12, 1e12, 1).products.active[0]!.buzzSec).toBe(B.buzzDurationSec);
  });
});
