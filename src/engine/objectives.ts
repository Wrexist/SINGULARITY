import { objectives as O, objectiveRewardLabel, objectiveRewardOptions, type Objective, type ObjectiveMetric, type ObjectiveReward } from "./balance/objectives";
import { totalRacks } from "./hall";
import type { GameState } from "./types";

/**
 * Lab Objectives engine (IDEAS #B) — pure & deterministic. A rotating board of quick tasks
 * (the first `slots` uncompleted pool entries, like Contracts) whose rewards land on an
 * explicit Claim. Rewards are IMMEDIATE juice: a short output boost (a temp modifier) or a
 * self-scaling windfall (a slice of current income). Curve-safe: the balance sim never
 * claims, and neither reward inflates the permanent curve (temporary / bounded-by-income).
 */

export { objectiveRewardLabel };
const BY_ID = new Map(O.pool.map((o) => [o.id, o]));

/** Current value of an objective's tracked metric (read straight from state/stats). */
export function objectiveMetric(state: GameState, metric: ObjectiveMetric): number {
  switch (metric) {
    case "lifetimeMoney": return state.lifetimeMoney.toNumber();
    case "compute": return state.stats.peakComputePerSec.toNumber();
    case "research": return state.research.length;
    case "racks": return totalRacks(state);
    case "ships": return state.prestige.ships;
    case "products": return state.stats.productsLaunched;
    case "employees": return state.stats.employeesHired;
    case "mau": return state.stats.peakMau;
    case "mrr": return state.stats.peakMrr;
    case "events": return state.stats.worldEventsResolved;
    case "contracts": return state.contracts.completed.filter((id) => !id.startsWith("sponsor_")).length;
  }
}

/** Shown once the player has started earning (so the first frame isn't cluttered) and while
 *  the board still has entries. It's an early/mid feature — a veteran will have cleared it. */
export function objectivesUnlocked(state: GameState): boolean {
  return O.enabled && state.lifetimeMoney.gt(0) && objectiveBoard(state).length > 0;
}

export interface ObjectiveView {
  def: Objective;
  value: number;
  /** 0..1 progress toward the target. */
  progress: number;
  /** Met and ready to claim. */
  ready: boolean;
}

/** The board: the first `slots` uncompleted objectives, with live progress. */
export function objectiveBoard(state: GameState): ObjectiveView[] {
  const done = new Set(state.objectives.completed);
  return O.pool
    .filter((o) => !done.has(o.id))
    .slice(0, O.slots)
    .map((def) => {
      const value = objectiveMetric(state, def.metric);
      return { def, value, progress: def.target > 0 ? Math.min(1, value / def.target) : 1, ready: value >= def.target };
    });
}

/** How many objectives are met and waiting to be claimed (drives a badge). */
export function claimableObjectives(state: GameState): number {
  return objectiveBoard(state).filter((v) => v.ready).length;
}

export function canClaimObjective(state: GameState, id: string): boolean {
  if (state.objectives.completed.includes(id)) return false;
  const view = objectiveBoard(state).find((v) => v.def.id === id);
  return !!view && view.ready;
}

/**
 * Claim a met objective: apply its reward (a short output-boost modifier) and record
 * completion so the next pool entry rotates onto the board. Pure; same-ref no-op if not
 * claimable. The player may steer the boost to either lane the card offers (see
 * `objectiveRewardOptions`) — all options share the same factor/duration, so `target` is a
 * placement choice only and can't inflate the reward. An absent/invalid `target` falls back
 * to the headline lane (so the balance sim's non-claiming path and old saves are unaffected).
 * The reward multiplies current output, so it's always meaningful and never inflates the
 * permanent curve (temporary + the sim never claims).
 */
export function claimObjective(state: GameState, id: string, target?: ObjectiveReward["target"]): GameState {
  if (!canClaimObjective(state, id)) return state;
  const r = BY_ID.get(id)!.reward;
  const chosen = objectiveRewardOptions(r).find((o) => o.target === target) ?? r;
  const mod = { id: `obj_${id}`, target: chosen.target, factor: chosen.factor, remainingSec: chosen.durationSec, label: `Objective ×${chosen.factor}`, tone: "good" as const };
  return {
    ...state,
    // id-keyed so a (re)claim refreshes rather than duplicates.
    modifiers: [...state.modifiers.filter((m) => m.id !== mod.id), mod],
    objectives: { completed: [...state.objectives.completed, id] },
  };
}
