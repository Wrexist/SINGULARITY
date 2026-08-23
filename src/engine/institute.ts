import { institute as I, type InstitutePerkDef } from "./balance/institute";
import type { GameState } from "./types";

/**
 * The Institute — pure helpers. Owned wings live in `state.institute` (a string[]);
 * `spent` is DERIVED from owned costs (never stored, so it can't desync), and available
 * Grants = earned (from ascensions) − spent. Effects fold into derive. See
 * balance/institute.ts for the design + the curve-safety argument. Imports only balance
 * data + types (no cycle).
 */

export { I as instituteBalance };

const BY_ID = new Map<string, InstitutePerkDef>(I.perks.map((p) => [p.id, p]));
/** Valid Institute perk ids — exported for the save sanitizer. */
export const INSTITUTE_IDS: Set<string> = new Set(I.perks.map((p) => p.id));

/** Grants ever minted — purely a function of ascensions (monotonic). */
export function earnedGrants(state: GameState): number {
  if (!I.enabled) return 0;
  return Math.max(0, Math.floor(state.stats.ascensions)) * I.grantsPerAscension;
}

/** Grants committed to owned wings (sum of costs) PLUS endowed Fellowships. */
export function grantsSpent(state: GameState): number {
  let n = 0;
  for (const id of state.institute) n += BY_ID.get(id)?.cost ?? 0;
  return n + fellowshipCostSum(state.instituteFellowships);
}

/** Grants available to spend right now. */
export function grantsAvailable(state: GameState): number {
  return Math.max(0, earnedGrants(state) - grantsSpent(state));
}

/** True once the Institute has revealed (enough ascensions to found it). */
export function instituteUnlocked(state: GameState): boolean {
  return I.enabled && state.stats.ascensions >= I.foundAtAscensions;
}

export function institutePerks() {
  return I.perks;
}

/** Can the player found/expand this wing now? (revealed, unowned, prereq met, affordable). */
export function canBuyInstitute(state: GameState, id: string): boolean {
  if (!instituteUnlocked(state)) return false;
  const def = BY_ID.get(id);
  if (!def || state.institute.includes(id)) return false;
  if (def.requires && !state.institute.includes(def.requires)) return false;
  return grantsAvailable(state) >= def.cost;
}

/** Found a wing: record ownership (spend is derived). Pure; no-op if not allowed. */
export function buyInstitute(state: GameState, id: string): GameState {
  if (!canBuyInstitute(state, id)) return state;
  return { ...state, institute: [...state.institute, id] };
}

// ---------- Fellowships: the Institute's infinite tail (see balance/institute.ts) ----------

const F = I.fellowships;

/** True once EVERY wing is founded — the Fellowship gate. False for the sim forever. */
export function fellowshipsUnlocked(state: GameState): boolean {
  return I.enabled && F.enabled && I.perks.every((p) => state.institute.includes(p.id));
}

/** Grant cost of the NEXT chair (escalating: base × growth^n). */
export function fellowshipCost(state: GameState): number {
  return Math.ceil(F.baseCost * Math.pow(F.growth, Math.max(0, state.instituteFellowships)));
}

/** Total Grants to reach `n` chairs — used by grantsSpent and by save reconciliation,
 *  so a crafted `instituteFellowships` forces a matching spend (same anti-cheat policy
 *  as the wings, the perk tree and the Endowment). */
export function fellowshipCostSum(n: number): number {
  const lvl = Math.max(0, Math.min(F.maxLevel, Math.floor(n || 0)));
  let sum = 0;
  for (let k = 0; k < lvl; k++) sum += Math.ceil(F.baseCost * Math.pow(F.growth, k));
  return sum;
}

export function canEndowFellowship(state: GameState): boolean {
  if (!fellowshipsUnlocked(state) || state.instituteFellowships >= F.maxLevel) return false;
  return grantsAvailable(state) >= fellowshipCost(state);
}

/** Endow one chair. Pure; no-op if not allowed. Spend stays DERIVED (via grantsSpent). */
export function endowFellowship(state: GameState): GameState {
  if (!canEndowFellowship(state)) return state;
  return { ...state, instituteFellowships: state.instituteFellowships + 1 };
}

/** The name of chair `n` (1-based). Cycles with a numbered suffix past the list end so
 *  a very deep player still gets a stable, distinct name rather than a repeat. */
export function fellowName(n: number): string {
  const i = Math.max(1, Math.floor(n)) - 1;
  const base = F.names[i % F.names.length]!;
  const cycle = Math.floor(i / F.names.length);
  return cycle === 0 ? base : `${base} ${["", "II", "III", "IV", "V"][cycle] ?? `(${cycle + 1})`}`;
}

/** Permanent all-lane multiplier from endowed chairs (1 at 0 — identity). */
export function fellowshipMult(state: GameState): number {
  return 1 + Math.max(0, state.instituteFellowships) * F.perLevel;
}

/** Owned Institute lane multipliers (all 1.0 with none founded). */
export function instituteMods(state: GameState): { computeMult: number; dataMult: number; moneyMult: number } {
  let computeMult = 1, dataMult = 1, moneyMult = 1;
  if (!I.enabled) return { computeMult, dataMult, moneyMult };
  for (const id of state.institute) {
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
  // Endowed chairs are a flat all-lane multiplier on top of the wings.
  const fm = fellowshipMult(state);
  return { computeMult: computeMult * fm, dataMult: dataMult * fm, moneyMult: moneyMult * fm };
}
