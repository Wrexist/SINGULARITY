import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UpgradePanel } from "./UpgradePanel";
import * as format from "./format";
import { effRate, fmtEta } from "./format";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { tick } from "../engine/tick";
import { upgradeCost } from "../engine/actions";
import { productMilestones } from "../engine/balance/products";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The Money/s rate on the resource bar and every money ETA in the Upgrade panel add the
 * live products' net margin. They priced it mods-blind — without staff buffs, Heat, and
 * the Product Company charter's ×2.5 product revenue — while tick() pays each product
 * with its mods. A Product Company lab whose one product earns about +$2.8K/s read as
 * losing about $2K/s: the bar showed no $/s at all and no money upgrade showed an ETA.
 */
function productCompanyLab(): GameState {
  const s = createInitialState();
  s.prestige.ships = 8;
  s.charter = "product_company";
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  s.upgrades = { rack_basic: 1 };
  // Every product milestone already banked, so the only Money moving is the product's.
  // `paid` sits at the steady state its dials settle to, so the margin holds still.
  s.products = {
    ...s.products,
    frontier: 10,
    milestones: productMilestones.map((m) => m.id),
    active: [{
      id: "p1", name: "Coder", type: "code", version: 1, quality: 10, priceMult: 1, enterprise: false,
      enterprisePrice: 1, marketingPerSec: 4_000, channelMix: { ads: 1 }, mau: 20_000, paid: 3_192, buzzSec: 0,
      ageSec: 5_000, upgrade: null, features: [],
    }],
  };
  return s;
}

/** Money/s tick() actually pays over one second of live 100ms frames. */
function paidPerSec(s: GameState): number {
  let t = s;
  for (let i = 0; i < 10; i++) t = tick(t, 100);
  return t.resources.money.sub(s.resources.money).toNumber();
}

describe("product margin in the money rate and ETAs", () => {
  it("the lab really earns from its product, with no other Money income", () => {
    const s = productCompanyLab();
    const d = derive(s);
    expect(d.passiveMoneyPerSec.eq(0)).toBe(true);
    expect(d.payrollPerSec.eq(0)).toBe(true);
    expect(paidPerSec(s)).toBeGreaterThan(500);
  });

  it("prices the portfolio the way tick() pays it", () => {
    const s = productCompanyLab();
    const helper = (format as Record<string, unknown>).productMarginPerSec as ((g: GameState, d: ReturnType<typeof derive>) => number) | undefined;
    expect(typeof helper).toBe("function");
    expect(helper!(s, derive(s)) / paidPerSec(s)).toBeCloseTo(1, 2);
  });

  it("the Upgrade panel shows a money ETA at the rate Money really climbs", () => {
    const s = productCompanyLab();
    const d = derive(s);
    const def = balance.upgrades.find((u) => u.id === "rack_basic")!;
    const cost = upgradeCost(def, s.upgrades[def.id] ?? 0);
    const rate = effRate(d, "money", s.computeFocus).add(Big.of(paidPerSec(s)));
    const want = fmtEta(cost, s.resources.money, rate);
    expect(want).not.toBeNull();
    const html = renderToStaticMarkup(createElement(UpgradePanel, { game: s, derived: d, onBuy: () => {}, onFoundWing: () => {} }));
    // The rack's card: its money cost, then its ETA.
    const card = html.slice(html.indexOf(`${def.name}`));
    const eta = /--money-ink\)">\$[^<]*<\/span>(?:<span class="cost-eta">([^<]*)<\/span>)?/.exec(card);
    expect(eta).not.toBeNull();
    expect(eta![1]).toBe(want);
  });
});
