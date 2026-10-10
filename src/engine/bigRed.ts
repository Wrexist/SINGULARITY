import { bigRed as B, type BigRedOutcome } from "./balance/bigRed";
import type { ActiveModifier, GameState } from "./types";

/**
 * The Big Red Button (POST_LAUNCH R3.3) — pure and deterministic. The roll is a hash
 * of the lab's own state (presses so far, ships, whole seconds played), never
 * Math.random: the same lab pressing at the same moment always gets the same result.
 * Effects are temporary modifiers only (see balance/bigRed.ts).
 */

export { B as bigRedBalance };

/** The button exists for this lab (from the first Ship on). */
export function bigRedOpen(state: GameState): boolean {
  return B.enabled && state.prestige.ships >= B.openAtShips;
}

/** Seconds of play until the button can be pressed again (0 = ready). */
export function bigRedCooldown(state: GameState): number {
  const last = state.bigRed.lastSec;
  if (last === null) return 0;
  return Math.max(0, B.cooldownSec - (state.stats.playtimeSec - last));
}

export function bigRedReady(state: GameState): boolean {
  return bigRedOpen(state) && bigRedCooldown(state) <= 0;
}

/** 0..1 from the lab's state (a small integer mix — no RNG in the engine). */
function roll01(state: GameState): number {
  let h = Math.imul(state.bigRed.presses + 1, 2654435761);
  h ^= Math.imul(state.prestige.ships + 7, 40503);
  h ^= Math.imul(Math.floor(Math.max(0, state.stats.playtimeSec)), 97);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** What pressing right now would roll (weighted by the outcome table). */
export function bigRedOutcome(state: GameState): BigRedOutcome {
  const total = B.outcomes.reduce((s, o) => s + o.weight, 0);
  let r = roll01(state) * total;
  for (const o of B.outcomes) {
    if (r < o.weight) return o;
    r -= o.weight;
  }
  return B.outcomes[B.outcomes.length - 1]!;
}

/** Press it: apply the rolled outcome as a temporary modifier (a repeat refreshes
 *  rather than stacks), count the press, stamp the cooldown. Same-ref no-op when the
 *  button isn't ready. */
export function pressBigRed(state: GameState): GameState {
  if (!bigRedReady(state)) return state;
  const o = bigRedOutcome(state);
  const id = `bigred_${o.id}`;
  const mod: ActiveModifier = {
    id,
    target: o.target,
    factor: o.factor,
    remainingSec: o.durationSec,
    label: o.headline,
    tone: o.factor < 1 ? "bad" : "good",
  };
  return {
    ...state,
    modifiers: [...state.modifiers.filter((m) => m.id !== id), mod],
    bigRed: { presses: state.bigRed.presses + 1, lastSec: state.stats.playtimeSec },
  };
}
