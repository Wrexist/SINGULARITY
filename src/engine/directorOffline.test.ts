import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { applyOffline } from "./offline";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * The Research Director buys research the moment it is affordable, and it runs inside
 * tick() "so it works offline too". But tick() only calls it at the END of a window,
 * and a catch-up is cut into 5-minute steps: offline, and on every resume, the Director
 * waited up to five minutes per purchase. Right after a Ship that is exactly when the
 * tree is cheap and each node compounds the next, so a Director owner who put the phone
 * down for five minutes came back with about 1% of the Money the app left open earned
 * (3% after ten minutes, 69% after half an hour).
 *
 * Research lands once a window ends, so tick() now cuts a long window where the
 * Director can next buy (see tickWithDirector).
 */

/** A deep-endgame lab the moment after a Ship: racks and Legacy, no research yet, and
 *  the Research Director owned. */
function freshShipWithDirector(): GameState {
  const s = createInitialState();
  return {
    ...s,
    upgrades: { ...s.upgrades, rack_basic: 60, rack_server: 40, rack_tpu: 30, expand_e: 4, expand_s: 4, auto_claim: 1, auto_train: 1 },
    prestige: { ...s.prestige, ships: 24, legacyWeights: Big.of(5000) },
    reputation: { ...s.reputation, perks: ["rep_autoresearch"] },
  };
}

/** The app left open: 10 Hz frames. */
function live(s: GameState, ms: number): GameState {
  for (let t = 0; t < ms; t += 100) s = tick(s, 100);
  return s;
}

const ratio = (a: Big, b: Big) => a.div(b.max(1)).toNumber();

describe("the Research Director buys on time in a long window", () => {
  it("a 5-minute resume buys research through the window, not at its end", () => {
    // Five minutes right after a Ship is the steepest stretch of the run: every node
    // compounds the next. A long window trains its runs in slices, not frame by frame,
    // so it stays a little behind the app left open here; it used to earn about 1%.
    const s = freshShipWithDirector();
    const resumed = tick(s, 5 * 60_000);
    const open = live(s, 5 * 60_000);
    expect(open.research.length - resumed.research.length).toBeLessThanOrEqual(1);
    expect(ratio(resumed.resources.money, open.resources.money)).toBeGreaterThan(0.6);
    expect(ratio(resumed.resources.money, open.resources.money)).toBeLessThan(1.1);
  });

  it("a 20-minute offline catch-up earns what the app left open earns", () => {
    const s = freshShipWithDirector();
    const off = applyOffline(s, 20 * 60_000).state;
    const open = live(s, 20 * 60_000);
    expect(off.research.length).toBe(open.research.length);
    for (const k of ["compute", "data", "money"] as const) {
      expect(ratio(off.resources[k], open.resources[k])).toBeGreaterThan(0.9);
      expect(ratio(off.resources[k], open.resources[k])).toBeLessThan(1.1);
    }
  });
});
