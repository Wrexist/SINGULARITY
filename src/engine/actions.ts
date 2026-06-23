import { Big } from "./math/Big";
import { balance, type UpgradeDef, type ResearchDef } from "./balance/config";
import { derive } from "./derive";
import type { GameState } from "./types";

/**
 * Pure state transitions for player actions. Each returns a NEW state (or the
 * same reference if the action was a no-op, e.g. unaffordable). The UI calls
 * these through the store; it never mutates state directly.
 */

const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(
  balance.upgrades.map((u) => [u.id, u]),
);
const RESEARCH_BY_ID: Record<string, ResearchDef> = Object.fromEntries(
  balance.research.map((r) => [r.id, r]),
);

// ---------- Training run ----------

/** Spend Compute to start a run. No-op if one is active/ready or you can't afford it. */
export function startRun(state: GameState): GameState {
  if (state.run.active || state.run.readyToClaim) return state;
  const d = derive(state);
  if (state.resources.compute.lt(d.runComputeCost)) return state;
  return {
    ...state,
    resources: { ...state.resources, compute: state.resources.compute.sub(d.runComputeCost) },
    run: { active: true, progress: 0, readyToClaim: false },
  };
}

/** Claim a finished run's Data + Money payout. No-op if nothing is ready. */
export function claimRun(state: GameState): GameState {
  if (!state.run.readyToClaim) return state;
  const d = derive(state);
  return {
    ...state,
    resources: {
      ...state.resources,
      data: state.resources.data.add(d.runDataYield),
      money: state.resources.money.add(d.runMoneyYield),
    },
    lifetimeMoney: state.lifetimeMoney.add(d.runMoneyYield),
    run: { active: false, progress: 0, readyToClaim: false },
  };
}

// ---------- Upgrades ----------

/** Cost of the next level of an upgrade: base * growth^owned. */
export function upgradeCost(def: UpgradeDef, owned: number): Big {
  return Big.of(def.cost.base).mul(Math.pow(def.cost.growth, owned));
}

export function canBuyUpgrade(state: GameState, id: string): boolean {
  const def = UPGRADE_BY_ID[id];
  if (!def) return false;
  const owned = state.upgrades[id] ?? 0;
  if (owned >= def.max) return false;
  return state.resources[def.cost.resource].gte(upgradeCost(def, owned));
}

export function buyUpgrade(state: GameState, id: string): GameState {
  if (!canBuyUpgrade(state, id)) return state;
  const def = UPGRADE_BY_ID[id]!;
  const owned = state.upgrades[id] ?? 0;
  const cost = upgradeCost(def, owned);
  return {
    ...state,
    resources: {
      ...state.resources,
      [def.cost.resource]: state.resources[def.cost.resource].sub(cost),
    },
    upgrades: { ...state.upgrades, [id]: owned + 1 },
  };
}

// ---------- Research ----------

export function researchAvailable(state: GameState, id: string): boolean {
  const def = RESEARCH_BY_ID[id];
  if (!def) return false;
  if (state.research.includes(id)) return false;
  return def.requires.every((req) => state.research.includes(req));
}

export function canBuyResearch(state: GameState, id: string): boolean {
  const def = RESEARCH_BY_ID[id];
  if (!def || !researchAvailable(state, id)) return false;
  return (
    state.resources.compute.gte(def.cost.compute) &&
    state.resources.data.gte(def.cost.data)
  );
}

export function buyResearch(state: GameState, id: string): GameState {
  if (!canBuyResearch(state, id)) return state;
  const def = RESEARCH_BY_ID[id]!;
  return {
    ...state,
    resources: {
      ...state.resources,
      compute: state.resources.compute.sub(def.cost.compute),
      data: state.resources.data.sub(def.cost.data),
    },
    research: [...state.research, id],
  };
}
