import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * The Regulator (Depth B3) — pure helpers over `state.suspicion`, the named
 * bureaucrat's long memory. No clock, no RNG. Suspicion rises with shady buys,
 * persists across prestige, and escalates regulatory scrutiny; lobbying appeases.
 * Curve-safe: a clean lab (and the balance sim) keeps suspicion at 0 → every helper
 * is identity (mult 1, tier 0, no name on events).
 */

const R = balance.regulator;

export interface RegulatorState {
  name: string;
  /** Tier index (0 = Unwatched … 3 = Personal vendetta). */
  index: number;
  label: string;
  blurb: string;
}

/** The regulator's current standing toward the player. Pure. */
export function regulatorState(state: GameState): RegulatorState {
  let index = 0;
  for (let i = 0; i < R.tiers.length; i++) if (state.suspicion >= R.tiers[i]!.at) index = i;
  const t = R.tiers[index]!;
  return { name: R.name, index, label: t.label, blurb: t.blurb };
}

/** Multiplier on the per-second regulatory-event chance from scrutiny (1 at zero). */
export function suspicionEventMult(state: GameState): number {
  return 1 + (state.suspicion / R.max) * R.eventChanceBoostAtMax;
}

/** Has the regulator escalated to a named, personal presence? (Drives event flavor.) */
export function regulatorIsNamed(state: GameState): boolean {
  return regulatorState(state).index >= R.nameFromTier;
}

/** Add suspicion (clamped 0..max). Used at every shady-buy site. Pure. */
export function clampSuspicion(suspicion: number): number {
  return Math.max(0, Math.min(R.max, suspicion));
}

export function addSuspicion(state: GameState, amount: number): GameState {
  const suspicion = clampSuspicion(state.suspicion + amount);
  return suspicion === state.suspicion ? state : { ...state, suspicion };
}
