import { doctrine as D, type DoctrinePerkDef, type DoctrineSide } from "./balance/doctrine";
import type { GameState } from "./types";

/**
 * Doctrine Consequences — pure helpers. Owned perks live in `state.doctrines` (a
 * string[]). Claiming is free (the reward of committing to a stance), gated on your
 * current alignment being past the commit threshold for that side. See balance/doctrine.ts
 * for the design + the (double) curve-safety argument. Imports only balance data + types.
 */

export { D as doctrineBalance };

const BY_ID = new Map<string, DoctrinePerkDef>(D.perks.map((p) => [p.id, p]));
/** Valid doctrine perk ids — exported for the save sanitizer. */
export const DOCTRINE_IDS: Set<string> = new Set(D.perks.map((p) => p.id));

/** Revealed once the player is deep enough that factions matter. */
export function doctrineUnlocked(state: GameState): boolean {
  return D.enabled && state.prestige.ships >= D.revealAtShips;
}

/** Which side the player has committed to THIS run (null at neutral). The sim, which
 *  never fires a faction event, is always neutral → always null. */
export function committedSide(state: GameState): DoctrineSide | null {
  if (state.alignment <= -D.threshold) return "doomer";
  if (state.alignment >= D.threshold) return "accel";
  return null;
}

export function doctrinePerks() {
  return D.perks;
}

/** Can the player claim this perk now? (revealed, unowned, prereq met, and currently
 *  committed to the perk's side). */
export function canClaimDoctrine(state: GameState, id: string): boolean {
  if (!doctrineUnlocked(state)) return false;
  const def = BY_ID.get(id);
  if (!def || state.doctrines.includes(id)) return false;
  if (def.requires && !state.doctrines.includes(def.requires)) return false;
  return committedSide(state) === def.side;
}

/** Claim a doctrine perk (permanent). Pure; no-op if not currently claimable. */
export function claimDoctrine(state: GameState, id: string): GameState {
  if (!canClaimDoctrine(state, id)) return state;
  return { ...state, doctrines: [...state.doctrines, id] };
}

/** Owned doctrine lane multipliers (all 1.0 with none claimed). */
export function doctrineMods(state: GameState): { computeMult: number; dataMult: number; moneyMult: number } {
  let computeMult = 1, dataMult = 1, moneyMult = 1;
  if (!D.enabled) return { computeMult, dataMult, moneyMult };
  for (const id of state.doctrines) {
    const def = BY_ID.get(id);
    if (!def) continue;
    const m = 1 + def.effect.value;
    if (def.effect.kind === "computeMult") computeMult *= m;
    else if (def.effect.kind === "dataMult") dataMult *= m;
    else moneyMult *= m;
  }
  return { computeMult, dataMult, moneyMult };
}
