import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { maybeProductEvent, typeDef } from "./products";
import { products as B, productFeatures } from "./balance/products";
import type { GameState, ProductState } from "./types";

/**
 * Trust & Safety (bug hunt r7, goal copy parity). The feature sells for $180K as
 * "Moderation & compliance → much less Regulatory Heat" with a "−50% heat" pill, and
 * it is offered on every product. It only scaled the product TYPE's steady Heat, which
 * is zero for five of the eight types (General, Code, Reasoning, Multimodal, Fast API),
 * so on those it bought nothing at all; and the Heat a product really does raise — a
 * data breach, a jailbreak, a hallucination in front of a journalist — ignored it on
 * every type. A moderation and compliance team cuts exactly that Heat now.
 */

const TRUST = productFeatures.find((f) => f.lane === "heat")!;
const eventIndex = (id: string) => B.events.list.findIndex((e) => e.id === id);
const rollFor = (id: string) => (eventIndex(id) + 0.5) / B.events.list.length;

function lab(features: string[]): GameState {
  const s = createInitialState();
  s.prestige.ships = 3;
  const p: ProductState = {
    id: "prod-1", name: "Nimbus", type: "general", version: 2, quality: s.products.frontier,
    priceMult: 1, enterprise: false, enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 },
    mau: 1e6, paid: 1e4, buzzSec: 0, ageSec: 5_000, upgrade: null, features,
  };
  s.products = { ...s.products, active: [p] };
  s.heat = 10;
  return s;
}

describe("Trust & Safety cuts the Heat a product's incidents raise", () => {
  it("the General Assistant has no steady Heat for the feature to cut (the premise)", () => {
    expect(typeDef("general").heatPerSec).toBe(0);
  });

  for (const id of ["breach", "jailbreak", "hallucination"]) {
    it(`${id}: half the Heat with Trust & Safety, full Heat without`, () => {
      const ev = B.events.list[eventIndex(id)]!;
      const plain = maybeProductEvent(lab([]), 10, 0, 0, rollFor(id))!;
      const safe = maybeProductEvent(lab([TRUST.id]), 10, 0, 0, rollFor(id))!;
      expect(plain.state.heat).toBeCloseTo(10 + ev.heat!, 9);
      expect(safe.state.heat).toBeCloseTo(10 + ev.heat! * TRUST.factor, 9);
    });
  }

  it("still clamps to the Heat ceiling", () => {
    const s = { ...lab([TRUST.id]), heat: 99 };
    const r = maybeProductEvent(s, 10, 0, 0, rollFor("breach"))!;
    expect(r.state.heat).toBeLessThanOrEqual(100);
  });
});
