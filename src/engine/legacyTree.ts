import { Big } from "./math/Big";
import { legacyTree as L } from "./balance/legacyTree";
import type { GameState } from "./types";

/**
 * Legacy Investments (R5.4) — pure helpers. Owned perks live in
 * `state.legacyInvestments` (a string[], persisted across prestige like reputation
 * perks). `spent` is derived from the owned perks, never stored, so it can't
 * desync. Spending reduces the weights available to the global multiplier, which
 * is the trade-off; the lane biases are folded into derive.
 */

export { L as legacyTreeBalance };

const BY_ID = new Map(L.perks.map((p) => [p.id, p]));

/** Total weights committed to the tree (sum of owned perks' costs). */
export function legacySpent(state: GameState): number {
  let n = 0;
  for (const id of state.legacyInvestments) n += BY_ID.get(id)?.cost ?? 0;
  return n;
}

/** Weights still feeding the GLOBAL multiplier (total earned − invested), ≥ 0. */
export function legacyAvailable(state: GameState): Big {
  return state.prestige.legacyWeights.sub(legacySpent(state)).max(Big.ZERO);
}

export function canBuyLegacyPerk(state: GameState, id: string): boolean {
  if (!L.enabled) return false;
  const perk = BY_ID.get(id);
  if (!perk || state.legacyInvestments.includes(id)) return false;
  if (perk.requires && !state.legacyInvestments.includes(perk.requires)) return false;
  // You must have enough UNSPENT weights to commit this one.
  return legacyAvailable(state).gte(perk.cost);
}

/** Buy a legacy perk — records ownership (spend is derived). Pure; no-op if not allowed. */
export function buyLegacyPerk(state: GameState, id: string): GameState {
  if (!canBuyLegacyPerk(state, id)) return state;
  return { ...state, legacyInvestments: [...state.legacyInvestments, id] };
}

/** Owned lane biases as multipliers (all 1.0 with nothing invested). */
export function legacyTreeMods(state: GameState): { computeMult: number; dataMult: number; moneyMult: number } {
  let computeMult = 1, dataMult = 1, moneyMult = 1;
  if (!L.enabled) return { computeMult, dataMult, moneyMult };
  for (const id of state.legacyInvestments) {
    const perk = BY_ID.get(id);
    if (!perk) continue;
    if (perk.effect.lane === "compute") computeMult += perk.effect.value;
    else if (perk.effect.lane === "data") dataMult += perk.effect.value;
    else moneyMult += perk.effect.value;
  }
  return { computeMult, dataMult, moneyMult };
}
