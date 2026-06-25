import { Big } from "./math/Big";
import type { GameState } from "./types";

export const SAVE_VERSION = 4;

/** A fresh lab: empty closet, a trickle of free Compute, nothing owned. */
export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    resources: {
      compute: Big.ZERO,
      data: Big.ZERO,
      money: Big.ZERO,
    },
    upgrades: {},
    research: [],
    run: { active: false, progress: 0, readyToClaim: false },
    prestige: { legacyWeights: Big.ZERO, ships: 0 },
    lifetimeMoney: Big.ZERO,
    heat: 0,
    modifiers: [],
    // Faction stance (Phase 2): −1 doomer … +1 accelerationist. Set by event choices.
    alignment: 0,
  };
}
