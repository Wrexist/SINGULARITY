import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrestigePanel } from "./PrestigePanel";
import { createInitialState } from "../engine/state";
import { legacyWeightsGain } from "../engine/prestige";
import { Big } from "../engine/math/Big";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";

/**
 * "Progress to next Legacy Weight" once a ship banks trillions of weights (bug hunt r4,
 * number formatting). The bar is (lifetime − money at this weight) ÷ (money at the next
 * weight − money at this one). A weight's worth of money shrinks relative to the
 * lifetime figure as 2 ÷ weights, and Big keeps about fifteen significant digits, so
 * past ~1e13 weights per ship the difference is rounding noise and past ~1e15 the next
 * weight's threshold rounds onto this one's. The row then read 0%, 50% or 100% at
 * random — mostly "100%" with "You're close to your next weight — a little longer banks
 * more." shown for good. A lab that ships every quarter hour reaches this in about ten
 * hours of play.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(PrestigePanel, {
    game, onPrestige: noop, onBuyReputationPerk: noop, onBuyEndowment: noop, onPickDirective: noop, onBuyLegacyPerk: noop,
  }));

function readyToShip(lifetime: string): GameState {
  const s = createInitialState();
  s.prestige.ships = 30;
  s.stats.totalShips = 30;
  s.research = balance.research.map((r) => r.id);
  s.lifetimeMoney = Big.of(lifetime);
  return s;
}

const timingPct = (html: string) => /prestige-timing-next">(\d+)%/.exec(html)?.[1] ?? null;
const closeNoteShown = (html: string) => /<p class="prestige-timing-note"(?! style="visibility:hidden")/.test(html);

describe("the next-weight timing row past number precision", () => {
  it("does not pin at 100% saying the next weight is close", () => {
    for (const life of ["1e36", "1.13e36", "2.9e37", "1e40", "7.77e44"]) {
      const s = readyToShip(life);
      expect(legacyWeightsGain(s).gt(1e15)).toBe(true);
      const html = render(s);
      expect(timingPct(html)).not.toBe("100");
      expect(closeNoteShown(html)).toBe(false);
    }
  });

  it("still shows the row while one weight is a measurable step", () => {
    for (const life of ["1e12", "4.4e20", "1e26"]) {
      const html = render(readyToShip(life));
      expect(timingPct(html)).not.toBeNull();
    }
  });
});
