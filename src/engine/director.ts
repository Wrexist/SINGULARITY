import { charters as C } from "./balance/charters";
import { reputation as R } from "./balance/reputation";
import type { GameState } from "./types";

/**
 * The Research Director and its start-of-run grace, in one leaf module (balance data
 * and types only). Every start-of-run pick — the Lab Charter, the Stance, a Prestige
 * Trial — has to honour the same grace, and they live in modules that cannot import
 * each other without a cycle (reputation.ts imports trials.ts), so the definition
 * lives here and each of them reads it.
 */

/** True when the player owns the Research Director perk (auto-buys research). */
export function autoResearchEnabled(state: GameState): boolean {
  return R.perks.some(
    (p) => p.effect.kind === "automate" && p.id === "rep_autoresearch" && state.reputation.perks.includes(p.id),
  );
}

/**
 * Engine seconds since this run's ship, read from the stamp prestige() writes on the
 * Archive entry (`atSec` = playtime at the ship). Deterministic — playtime accrues in
 * tick(), never from the wall clock — and needs no new saved field. null when the
 * stamp can't be trusted: no ship yet, a pre-v35 entry without it, a last entry that
 * isn't this generation's, or a stamp ahead of the clock.
 */
export function runElapsedSec(state: GameState): number | null {
  const last = state.shipLog[state.shipLog.length - 1];
  if (!last || last.atSec === undefined || last.gen !== state.prestige.ships) return null;
  const elapsed = state.stats.playtimeSec - last.atSec;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

/** True while a Research Director owner's run is younger than the grace (see
 *  `directorGraceSec` in balance/charters.ts). False on an unreadable run clock. The
 *  Director buys research — the whole path to a Ship, in the deep endgame — within a
 *  tick of the Ship, and an automatic purchase is not the player committing. */
export function directorGrace(state: GameState): boolean {
  if (!autoResearchEnabled(state)) return false;
  const t = runElapsedSec(state);
  return t !== null && t < C.directorGraceSec;
}
