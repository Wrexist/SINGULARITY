import { describe, it, expect } from "vitest";
import { goalsCounts } from "./goalsCount";
import { createInitialState } from "../engine/state";
import { fundMegaproject, pickMandate, mandatePicksAvailable, megaprojectUnlocked } from "../engine/challenges";
import { challenges as C } from "../engine/balance/challenges";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Each completed Megaproject cycle mints a permanent Mandate pick (+12% to a lane),
 * and the reward stays dormant until the player chooses — the same shape as a forked
 * Grand Challenge. The fork gets a "decision" badge, opens the Grand Challenges fold
 * and counts toward the GOALS nav badge; the mandate got none of that. Complete a
 * cycle, leave the tab, and the pick waited behind a folded "9/9" with no signal
 * anywhere (bug hunt r4, played on a gen-40 save).
 */

/** A veteran lab with every Grand Challenge done (forks chosen), so the loop is open. */
function megaLab(): GameState {
  const s = createInitialState();
  const forks: Record<string, string> = {};
  for (const c of C.list) if (c.forks) forks[c.id] = c.forks[0]!.id;
  const rich = Big.of(1e40);
  return {
    ...s,
    prestige: { ...s.prestige, ships: 60 },
    stats: { ...s.stats, totalShips: 60 },
    challenges: { ...s.challenges, completed: C.list.map((c) => c.id), forks },
    resources: { compute: rich, data: rich, money: rich },
  };
}

describe("an unpicked Megaproject Mandate is a decision GOALS counts", () => {
  it("a completed cycle's pick lights the long-game badge until it is taken", () => {
    const lab = megaLab();
    expect(megaprojectUnlocked(lab)).toBe(true);
    // Nothing waiting before the cycle completes: a fundable loop is not a claimable.
    expect(goalsCounts(lab).long).toBe(0);

    const { state: done, justCompleted } = fundMegaproject(lab);
    expect(justCompleted).toBe(true);
    expect(mandatePicksAvailable(done)).toBe(1);
    const c = goalsCounts(done);
    expect(c.mandatePending).toBe(true);
    expect(c.long).toBe(1);
    expect(c.claimable).toBe(c.now + c.long);

    // Taking the pick clears it.
    const picked = pickMandate(done, C.megaproject.mandates.defs[0]!.id);
    expect(goalsCounts(picked).mandatePending).toBe(false);
    expect(goalsCounts(picked).long).toBe(0);
  });
});
