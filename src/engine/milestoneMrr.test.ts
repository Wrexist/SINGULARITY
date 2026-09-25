import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { productMetrics, milestoneValue } from "./products";
import { goalCandidates } from "./goals";
import type { GameState, ProductState } from "./types";

/**
 * Product Milestones must measure revenue the way everything else does (bug hunt r2,
 * events #5). The "$1K/s total revenue" rung read each product's BARE revenue, while
 * the product cards, the sponsor/contract ladder and the "Recurring Revenue — hit
 * $1K/s total revenue" achievement all read it with its ARPU buffs (Sales staff, the
 * Product Company charter's ×2.5). A lab billing $1.5K/s on its cards earned the
 * achievement but not the milestone, the goal strip showed the rung at 60%, and the
 * milestone's cash reward never landed until bare revenue alone caught up.
 */

function labWithProduct(): GameState {
  const s = createInitialState();
  s.prestige.ships = 8;
  s.stats.totalShips = 8;
  const p: ProductState = {
    id: "prod-1", name: "Nimbus", type: "general", version: 3, quality: s.products.frontier,
    priceMult: 1, enterprise: false, enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 },
    mau: 1e7, paid: 0, buzzSec: 0, ageSec: 5_000, upgrade: null, features: [],
  };
  // Size the paying base so BARE revenue is $600/s: below the $1K/s rung on its own.
  const perPaid = productMetrics({ ...p, paid: 1 }, s.products.frontier).mrr;
  p.paid = 600 / perPaid;
  s.products = { ...s.products, active: [p] };
  // Product Company: every product's ARPU ×2.5, so the cards read $1.5K/s.
  s.charter = "product_company";
  return s;
}

const shownMrr = (s: GameState) => {
  const mods = derive(s).productModsById;
  return s.products.active.reduce((sum, p) => sum + productMetrics(p, s.products.frontier, mods[p.id]).mrr, 0);
};

describe("milestone revenue matches the revenue the lab earns", () => {
  it("milestoneValue('mrr') is the buffed revenue the product cards show", () => {
    const s = labWithProduct();
    expect(shownMrr(s)).toBeCloseTo(1500, 6);
    expect(milestoneValue(s, "mrr")).toBeCloseTo(shownMrr(s), 6);
  });

  it("the $1K/s milestone lands on the same tick as the $1K/s achievement", () => {
    const g = tick(labWithProduct(), 100);
    expect(g.achievements).toContain("mrr_1k"); // "Recurring Revenue — Hit $1K/s total revenue"
    expect(g.products.milestones).toContain("mrr_1k"); // "Ramen Profitable — $1K/s total revenue"
  });

  it("the goal strip doesn't offer a revenue rung the lab has already passed", () => {
    const s = labWithProduct();
    const rung = goalCandidates(s).find((g) => g.kind === "milestone" && g.desc === "$1K/s total revenue");
    expect(rung).toBeUndefined();
  });
});
