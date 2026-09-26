import { describe, it, expect } from "vitest";
import { giveAwayTerms } from "./PrestigePanel";
import { createInitialState } from "../engine/state";
import { prestige, legacyWeightsForMode } from "../engine/prestige";
import { fmt, fmtMoney } from "./format";
import { Big } from "../engine/math/Big";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";

/**
 * The give-away confirm ("Sell to a hyperscaler — give the model away?") lists what the
 * player gets "in exchange". For Sell it said only "+10 Legacy weights": the cash that
 * is the whole point of selling (the chooser card shows "+ $1200 cash") was missing from
 * the one sheet that asks the player to commit (r4 bug hunt, journeys gens 3–8). The
 * terms are read from the same numbers prestige() applies.
 */
function readyToShip(ships: number): GameState {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.stats.totalShips = ships;
  s.research = balance.research.map((r) => r.id);
  s.lifetimeMoney = Big.of(1e9);
  return s;
}

describe("the give-away confirm names every reward", () => {
  it("Sell names the cash the fresh lab starts with", () => {
    for (const ships of [0, 3, 5, 8]) {
      const s = readyToShip(ships);
      const cash = prestige(s, "sell").resources.money;
      expect(cash.gt(0)).toBe(true);
      const terms = giveAwayTerms(s, "sell");
      expect(terms, `ships ${ships}`).toContain(`+${fmtMoney(cash)} cash`);
      expect(terms).toContain(`+${fmt(legacyWeightsForMode(s, "sell"))} Legacy weights`);
    }
  });

  it("Open-source names its Reputation and momentum, and no cash it does not pay", () => {
    const s = readyToShip(5);
    const terms = giveAwayTerms(s, "open_source");
    expect(terms).toContain(`+${balance.prestige.shipModes.open_source.reputationBonus} Reputation`);
    expect(terms).toContain("momentum");
    expect(terms).not.toContain("cash");
    expect(prestige(s, "open_source").resources.money.eq(0)).toBe(true);
  });
});
