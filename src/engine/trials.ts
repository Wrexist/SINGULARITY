import { trials as T } from "./balance/trials";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Prestige Trials — pure helpers. Owned state is two fields: `activeTrial` (the id
 * modifying the current run, or null) and `trialsDone` (completed ids → permanent
 * rewards). Both are empty through the whole tuned game, so every fold here is
 * identity until the PLAYER opts in. See balance/trials.ts for the design + the
 * curve-safety argument.
 */

export { T as trialsBalance };

const BY_ID = new Map(T.list.map((d) => [d.id, d]));
/** Valid Trial ids — exported for the save sanitizer. */
export const TRIAL_IDS: Set<string> = new Set(T.list.map((d) => d.id));

/** A deployable model exists → the run is "shippable". Inlined (not imported from
 *  prestige) to keep this module free of any import cycle. */
function isShippable(state: GameState): boolean {
  return state.research.includes(balance.prestige.capabilityResearch);
}

/** True once ANY Trial is available (the earliest unlock is reached). */
export function trialsUnlocked(state: GameState): boolean {
  return T.enabled && state.prestige.ships >= Math.min(...T.list.map((t) => t.unlockShips));
}

export function trialDefs() {
  return T.list;
}

/** Can the player START this Trial right now? The key rule (anti-cheese): you may
 *  only commit BEFORE the run is shippable, so the handicap is endured for a full
 *  generation rather than switched on the instant before a ship. */
export function canStartTrial(state: GameState, id: string): boolean {
  const d = BY_ID.get(id);
  if (!d || !T.enabled) return false;
  if (state.activeTrial) return false; // one at a time
  if (state.trialsDone.includes(id)) return false; // one-time reward
  if (state.prestige.ships < d.unlockShips) return false;
  if (isShippable(state)) return false; // must commit early, on a fresh/building run
  return true;
}

/** Commit to a Trial for this run. Pure; no-op if not allowed. */
export function startTrial(state: GameState, id: string): GameState {
  if (!canStartTrial(state, id)) return state;
  return { ...state, activeTrial: id };
}

/** Abandon the active Trial (no reward). Pure; no-op if none active. */
export function abandonTrial(state: GameState): GameState {
  return state.activeTrial ? { ...state, activeTrial: null } : state;
}

/** Complete the active Trial (called from prestige on ship): bank its id and clear
 *  active. Idempotent — a Trial already in `trialsDone` just clears active. */
export function completeActiveTrial(state: GameState): GameState {
  const id = state.activeTrial;
  if (!id) return state;
  if (state.trialsDone.includes(id)) return { ...state, activeTrial: null };
  return { ...state, activeTrial: null, trialsDone: [...state.trialsDone, id] };
}

/** The combined Trial production multipliers: the ACTIVE run's handicap × every
 *  COMPLETED Trial's permanent reward, per lane. All 1.0 with nothing active/done. */
export function trialMods(state: GameState): { computeMult: number; dataMult: number; moneyMult: number } {
  let computeMult = 1, dataMult = 1, moneyMult = 1;
  if (!T.enabled) return { computeMult, dataMult, moneyMult };
  const apply = (lane: "compute" | "data" | "money", factor: number) => {
    if (lane === "compute") computeMult *= factor;
    else if (lane === "data") dataMult *= factor;
    else moneyMult *= factor;
  };
  // Active handicap (only while a Trial is running).
  if (state.activeTrial) {
    const d = BY_ID.get(state.activeTrial);
    if (d) apply(d.handicap.lane, d.handicap.factor);
  }
  // Permanent rewards from completed Trials.
  for (const id of state.trialsDone) {
    const d = BY_ID.get(id);
    if (d) apply(d.reward.lane, 1 + d.reward.value);
  }
  return { computeMult, dataMult, moneyMult };
}
