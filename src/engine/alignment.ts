import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Faction alignment effects. Alignment ∈ [−1 doomer … +1 accelerationist] is
 * shifted by faction-event choices. These pure helpers turn that scalar into
 * real, legible consequences. Every effect is 0/identity at neutral (alignment
 * 0) and scales linearly toward the extremes, so the tuned curve and the
 * balance sim (which never fires faction events → alignment stays 0) are
 * untouched. Data lives in `balance.alignment`.
 */

/** Lane multipliers from the current stance. Both 1.0 at neutral. */
export function alignmentProductionMods(state: GameState): { computeMult: number; moneyMult: number } {
  const cfg = balance.alignment;
  if (!cfg.enabled || state.alignment === 0) return { computeMult: 1, moneyMult: 1 };
  const accel = Math.max(0, state.alignment); // toward +1
  const doom = Math.max(0, -state.alignment); // toward −1
  return {
    computeMult: 1 + accel * cfg.accelComputeBonus - doom * cfg.doomerComputePenalty,
    moneyMult: 1 + doom * cfg.doomerMoneyBonus - accel * cfg.accelMoneyPenalty,
  };
}

/**
 * Heat-generation multiplier for shady buys. >1 toward accelerationist (you're
 * reckless and on every watchlist), <1 toward doomer (you keep it clean). 1 at
 * neutral. Interpolates linearly between the configured endpoints.
 */
export function alignmentHeatMult(state: GameState): number {
  const cfg = balance.alignment;
  if (!cfg.enabled || state.alignment === 0) return 1;
  return state.alignment >= 0
    ? 1 + state.alignment * (cfg.heatGenAtAccel - 1)
    : 1 + -state.alignment * (cfg.heatGenAtDoomer - 1);
}
