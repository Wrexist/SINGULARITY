import { trials as T, CONDITION_THRESHOLDS, type TrialDef } from "./balance/trials";
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

/**
 * The one Trial a ladder is CURRENTLY offering: its lowest un-banked rung, or null
 * once the whole ladder is banked. Rungs are ordinary Trials, so listing all of them
 * would put three cards on screen for one chase — two of them permanently unreachable
 * until the rung below is banked. The panel shows this instead.
 */
export function ladderRung(state: GameState, ladder: string): TrialDef | null {
  for (const d of T.list) {
    if (d.ladder !== ladder) continue;
    if (!state.trialsDone.includes(d.id)) return d;
  }
  return null;
}

/** Ladder ids in display order (each base Trial opens one). */
export function trialLadders(): string[] {
  return T.list.filter((d) => d.rung === 1).map((d) => d.id);
}

/** How many rungs a ladder has, and how many are banked — for the card's rung marker. */
export function ladderProgress(state: GameState, ladder: string): { done: number; total: number } {
  const rungs = T.list.filter((d) => d.ladder === ladder);
  return { done: rungs.filter((d) => state.trialsDone.includes(d.id)).length, total: rungs.length };
}

/** Can the player START this Trial right now? The key rule (anti-cheese): you may
 *  only commit BEFORE the run is shippable, so the handicap is endured for a full
 *  generation rather than switched on the instant before a ship. */
export function canStartTrial(state: GameState, id: string): boolean {
  const d = BY_ID.get(id);
  if (!d || !T.enabled) return false;
  if (state.activeTrial) return false; // one at a time
  if (state.trialsDone.includes(id)) return false; // one-time reward
  if (d.requires && !state.trialsDone.includes(d.requires)) return false; // climb the ladder in order
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

/** Is the active Trial's run CONDITION (if any) currently satisfied? Handicap-only
 *  Trials have no condition and are always "met".
 *  - "solo"    → an empty staff roster.
 *  - "hot"     → regulatory Heat at/above the threshold (you shipped dangerously).
 *  - "neutral" → alignment inside the faction band (you never picked a side). */
export function trialConditionMet(state: GameState): boolean {
  const id = state.activeTrial;
  if (!id) return false;
  const d = BY_ID.get(id);
  if (!d || !d.condition) return true; // no condition → nothing to fail
  if (d.condition === "solo") return state.employees.length === 0;
  if (d.condition === "hot") return state.heat >= CONDITION_THRESHOLDS.hot;
  if (d.condition === "neutral") {
    // Neutral means BELOW the commit threshold on BOTH sides — exactly the faction
    // band, so the Trial ends the moment you'd flip a faction event pool open.
    return Math.abs(state.alignment) < CONDITION_THRESHOLDS.neutralBand;
  }
  return true;
}

/** Complete the active Trial (called from prestige on ship): bank its id IF its
 *  condition holds, and clear active either way. Idempotent — an already-banked Trial
 *  just clears active. A failed condition clears with no reward (retry next run). */
export function completeActiveTrial(state: GameState): GameState {
  const id = state.activeTrial;
  if (!id) return state;
  const banks = trialConditionMet(state) && !state.trialsDone.includes(id);
  return { ...state, activeTrial: null, trialsDone: banks ? [...state.trialsDone, id] : state.trialsDone };
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
  // Active handicap (only while a Trial with a production penalty is running).
  if (state.activeTrial) {
    const d = BY_ID.get(state.activeTrial);
    if (d?.handicap) apply(d.handicap.lane, d.handicap.factor);
  }
  // Permanent rewards from completed Trials.
  for (const id of state.trialsDone) {
    const d = BY_ID.get(id);
    if (d?.reward) apply(d.reward.lane, 1 + d.reward.value);
  }
  return { computeMult, dataMult, moneyMult };
}

/** Is Legacy switched off for this run (an Unplugged Trial is active)? derive reads
 *  the Legacy multiplier and the Legacy Investment lanes as ×1 while it is. */
export function legacyUnplugged(state: GameState): boolean {
  if (!T.enabled || !state.activeTrial) return false;
  return BY_ID.get(state.activeTrial)?.unplug === "legacy";
}

/** Sum a non-lane bonus over every banked Trial. */
function bankedBonus(state: GameState, key: "productSlots" | "rep"): number {
  if (!T.enabled) return 0;
  let n = 0;
  for (const id of state.trialsDone) n += BY_ID.get(id)?.bonus?.[key] ?? 0;
  return n;
}

/** Extra concurrent product slots banked from Trials (Unplugged I). */
export function trialBonusProductSlots(state: GameState): number {
  return bankedBonus(state, "productSlots");
}

/** Lab Reputation banked from Trials (Unplugged II); folded into earnedReputation. */
export function trialBonusRep(state: GameState): number {
  return bankedBonus(state, "rep");
}

const LANE_WORD: Record<string, string> = { compute: "Compute", data: "Data", money: "Money" };

/** What banking this Trial pays, as the short phrase the panel shows after "bank". */
export function trialRewardLabel(d: TrialDef): string {
  const parts: string[] = [];
  if (d.reward) parts.push(`+${Math.round(d.reward.value * 100)}% ${LANE_WORD[d.reward.lane]}`);
  const slots = d.bonus?.productSlots ?? 0;
  if (slots > 0) parts.push(`+${slots} product slot${slots === 1 ? "" : "s"}`);
  if (d.bonus?.rep) parts.push(`+${d.bonus.rep} Lab Reputation`);
  return parts.join(" and ");
}
