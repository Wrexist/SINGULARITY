import { doctrine as D, COMMITTABLE_SIDES, type DoctrinePerkDef } from "./balance/doctrine";
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

/** Which side the player has committed to THIS run (null at neutral). Never returns
 *  "schism" — that track is qualified for, not chosen. The sim, which never fires a
 *  faction event, is always neutral → always null. */
export function committedSide(state: GameState): Stance {
  if (state.alignment <= -D.threshold) return "doomer";
  if (state.alignment >= D.threshold) return "accel";
  return null;
}

/** How many perks are held on each side a player can commit to. Schism perks don't
 *  count toward their own prerequisite — only the two real doctrines do. */
export function perksPerSide(state: GameState): Record<"doomer" | "accel", number> {
  const out = { doomer: 0, accel: 0 };
  for (const id of state.doctrines) {
    const def = BY_ID.get(id);
    if (def && (def.side === "doomer" || def.side === "accel")) out[def.side]++;
  }
  return out;
}

/** The weakest of the two sides' perk counts — the number a Schism rung's `minPerSide`
 *  is measured against, so holding six on one side and none on the other qualifies for
 *  nothing. */
export function schismDepth(state: GameState): number {
  const per = perksPerSide(state);
  return Math.min(...COMMITTABLE_SIDES.map((s) => per[s]));
}

/** Is the Schism track visible at all? Once you hold a perk on both sides — before
 *  that it is not "locked content", it simply is not part of your story yet. */
export function schismRevealed(state: GameState): boolean {
  return doctrineUnlocked(state) && schismDepth(state) >= 1;
}

/**
 * Declare a Stance (2026-09 generations audit). Alignment only moved on faction
 * world-event choices, ±0.3 each against a 0.4 threshold — two same-side decisions
 * inside ONE run, when late-game runs last seconds and alignment resets on every
 * ship. The whole Doctrine track sat unreachable behind that. Now, from the reveal
 * on, you can simply say where the lab stands: at the start of a run (the same
 * window the Lab Charter uses), set alignment to exactly the commit threshold on
 * either side, or back to the center. World-event choices still move it from there.
 *
 * The window closes when the charter does — first research, or "Lock in" — and
 * claims wait for that close (see canClaimDoctrine), so one run can never be
 * declared Safety, claimed, re-declared Acceleration and claimed again. Curve-safe:
 * the sim never declares, so it stays at alignment 0 with every stance effect off.
 */
export type Stance = "doomer" | "accel" | null;

/** Is the stance still open for this run? Revealed, and the run not yet committed
 *  to a path — the Lab Charter's own window, so both start-of-run picks share one
 *  close. */
export function stanceOpen(state: GameState): boolean {
  return doctrineUnlocked(state) && state.research.length === 0 && !state.charterLocked;
}

/** Declare this run's stance: exactly the commit threshold on that side, or the
 *  center. Pure; a no-op outside the open window or on an unknown side. */
export function declareStance(state: GameState, stance: Stance): GameState {
  if (!stanceOpen(state)) return state;
  if (stance !== null && stance !== "doomer" && stance !== "accel") return state;
  const alignment = stance === "doomer" ? -D.threshold : stance === "accel" ? D.threshold : 0;
  if (alignment === state.alignment) return state;
  return { ...state, alignment };
}

export function doctrinePerks() {
  return D.perks;
}

/**
 * Can the player claim this perk now? Revealed, stance locked for this run, unowned,
 * prereq met — plus the side rule, which differs by track:
 *  - A side perk needs you COMMITTED to that side right now.
 *  - A Schism perk needs the opposite: you must be UNCOMMITTED (the synthesis is
 *    claimed from the center), and hold at least `minPerSide` perks on each of the two
 *    real sides — which, since alignment resets to neutral on every ship, can only be
 *    assembled across generations.
 */
export function canClaimDoctrine(state: GameState, id: string): boolean {
  if (!doctrineUnlocked(state)) return false;
  // Claims wait for the stance to lock (first research / Lock in) — otherwise a
  // fresh run could be declared one way, claimed, flipped and claimed again.
  if (stanceOpen(state)) return false;
  const def = BY_ID.get(id);
  if (!def || state.doctrines.includes(id)) return false;
  if (def.requires && !state.doctrines.includes(def.requires)) return false;
  if (def.side === "schism") {
    if (committedSide(state) !== null) return false;
    return schismDepth(state) >= (def.minPerSide ?? 1);
  }
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
    if (def.effect.kind === "allMult") { computeMult *= m; dataMult *= m; moneyMult *= m; }
    else if (def.effect.kind === "computeMult") computeMult *= m;
    else if (def.effect.kind === "dataMult") dataMult *= m;
    else moneyMult *= m;
  }
  return { computeMult, dataMult, moneyMult };
}
