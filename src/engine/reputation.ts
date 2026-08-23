import { achievements as ACH_DEFS, achievementRep } from "./balance/achievements";
import { reputation as R } from "./balance/reputation";
import { contractsReputation } from "./contracts";
import { balance } from "./balance/config";
import type { GameState } from "./types";

const shipModes = balance.prestige.shipModes;

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
  pts += state.stats.openSourceShips * shipModes.open_source.reputationBonus; // open-source goodwill
  pts += state.stats.safetyShips * R.perSafetyShip; // safety-committed ships earn standing (B1)
  pts += state.stats.stakesRepEarned; // Frontier Race stakes won (depth batch)
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
      ...state.reputation,
      spent: state.reputation.spent + perk.cost,
      perks: [...state.reputation.perks, id],
    },
  };
}

// ---------- Endgame Reputation Endowment (post-AGI infinite sink) ----------

const E = R.endowment;

/** True once the ENTIRE finite perk tree is owned — the Endowment's unlock gate.
 *  A fresh run / the sim owns no perks, so this is false through the whole tuned game. */
export function endowmentUnlocked(state: GameState): boolean {
  return E.enabled && R.perks.every((p) => state.reputation.perks.includes(p.id));
}

/** Reputation cost of the NEXT endowment level (escalating: base × growth^level). */
export function endowmentCost(state: GameState): number {
  return Math.ceil(E.baseCost * Math.pow(E.growth, Math.max(0, state.repEndowment)));
}

/** Total Reputation to reach `level` endowment levels — for save reconciliation, so a
 *  crafted repEndowment forces a matching `spent` (same policy as the perk tree). */
export function endowmentCostSum(level: number): number {
  const n = Math.max(0, Math.min(E.maxLevel, Math.floor(level)));
  let sum = 0;
  for (let k = 0; k < n; k++) sum += Math.ceil(E.baseCost * Math.pow(E.growth, k));
  return sum;
}

export function canBuyEndowment(state: GameState): boolean {
  if (!endowmentUnlocked(state) || state.repEndowment >= E.maxLevel) return false;
  return reputationAvailable(state) >= endowmentCost(state);
}

/** Buy one endowment level: charge Reputation (via spent) and bump the level count. */
export function buyEndowment(state: GameState): GameState {
  if (!canBuyEndowment(state)) return state;
  const cost = endowmentCost(state);
  return {
    ...state,
    repEndowment: state.repEndowment + 1,
    reputation: { ...state.reputation, spent: state.reputation.spent + cost },
  };
}

/** Permanent all-lane multiplier from the Endowment (1 at level 0 — identity). */
export function endowmentMult(state: GameState): number {
  return 1 + Math.max(0, state.repEndowment) * E.perLevel;
}

// ---------- Endowment Directives (endgame build decisions on top of the sink) ----------

const DIRECTIVE_BY_ID = new Map(E.directives.defs.map((d) => [d.id, d]));
/** The set of valid directive ids — exported for the save sanitizer. */
export const DIRECTIVE_IDS = new Set(E.directives.defs.map((d) => d.id));

/** How many Directive picks the player has EARNED (one per `interval` endowment levels). */
export function directiveTiersEarned(state: GameState): number {
  if (!E.enabled) return 0;
  return Math.floor(Math.max(0, state.repEndowment) / E.directives.interval);
}

/** Unclaimed Directive picks waiting for a choice (earned − already picked, ≥ 0). */
export function directivePicksAvailable(state: GameState): number {
  return Math.max(0, directiveTiersEarned(state) - state.endowmentDirectives.length);
}

/** Can the player claim a directive with this id right now? */
export function canPickDirective(state: GameState, id: string): boolean {
  if (!E.enabled) return false;
  if (!DIRECTIVE_BY_ID.has(id)) return false;
  return directivePicksAvailable(state) > 0;
}

/** Claim one Directive pick as the given doctrine. Pure; no-op if none available or
 *  the id is unknown. Directives are a multiset — the same doctrine may repeat to
 *  stack a lane. */
export function pickEndowmentDirective(state: GameState, id: string): GameState {
  if (!canPickDirective(state, id)) return state;
  return { ...state, endowmentDirectives: [...state.endowmentDirectives, id] };
}

// ---------- Directive respec (depth batch 2026-08) ----------

/** Reputation fee to refund ONE claimed directive right now (escalates per respec,
 *  so a rebuild stays deliberate rather than a cheap re-roll). */
export function directiveRespecCost(state: GameState): number {
  return Math.ceil(
    E.directives.respecBaseCost * Math.pow(E.directives.respecGrowth, Math.max(0, state.endowmentRespecs)),
  );
}

/** Can the player respec? Needs owned directives and the fee available. */
export function canRespecDirective(state: GameState): boolean {
  if (!E.enabled || state.endowmentDirectives.length === 0) return false;
  return reputationAvailable(state) >= directiveRespecCost(state);
}

/** Refund one instance of the given directive (last matching pick): the freed tier
 *  pick becomes choosable again (directivePicksAvailable rises), the fee is charged
 *  via reputation.spent, and the respec count escalates the next fee. Pure; no-op if
 *  not allowed or the id isn't among the picks. */
export function respecDirective(state: GameState, id: string): GameState {
  if (!canRespecDirective(state)) return state;
  const idx = state.endowmentDirectives.lastIndexOf(id);
  if (idx === -1) return state;
  const directives = [...state.endowmentDirectives];
  directives.splice(idx, 1);
  return {
    ...state,
    endowmentDirectives: directives,
    endowmentRespecs: state.endowmentRespecs + 1,
    reputation: { ...state.reputation, spent: state.reputation.spent + directiveRespecCost(state) },
  };
}

/** Owned directive lane biases as multipliers (all 1.0 with nothing chosen). Each
 *  entry multiplies its lane by (1 + value), like the reputation perks. */
export function endowmentDirectiveMods(state: GameState): { computeMult: number; dataMult: number; moneyMult: number } {
  let computeMult = 1, dataMult = 1, moneyMult = 1;
  if (!E.enabled) return { computeMult, dataMult, moneyMult };
  for (const id of state.endowmentDirectives) {
    const def = DIRECTIVE_BY_ID.get(id);
    if (!def) continue;
    if (def.lane === "compute") computeMult *= 1 + def.value;
    else if (def.lane === "data") dataMult *= 1 + def.value;
    else moneyMult *= 1 + def.value;
  }
  return { computeMult, dataMult, moneyMult };
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
  // Endgame Endowment: a permanent all-lane boost on top of the perk tree. Identity
  // (×1) at level 0, so it's dormant through the whole tuned game — only a deep-endgame
  // lab that already owns every perk can raise it.
  const endow = endowmentMult(state);
  computeMult *= endow;
  dataMult *= endow;
  moneyMult *= endow;
  // Endowment Directives: per-lane doctrines the player chose while levelling the
  // Endowment. Identity (all ×1) until the first directive is claimed — which can't
  // happen until repEndowment ≥ interval, a deep-endgame state the sim never reaches.
  const dir = endowmentDirectiveMods(state);
  computeMult *= dir.computeMult;
  dataMult *= dir.dataMult;
  moneyMult *= dir.moneyMult;
  return { computeMult, dataMult, moneyMult, payrollMult };
}

/** True when the player owns the Research Director perk (auto-buys research). */
export function autoResearchEnabled(state: GameState): boolean {
  return R.perks.some(
    (p) => p.effect.kind === "automate" && p.id === "rep_autoresearch" && state.reputation.perks.includes(p.id),
  );
}

/** Research-cost multiplier from owned `researchDiscount` perks (≤ 1). Neutral = 1,
 *  so a fresh run (no perks) pays full price and the early curve is untouched. The
 *  discounts stack multiplicatively and are floored so research can't become free. */
export function researchCostMult(state: GameState): number {
  let mult = 1;
  for (const p of R.perks) {
    if (p.effect.kind === "researchDiscount" && state.reputation.perks.includes(p.id)) {
      mult *= 1 - p.effect.value;
    }
  }
  return Math.max(R.researchDiscountFloor, mult);
}

/** Free basic racks a fresh run starts with, from owned `startingRacks` perks (R5.6).
 *  Zero with no perk → the first run's cold open is unchanged (curve-safe). */
export function startingRacks(state: GameState): number {
  let n = 0;
  for (const p of R.perks) {
    if (p.effect.kind === "startingRacks" && state.reputation.perks.includes(p.id)) n += p.effect.value;
  }
  return n;
}

/** Extra concurrent product slots from owned `productSlot` perks (R5.6). */
export function bonusProductSlots(state: GameState): number {
  let n = 0;
  for (const p of R.perks) {
    if (p.effect.kind === "productSlot" && state.reputation.perks.includes(p.id)) n += p.effect.value;
  }
  return n;
}
