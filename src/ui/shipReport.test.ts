import { describe, it, expect } from "vitest";
import { shipReportFor } from "./Celebration";
import { runStory, shipSubtitle, shipHeadline } from "./headlines";
import { prestige } from "../engine/prestige";
import { createInitialState } from "../engine/state";
import { marketLeaderboard, playerMarketRank } from "../engine/market";
import { market as M } from "../engine/balance/market";
import { currentEra } from "../engine/eras";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState, ProductState } from "../engine/types";

/**
 * The Generation Report (Ship celebration + share card) describes the run that was
 * just shipped, but App built it from the state AFTER prestige(): alignment is back
 * to 0 there, the press-blitz strikes are cleared, and the era is counted from the
 * new ship total. So every report said "Played it down the middle, ideologically
 * uncommitted", the stance subtitles never showed, a rank won with a blitz slid back,
 * and an era-crossing ship claimed the NEXT generation's era (bug hunt r2).
 */

const product = (mau: number): ProductState => ({
  id: "p1", type: "general", name: "Oracle", quality: 10, version: 2, mau, paid: mau / 50,
  priceMult: 1, marketingPerSec: 0, buzzSec: 0, features: [], enterprise: false,
  enterprisePrice: 1, channelMix: {}, ageSec: 1e6, upgrade: null,
});

/** A ship-eligible lab on its 2nd generation (Scale-Up), committed to one stance. */
function readyLab(alignment: number): GameState {
  const s = createInitialState();
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e9);
  s.prestige = { ...s.prestige, ships: balance.eras.frontierAtShips - 1 };
  s.alignment = alignment;
  return s;
}

describe("Generation Report reads the run that was shipped", () => {
  it("keeps the run's stance: a Safety run is not reported as 'down the middle'", () => {
    const shipped = prestige(readyLab(-0.8), "deploy");
    expect(shipped.alignment).toBe(0); // the reset itself — the report must not read this
    const report = shipReportFor(shipped);
    expect(report.alignment).toBe(-0.8);
    expect(runStory(report)).toContain("Held the line on safety — the cautious path, taken on purpose.");
    expect(shipSubtitle(report)).toBe("The safety team sleeps easy tonight. You banked:");

    const accel = shipReportFor(prestige(readyLab(0.7), "deploy"));
    expect(runStory(accel)).toContain("Went all gas, no brakes — acceleration above all.");
  });

  it("reports the era the generation reached, not the one the ship count opens next", () => {
    const lab = readyLab(0);
    const before = currentEra(lab);
    const shipped = prestige(lab, "deploy");
    expect(currentEra(shipped)).toBeGreaterThan(before); // this ship crosses an era line
    const report = shipReportFor(shipped);
    expect(report.era).toBe(before);
    // …which is also what the Archive records for the same generation.
    expect(shipped.shipLog[shipped.shipLog.length - 1]!.era).toBe(report.era);
  });

  it("reports the market rank the lab shipped at, even when a blitz won it", () => {
    const lab = readyLab(0);
    const rivals = marketLeaderboard(lab).filter((e) => !e.isYou);
    const top = Math.max(...rivals.map((r) => r.users));
    // Just behind the leader…
    lab.products = { ...lab.products, active: [product(top * 0.95)] };
    expect(playerMarketRank(lab)).toBeGreaterThan(1);
    // …then blitz everyone ahead to take #1 before shipping.
    lab.rivalOps = {
      strikes: Object.fromEntries(rivals.filter((r) => r.users >= top * 0.95).map((r) => [r.name, M.counterplay.maxStrikesPerRival])),
      lastStrikeSec: null,
    };
    expect(playerMarketRank(lab)).toBe(1);

    const shipped = prestige(lab, "deploy");
    expect(playerMarketRank(shipped)).toBeGreaterThan(1); // strikes cleared by the reset
    const report = shipReportFor(shipped);
    expect(report.rank).toBe(1);
    expect(shipHeadline(report)).toBe("Market Leader — You're #1");
  });

  it("falls back to the live state when there is no snapshot", () => {
    const s = createInitialState();
    const report = shipReportFor(s);
    expect(report.rank).toBeNull();
    expect(report.era).toBe(currentEra(s));
    expect(report.peakCompute.eq(s.stats.peakComputePerSec)).toBe(true);
  });
});
