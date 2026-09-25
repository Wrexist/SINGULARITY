import { charters as C, type CharterDef, type CharterRule } from "./balance/charters";
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
  return chartersUnlocked(state) && state.research.length === 0 && !state.charterLocked;
}

/** Explicitly lock the current pick (owner UX fix: "no way to lock it in").
 *  Research still locks implicitly; this just lets a decided player commit. */
export function lockCharter(state: GameState): GameState {
  if (!canSetCharter(state) || state.charter === null) return state;
  return { ...state, charterLocked: true };
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

/** The active charter's rule multipliers ({} = every rule ×1, incl. no charter). */
export function charterRule(state: GameState): CharterRule {
  if (!C.enabled) return {};
  return charterDef(state.charter)?.rule ?? {};
}

/** A small deterministic generator (xorshift32) seeded by the ship count, so the same
 *  ship always deals the same hand — no wall clock, no Math.random. */
function dealer(seed: number): () => number {
  let x = (Math.imul(seed + 1, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/**
 * This run's hand: `handSize` charter ids dealt from the ship count (see the Charter
 * Draft note in balance/charters.ts). Always holds `lastCharter` when there is one,
 * so a conviction streak can continue; from the rule charters' unlock, one wild card;
 * lane charters fill the rest. Empty before charters unlock.
 */
export function charterHand(state: GameState): string[] {
  if (!chartersUnlocked(state)) return [];
  const ships = state.prestige.ships;
  const rnd = dealer(ships);
  const shuffled = (list: CharterDef[]) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const eligible = C.list.filter((c) => (c.minShips ?? 0) <= ships);
  const rules = shuffled(eligible.filter((c) => c.rule));
  const lanes = shuffled(eligible.filter((c) => !c.rule));
  const hand: string[] = [];
  const last = state.lastCharter;
  if (last && BY_ID.has(last) && eligible.some((c) => c.id === last)) hand.push(last);
  const wild = rules.find((c) => !hand.includes(c.id));
  if (wild && !hand.some((id) => BY_ID.get(id)?.rule)) hand.push(wild.id);
  for (const c of lanes) {
    if (hand.length >= C.handSize) break;
    if (!hand.includes(c.id)) hand.push(c.id);
  }
  return hand.slice(0, C.handSize);
}

/** Set (or clear) the run's charter. No-op unless it's still changeable, and only
 *  accepts a charter from this run's hand (or the one already adopted), or null. Pure. */
export function setCharter(state: GameState, id: string | null): GameState {
  if (!canSetCharter(state)) return state;
  if (id !== null && !BY_ID.has(id)) return state;
  if (id !== null && id !== state.charter && !charterHand(state).includes(id)) return state;
  return { ...state, charter: id };
}
