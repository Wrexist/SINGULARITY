import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductsPanel } from "./ProductsPanel";
import { fmtDur } from "./format";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { tick } from "../engine/tick";
import { productMilestones } from "../engine/balance/products";
import { Big } from "../engine/math/Big";
import type { Employee, GameState } from "../engine/types";

/**
 * ML Scientists speed a product's version research ("+12% version-research speed,
 * each"): advanceUpgrades moves an upgrade's timer by seconds × upgradeSpeed. Every
 * research countdown on screen — the product card, the product sheet (in flight and on
 * the Research button) and the Team panel's project row — printed the raw timer, as if
 * no one were assigned. With a staffed product the promised wait was ~2× the real one,
 * and assigning a scientist never moved the number it exists to move.
 */
const scientist = (i: number): Employee => ({
  id: `fx-ml-${i}`, name: `Sci ${i}`, roleId: "staff_ml", level: 3, trait: null, assignedProductId: "p1", training: null,
});

function staffedLab(): GameState {
  const s = createInitialState();
  s.prestige.ships = 6;
  s.resources = { compute: Big.of(1e15), data: Big.of(1e15), money: Big.ZERO };
  s.employees = [scientist(1), scientist(2), scientist(3), scientist(4)];
  s.products = {
    ...s.products,
    frontier: 10,
    milestones: productMilestones.map((m) => m.id),
    active: [{
      id: "p1", name: "Coder", type: "code", version: 3, quality: 10, priceMult: 1, enterprise: false,
      enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 }, mau: 0, paid: 0, buzzSec: 0,
      ageSec: 5_000, features: [],
      upgrade: { targetVersion: 4, remainingCompute: 0, remainingData: 0, remainingSec: 600, totalSec: 600 },
    }],
  };
  return s;
}

/** Real seconds of play until the upgrade lands. */
function realSecondsToFinish(s: GameState): number {
  let t = s;
  let secs = 0;
  while (t.products.active[0]!.upgrade && secs < 10_000) { t = tick(t, 1000); secs += 1; }
  return secs;
}

describe("version research countdowns at the product's research speed", () => {
  it("the scientists really do speed it up", () => {
    const s = staffedLab();
    expect(derive(s).productModsById.p1!.upgradeSpeed).toBeGreaterThan(1.5);
    expect(realSecondsToFinish(s)).toBeLessThan(600 / 1.5);
  });

  it("the product card counts down the real time left", () => {
    const s = staffedLab();
    const real = realSecondsToFinish(s);
    const html = renderToStaticMarkup(createElement(ProductsPanel, {
      game: s, derived: derive(s),
      onLaunchDraft: () => {}, onStartUpgrade: () => {}, onSetPrice: () => {}, onSetMarketing: () => {},
      onSetEnterprise: () => {}, onSetEnterprisePrice: () => {}, onSetChannelMix: () => {}, onBuyFeature: () => {},
      onRename: () => {}, onRetire: () => {}, onSetFlagship: () => {}, onCounterRival: () => {},
    }));
    const shown = /· ~([^<]*) left/.exec(html)?.[1];
    // Within a second of the real wait (the countdown rounds up to whole seconds).
    expect([fmtDur(real - 1), fmtDur(real)]).toContain(shown);
  });
});
