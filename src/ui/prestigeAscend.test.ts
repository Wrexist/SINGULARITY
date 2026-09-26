import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrestigePanel } from "./PrestigePanel";
import { createInitialState } from "../engine/state";
import { prestige, shipWouldAscend, type ShipMode } from "../engine/prestige";
import { Big } from "../engine/math/Big";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";

/**
 * The "Ascend" promise on the Ship panel (bug hunt, meta r1 #1). It used to be
 * predicted from the deploy-mode BASE gain, while prestige() ascends on what the
 * chosen mode actually banks (mode multiplier × charter conviction). Near the Legacy
 * floor the panel then promised an ascension that Sell didn't deliver, or hid one
 * that Open-source / Hard would have.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(PrestigePanel, {
    game,
    onPrestige: noop,
    onBuyReputationPerk: noop,
    onBuyEndowment: noop,
    onPickDirective: noop,
    onBuyLegacyPerk: noop,
  }));

const AGI = balance.eras.agiAtShips;
const ASCEND_BUTTON = "✦ Ascend — choose how to ship";

/** A lab ready to ship with a base gain of 126 weights. `ships` = models shipped so
 *  far: AGI − 1 is the first crossing (no AGI banner yet); AGI + 2 shows the banner. */
function nearFloor(totalLegacy: number, ships = AGI - 1): GameState {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.stats.totalShips = ships;
  s.research = balance.research.map((r) => r.id);
  s.stats.totalLegacy = Big.of(totalLegacy);
  s.lifetimeMoney = Big.of(1.6e9);
  return s;
}

const unlockedModes = (s: GameState) =>
  Object.values(balance.prestige.shipModes).filter((m) => s.prestige.ships >= m.unlockShips).map((m) => m.id as ShipMode);
const ascends = (s: GameState, mode: ShipMode) => prestige(s, mode).stats.ascensions > s.stats.ascensions;

describe("shipWouldAscend is prestige()'s own gate", () => {
  it("agrees with the ship for every mode, across the floor, with and without conviction", () => {
    for (const ships of [1, AGI - 2, AGI - 1, AGI, AGI + 5]) {
      for (const legacy of [0, 1000, 1800, 1850, 1880, 1900, 1937, 1950, 1990, 2000, 5000]) {
        for (const streak of [null, 1, 2, 3]) {
          const s = nearFloor(legacy, ships);
          if (streak !== null) { s.charter = "moonshot"; s.lastCharter = "moonshot"; s.charterStreak = streak; }
          for (const mode of unlockedModes(s)) expect(shipWouldAscend(s, mode)).toBe(ascends(s, mode));
        }
      }
    }
  });

  it("is false while the lab can't ship at all", () => {
    const s = nearFloor(5000, AGI + 2);
    s.research = [];
    expect(shipWouldAscend(s, "deploy")).toBe(false);
  });
});

describe("Ship panel ascension promise", () => {
  it("does not promise an ascension that a ship mode would not deliver", () => {
    const s = nearFloor(1900);
    const modes = unlockedModes(s);
    // The setup really is split: Sell (×0.5) falls short, the others clear the floor.
    expect(ascends(s, "sell")).toBe(false);
    expect(ascends(s, "deploy")).toBe(true);
    expect(modes.some((m) => !ascends(s, m))).toBe(true);
    expect(render(s)).not.toContain(ASCEND_BUTTON);
  });

  it("promises it when every way to ship ascends", () => {
    const s = nearFloor(1990);
    expect(unlockedModes(s).every((m) => ascends(s, m))).toBe(true);
    expect(render(s)).toContain(ASCEND_BUTTON);
    expect(render(nearFloor(1990, AGI + 2))).toContain("next ship ascends");
  });

  it("says a split ship CAN ascend, including one the base gain alone would miss", () => {
    // Base gain 126 from 1850 lands at 1976 — the old deploy-only prediction said
    // "no", yet Open-source (163) and Hard (189) both ascend.
    const s = nearFloor(1850, AGI + 2);
    expect(ascends(s, "open_source")).toBe(true);
    expect(ascends(s, "deploy")).toBe(false);
    const html = render(s);
    expect(html).toContain("next ship can ascend");
    expect(html).not.toContain("next ship ascends");
    expect(html).not.toContain(ASCEND_BUTTON);
  });

  it("counts charter conviction, which the base-gain prediction left out", () => {
    // No mode clears 2,000 from 1,800 on its own; the top conviction rung (×1.4)
    // carries Open-source and Hard over.
    const plain = nearFloor(1800, AGI + 2);
    expect(unlockedModes(plain).some((m) => ascends(plain, m))).toBe(false);
    expect(render(plain)).not.toContain("next ship can ascend");
    const s = nearFloor(1800, AGI + 2);
    s.charter = "moonshot";
    s.lastCharter = "moonshot";
    s.charterStreak = 3;
    expect(ascends(s, "hard")).toBe(true);
    expect(render(s)).toContain("next ship can ascend");
  });

  it("stays quiet when no way to ship ascends", () => {
    const s = nearFloor(1000);
    expect(unlockedModes(s).some((m) => ascends(s, m))).toBe(false);
    const html = render(s);
    expect(html).not.toContain(ASCEND_BUTTON);
    expect(html).not.toContain("can ascend");
  });
});
