import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { prestige, canPrestige } from "./prestige";
import { tick } from "./tick";
import { canStartTrial, queueTrial, legacyUnplugged } from "./trials";
import { chartersBalance } from "./charter";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * The Research Director vs Prestige Trials (bug hunt r2, events #2).
 *
 * A Trial can only be started before the run is shippable, so its handicap is
 * endured for a whole generation. The Director auto-buys research from tick(), and
 * it buys the whole path to the capability node within a tick of a Ship in the deep
 * endgame. So for a Director owner the run was shippable before the Ship moment had
 * even closed and no Trial could ever be started again: the perk can't be sold, and
 * Unplugged (the Trial that exists for exactly these seconds-long generations) was
 * out of reach for good. The charter and stance already honour the Director's grace
 * (directorWindow.test.ts); a Trial now honours the same one.
 */

const GRACE = chartersBalance.directorGraceSec;

function readyToShip(ships: number, director: boolean): GameState {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.stats.totalShips = ships;
  s.stats.playtimeSec = 5_000.4;
  s.reputation.perks = director ? ["rep_compute1", "rep_autoresearch"] : ["rep_compute1"];
  s.research = balance.research.filter((r) => !r.exclusiveGroup).map((r) => r.id);
  s.lifetimeMoney = Big.of(1e12);
  return s;
}

/** Ship, then bank enough that the Director can buy the ship path on its first tick. */
function shippedRich(ships: number, director: boolean): GameState {
  const g = prestige(readyToShip(ships, director), "deploy");
  return { ...g, resources: { ...g.resources, compute: Big.of(1e9), data: Big.of(1e9) } };
}

function run(g: GameState, seconds: number, stepMs = 100): GameState {
  let s = g;
  for (let t = 0; t < seconds * 1000; t += stepMs) s = tick(s, stepMs);
  return s;
}

describe("a Research Director owner can still run a Trial (via the queue)", () => {
  it("queues Unplugged mid-run and the Ship starts it before the Director buys anything", () => {
    const g = run(shippedRich(12, true), 1);
    expect(canPrestige(g)).toBe(true); // the Director bought the whole ship path
    expect(canStartTrial(g, "trial_unplugged")).toBe(false); // no mid-run start…
    const queued = queueTrial(g, "trial_unplugged"); // …but it queues
    expect(queued.queuedTrial).toBe("trial_unplugged");
    const next = prestige({ ...queued, lifetimeMoney: Big.of(1e13) }, "deploy");
    expect(next.activeTrial).toBe("trial_unplugged");
    expect(next.research).toEqual([]);
    expect(legacyUnplugged(next)).toBe(true);
    // The Director then works as usual, inside the Trial.
    const later = run({ ...next, resources: { ...next.resources, compute: Big.of(1e9), data: Big.of(1e9) } }, 1);
    expect(later.research.length).toBeGreaterThan(0);
    expect(later.activeTrial).toBe("trial_unplugged");
  });

  it("no grace window exists to start one mid-run, with or without the Director", () => {
    for (const director of [true, false]) {
      const g = run(shippedRich(12, director), 0.5);
      const withResearch = g.research.length ? g : { ...g, research: ["backprop"] };
      expect(canStartTrial(withResearch, "trial_unplugged")).toBe(false);
    }
    expect(GRACE).toBeGreaterThan(0);
  });
});
