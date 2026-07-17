import { paradigms as P, type ParadigmDef } from "./balance/paradigms";
import { reputationAvailable } from "./reputation";
import type { GameState } from "./types";

/**
 * Paradigm Research — pure helpers. Owned nodes live in `state.paradigms` (a string[]);
 * cost is Reputation, charged to `state.reputation.spent` the same way perks + the
 * endowment are, so the shared "available Reputation" pool stays honest and can't desync.
 * See balance/paradigms.ts for the design + the curve-safety argument (meta-currency cost
 * → identity for the sim). Imports only reputation.ts (which never imports this) — no cycle.
 */

export { P as paradigmsBalance };

const BY_ID = new Map<string, ParadigmDef>(P.list.map((d) => [d.id, d]));
/** Valid paradigm ids — exported for the save sanitizer. */
export const PARADIGM_IDS: Set<string> = new Set(P.list.map((d) => d.id));

/** Total Reputation committed to owned paradigms (for spend reconciliation on load). */
export function paradigmSpent(state: GameState): number {
  let n = 0;
  for (const id of state.paradigms) n += BY_ID.get(id)?.cost ?? 0;
  return n;
}

/** True once the layer is revealed (a deep-run veteran). Visibility gate only. */
export function paradigmsUnlocked(state: GameState): boolean {
  return P.enabled && state.prestige.ships >= P.revealAtShips;
}

export function paradigmDefs() {
  return P.list;
}

/** Can the player buy this paradigm now? (revealed, unowned, prereq met, affordable). */
export function canBuyParadigm(state: GameState, id: string): boolean {
  if (!paradigmsUnlocked(state)) return false;
  const def = BY_ID.get(id);
  if (!def || state.paradigms.includes(id)) return false;
  if (def.requires && !state.paradigms.includes(def.requires)) return false;
  return reputationAvailable(state) >= def.cost;
}

/** Buy a paradigm: record ownership + charge Reputation (via reputation.spent). Pure. */
export function buyParadigm(state: GameState, id: string): GameState {
  if (!canBuyParadigm(state, id)) return state;
  const def = BY_ID.get(id)!;
  return {
    ...state,
    paradigms: [...state.paradigms, id],
    reputation: { ...state.reputation, spent: state.reputation.spent + def.cost },
  };
}

/** Owned paradigm capability boosts as lane multipliers (all 1.0 with none owned). */
export function paradigmMods(state: GameState): { computeMult: number; dataMult: number; moneyMult: number } {
  let computeMult = 1, dataMult = 1, moneyMult = 1;
  if (!P.enabled) return { computeMult, dataMult, moneyMult };
  for (const id of state.paradigms) {
    const def = BY_ID.get(id);
    if (!def) continue;
    const m = 1 + def.effect.value;
    switch (def.effect.kind) {
      case "computeMult": computeMult *= m; break;
      case "dataMult": dataMult *= m; break;
      case "moneyMult": moneyMult *= m; break;
      case "globalMult": computeMult *= m; dataMult *= m; moneyMult *= m; break;
    }
  }
  return { computeMult, dataMult, moneyMult };
}
