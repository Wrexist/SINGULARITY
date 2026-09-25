import { describe, it, expect } from "vitest";
import { launchDraft, setProductPrice, setEnterprise, setEnterprisePrice, productMetrics, settledMrr, milestoneValue } from "./products";
import { tick } from "./tick";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { products as B } from "./balance/products";
import type { GameState } from "./types";

/**
 * The revenue ladders can't be pumped by a one-frame dial flick (r3 bug hunt). Price
 * and Enterprise dials move ARPU instantly while the paying count drifts (~5%/s), so
 * a single 100 ms tick at maxed dials recorded a peakMrr ~3.8× the settled revenue —
 * clearing $/s milestones, contracts, objectives and achievements the product can't
 * hold — and the player flicked back at no cost. The ladders now read settledMrr.
 */
function matureProduct(): GameState {
  let s = createInitialState();
  s.prestige.ships = B.enterprise.unlockShips + 1;
  s.products.drafts = [{ id: "draft-1", quality: 20, ships: 1 }];
  s = launchDraft(s, { draftId: "draft-1", type: "code", name: "Coder", id: "prod-1" });
  s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, mau: 400_000, ageSec: 2 * B.retireMaturitySec })) } };
  for (let i = 0; i < 600; i++) s = tick(s, 1000); // settled at the default dials
  return s;
}
const flick = (s: GameState) => setEnterprisePrice(setEnterprise(setProductPrice(s, "prod-1", B.priceMax), "prod-1", true), "prod-1", B.enterprise.priceMax);

describe("revenue ladders read settled revenue", () => {
  it("a settled product reads its live revenue exactly", () => {
    const s = matureProduct();
    const p = s.products.active[0]!;
    const mods = derive(s).productModsById[p.id];
    expect(settledMrr(p, s.products.frontier, mods)).toBeCloseTo(productMetrics(p, s.products.frontier, mods).mrr, 6);
  });

  it("a one-frame dial flick records no more than those dials can sustain", () => {
    const s = matureProduct();
    // What the pumped dials really earn once the paying count settles to them.
    let sustained = flick(s);
    for (let i = 0; i < 300; i++) sustained = tick(sustained, 1000);
    const hold = sustained.stats.peakMrr;

    const flicked = tick(flick(s), 100);
    const live = productMetrics(flicked.products.active[0]!, flicked.products.frontier, derive(flicked).productModsById["prod-1"]).mrr;
    expect(live).toBeGreaterThan(hold * 1.3); // the instantaneous figure spikes past it…
    expect(flicked.stats.peakMrr).toBeLessThanOrEqual(hold * 1.02); // …the ladder doesn't
    expect(milestoneValue(flicked, "mrr")).toBeLessThanOrEqual(hold * 1.02);
  });

  it("dials the product can sustain still raise the ladder once it settles to them", () => {
    let s = flick(matureProduct());
    const before = s.stats.peakMrr;
    for (let i = 0; i < 300; i++) s = tick(s, 1000);
    expect(s.stats.peakMrr).toBeGreaterThan(before * 1.2);
  });
});
