import { charters as C, type CharterDef } from "./balance/charters";
import type { GameState } from "./types";

/**
 * Lab Charter (R6.1) — pure helpers. A charter is the current run's chosen tilt;
 * it folds flat lane multipliers into derive. Neutral (null) is identity, so a
 * charter-less run (including the first) is exactly the tuned baseline.
 */

export { C as chartersBalance };

const BY_ID = new Map(C.list.map((c) => [c.id, c]));

export function charterDef(id: string | null): CharterDef | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Charters unlock after the first ship; before that there's nothing to pick. */
export function chartersUnlocked(state: GameState): boolean {
  return C.enabled && state.prestige.ships >= C.unlockAtShips;
}

/**
 * The current run's charter is changeable only while the run is fresh (no research
 * bought yet) — it's a start-of-run build choice, locked once you commit to a path.
 */
export function canSetCharter(state: GameState): boolean {
  return chartersUnlocked(state) && state.research.length === 0;
}

/** Lane multipliers from the active charter. All 1.0 when none is set. */
export function charterMods(state: GameState): { computeMult: number; dataMult: number; moneyMult: number } {
  const def = charterDef(state.charter);
  if (!C.enabled || !def) return { computeMult: 1, dataMult: 1, moneyMult: 1 };
  return {
    computeMult: 1 + (def.computeMult ?? 0),
    dataMult: 1 + (def.dataMult ?? 0),
    moneyMult: 1 + (def.moneyMult ?? 0),
  };
}

/** Set (or clear) the run's charter. No-op unless it's still changeable, and only
 *  accepts a real charter id or null. Pure. */
export function setCharter(state: GameState, id: string | null): GameState {
  if (!canSetCharter(state)) return state;
  if (id !== null && !BY_ID.has(id)) return state;
  return { ...state, charter: id };
}
