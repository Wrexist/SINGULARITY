import { Big } from "./math/Big";
import { achievements as ACH_DEFS, achievementRep } from "./balance/achievements";
import { reputation as R } from "./balance/reputation";
import { contractsReputation } from "./contracts";
import type { GameState } from "./types";

/**
 * Lab Reputation (Phase 3) — pure meta-currency logic. Points are derivable
 * (earned − spent) rather than stored, so they can never desync: earned is a pure
 * function of the permanent achievement collection + ships + ascensions, and
 * `reputation.spent` only ever rises when a perk is bought. Perks fold into derive.
 */

export { R as reputationBalance };

/** Total Reputation ever earned (monotonic; pure function of permanent progress). */
export function earnedReputation(state: GameState): number {
  const have = new Set(state.achievements);
  let pts = 0;
  for (const def of ACH_DEFS) if (have.has(def.id)) pts += achievementRep(def);
  pts += state.stats.totalShips * R.perShip;
  pts += state.stats.ascensions * R.perAscension;
  pts += contractsReputation(state); // completed contracts grant Reputation
  return pts;
}

/** Reputation available to spend right now. */
export function reputationAvailable(state: GameState): number {
  return Math.max(0, earnedReputation(state) - state.reputation.spent);
}

const PERK_BY_ID = new Map(R.perks.map((p) => [p.id, p]));

/** Can the player buy this perk? (exists, unowned, prereq met, affordable). */
export function canBuyReputationPerk(state: GameState, id: string): boolean {
  const perk = PERK_BY_ID.get(id);
  if (!perk) return false;
  if (state.reputation.perks.includes(id)) return false;
  if (perk.requires && !state.reputation.perks.includes(perk.requires)) return false;
  return reputationAvailable(state) >= perk.cost;
}

/** Buy a perk: record the spend + ownership. Pure; no-op if not allowed. */
export function buyReputationPerk(state: GameState, id: string): GameState {
  if (!canBuyReputationPerk(state, id)) return state;
  const perk = PERK_BY_ID.get(id)!;
  return {
    ...state,
    reputation: {
      spent: state.reputation.spent + perk.cost,
      perks: [...state.reputation.perks, id],
    },
  };
}

export interface ReputationMods {
  computeMult: number;
  dataMult: number;
  moneyMult: number;
  /** ≤ 1 trims the wage bill. */
  payrollMult: number;
}

/** Fold owned reputation perks into multipliers for derive. Neutral = all 1. */
export function reputationMods(state: GameState): ReputationMods {
  let computeMult = 1;
  let dataMult = 1;
  let moneyMult = 1;
  let payrollMult = 1;
  for (const perk of R.perks) {
    if (!state.reputation.perks.includes(perk.id)) continue;
    const { kind, value } = perk.effect;
    if (kind === "computeMult") computeMult *= 1 + value;
    else if (kind === "dataMult") dataMult *= 1 + value;
    else if (kind === "moneyMult") moneyMult *= 1 + value;
    else if (kind === "globalMult") { computeMult *= 1 + value; dataMult *= 1 + value; moneyMult *= 1 + value; }
    else if (kind === "payrollMult") payrollMult *= 1 - value;
    // "automate" perks are unlock flags (read by autoResearchEnabled), not multipliers.
  }
  return { computeMult, dataMult, moneyMult, payrollMult };
}

/** True when the player owns the Research Director perk (auto-buys research). */
export function autoResearchEnabled(state: GameState): boolean {
  return R.perks.some(
    (p) => p.effect.kind === "automate" && p.id === "rep_autoresearch" && state.reputation.perks.includes(p.id),
  );
}

/** Extra concurrent product slots from owned `productSlot` perks (R5.6). */
export function bonusProductSlots(state: GameState): number {
  let n = 0;
  for (const p of R.perks) {
    if (p.effect.kind === "productSlot" && state.reputation.perks.includes(p.id)) n += p.effect.value;
  }
  return n;
}

/** As Big multipliers (convenience for derive). */
export function reputationBigMods(state: GameState) {
  const m = reputationMods(state);
  return {
    computeMult: Big.of(m.computeMult),
    dataMult: Big.of(m.dataMult),
    moneyMult: Big.of(m.moneyMult),
    payrollMult: Big.of(m.payrollMult),
  };
}
