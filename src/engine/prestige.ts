import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { createInitialState } from "./state";
import type { GameState } from "./types";

/**
 * "Ship the Model" — the retention engine (GDD §4). Reset the run, keep Legacy
 * Weights as a permanent global multiplier. The first ship must land while the
 * player is still engaged, so the requirement/formula live in balance and get
 * tuned against the sim, never hand-guessed.
 */

/** Can the player ship yet? Gated on lifetime Money this run. */
export function canPrestige(state: GameState): boolean {
  return state.lifetimeMoney.gte(balance.prestige.requirement);
}

/** Legacy Weights that shipping right now would grant: floor((money/scale)^exp). */
export function legacyWeightsGain(state: GameState): Big {
  if (state.lifetimeMoney.lt(balance.prestige.requirement)) return Big.ZERO;
  const ratio = state.lifetimeMoney.div(balance.prestige.scale).toNumber();
  return Big.of(Math.floor(Math.pow(ratio, balance.prestige.exponent)));
}

/**
 * Perform the ship: reset Compute/Data/Money, racks, and research; carry over
 * Legacy Weights (added to existing) and ship count. Cosmetics/achievements
 * would persist here too (stubbed for Phase 0). No-op if not yet eligible.
 */
export function prestige(state: GameState): GameState {
  if (!canPrestige(state)) return state;
  const gained = legacyWeightsGain(state);
  const fresh = createInitialState();
  return {
    ...fresh,
    prestige: {
      legacyWeights: state.prestige.legacyWeights.add(gained),
      ships: state.prestige.ships + 1,
    },
  };
}
