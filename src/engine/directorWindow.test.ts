import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { tick } from "./tick";
import { canSetCharter, setCharter, charterHand, chartersBalance, startWindowOpen } from "./charter";
import { stanceOpen, declareStance, canClaimDoctrine, doctrineBalance } from "./doctrine";
import { buyResearch } from "./actions";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * The Research Director vs the start-of-run window (bug hunt, meta r1 #0).
 *
 * The Director auto-buys research from tick(), and the start-of-run window (Lab
 * Charter + Stance) used to close at the first research node. So a Director owner
 * lost both picks within a fraction of a second of shipping — while the "Model
 * Shipped" celebration was still on screen. The rule now: for a Director owner the
 * window stays open for the first `directorGraceSec` seconds of engine run time
 * (playtime since this run's ship), whatever the Director buys; the Director itself
 * never waits, so a player who ignores charters loses nothing.
 */

const GRACE = chartersBalance.directorGraceSec;

/** A lab ready to ship, `ships` generations in, optionally owning the Director. */
function readyToShip(ships: number, director: boolean): GameState {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.stats.totalShips = ships;
  s.stats.playtimeSec = 5_000.4; // a real career: the run clock is measured from here
  s.reputation.perks = director ? ["rep_compute1", "rep_autoresearch", "rep_startrack"] : ["rep_compute1", "rep_startrack"];
  s.research = balance.research.filter((r) => !r.exclusiveGroup).map((r) => r.id);
  s.lifetimeMoney = Big.of(1e12);
  return s;
}

/** Ship, then hand the fresh run enough banked Compute/Data that the Director can
 *  buy on its very first tick (the deep-endgame case, where it did so in 0.2 s). */
function shippedRich(ships: number, director: boolean): GameState {
  const g = prestige(readyToShip(ships, director), "deploy");
  return { ...g, resources: { ...g.resources, compute: Big.of(1e9), data: Big.of(1e9) } };
}

function run(g: GameState, seconds: number, stepMs = 100): GameState {
  let s = g;
  for (let t = 0; t < seconds * 1000; t += stepMs) s = tick(s, stepMs);
  return s;
}

describe("Research Director keeps the start-of-run window open", () => {
  it("the charter and stance stay pickable while the Director researches", () => {
    const g = run(shippedRich(doctrineBalance.revealAtShips + 5, true), 5);
    // The Director did its job — no stall…
    expect(g.research.length).toBeGreaterThan(0);
    // …and the player can still make both start-of-run picks.
    expect(canSetCharter(g)).toBe(true);
    expect(stanceOpen(g)).toBe(true);
    const pick = charterHand(g)[0]!;
    const picked = declareStance(setCharter(g, pick), "doomer");
    expect(picked.charter).toBe(pick);
    expect(picked.alignment).toBe(-doctrineBalance.threshold);
  });

  it("the window closes once the grace runs out, and claims then open", () => {
    let g = run(shippedRich(doctrineBalance.revealAtShips + 5, true), 2);
    g = declareStance(g, "doomer");
    const first = doctrineBalance.perks.find((p) => p.side === "doomer" && !p.requires)!;
    expect(canClaimDoctrine(g, first.id)).toBe(false); // claims wait for the close
    g = run(g, GRACE); // well past the grace (2 s + GRACE)
    expect(startWindowOpen(g)).toBe(false);
    expect(canSetCharter(g)).toBe(false);
    expect(stanceOpen(g)).toBe(false);
    expect(canClaimDoctrine(g, first.id)).toBe(true);
  });

  it("a charter-ignoring player gets every node the Director can afford, on the same tick", () => {
    // Half two of the rule: the Director never waits for a pick. With the same
    // bank, a Director run and a charter-less run buy the same research on tick 1.
    const fresh = shippedRich(8, true);
    const g = tick(fresh, 100);
    expect(g.research.length).toBeGreaterThan(0);
    expect(g.charter).toBeNull();
    expect(canSetCharter(g)).toBe(true); // the purchase did not close the window
    // Identical to a run whose window was already locked: the grace never delays it.
    const locked = tick({ ...fresh, charterLocked: true }, 100);
    expect(g.research).toEqual(locked.research);
  });

  it("without the Director the window still closes at the first research (unchanged)", () => {
    const g = shippedRich(8, false);
    expect(canSetCharter(g)).toBe(true);
    const bought = buyResearch(g, "backprop");
    expect(bought.research).toContain("backprop");
    expect(canSetCharter(bought)).toBe(false);
  });

  it("an unreadable run clock (no ship stamp, or a stamp in the future) grants no grace", () => {
    const g = tick(shippedRich(8, true), 100);
    expect(g.research.length).toBeGreaterThan(0);
    // A pre-v35 ship log has no atSec: nothing to measure from → the old rule.
    const noStamp = { ...g, shipLog: g.shipLog.map(({ atSec: _drop, ...e }) => e) };
    expect(canSetCharter(noStamp)).toBe(false);
    // A hostile stamp ahead of the clock must not hold the window open forever.
    const future = { ...g, shipLog: g.shipLog.map((e) => ({ ...e, atSec: 1e12 })) };
    expect(canSetCharter(future)).toBe(false);
    // A stamp from a different generation (log/ship count disagree) is not trusted.
    const stale = { ...g, prestige: { ...g.prestige, ships: g.prestige.ships + 1 } };
    expect(canSetCharter(stale)).toBe(false);
  });
});
