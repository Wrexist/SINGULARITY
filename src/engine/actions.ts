import { Big } from "./math/Big";
import { balance, type UpgradeDef, type ResearchDef, type DataOffer, type HeatEvent } from "./balance/config";
import { derive } from "./derive";
import type { GameState } from "./types";

const clampHeat = (h: number) => Math.max(0, Math.min(balance.heat.max, h));

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
const OFFER_BY_ID: Record<string, DataOffer> = Object.fromEntries(
  balance.dataMarket.map((o) => [o.id, o]),
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
  // Buying dark-web tools puts you on a list — a little heat each time.
  const heat = def.market === "darkweb" ? clampHeat(state.heat + balance.heat.toolBuyHeat) : state.heat;
  return {
    ...state,
    resources: {
      ...state.resources,
      [def.cost.resource]: state.resources[def.cost.resource].sub(cost),
    },
    upgrades: { ...state.upgrades, [id]: owned + 1 },
    heat,
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

// ---------- Data market (Money → Data) ----------

export type MarketOutcomeKind = "clean" | "poisoned" | "raid";

export interface MarketOutcome {
  kind: MarketOutcomeKind;
  dataGained: Big;
  moneyLost: Big;
  message: string;
}

export function dataOfferById(id: string): DataOffer | undefined {
  return OFFER_BY_ID[id];
}

export function canBuyDataOffer(state: GameState, id: string): boolean {
  const def = OFFER_BY_ID[id];
  if (!def) return false;
  return state.resources.money.gte(def.cost);
}

/**
 * The actual raid chance for a shady offer at the current Heat. Base chance
 * plus a linear ramp up to `raidScaleAtMax` at full Heat, clamped so the
 * raid+poison split never exceeds 1. Exported so the UI shows live odds.
 */
export function effectiveRaidChance(state: GameState, id: string): number {
  const def = OFFER_BY_ID[id];
  if (!def?.risk) return 0;
  const ramp = (state.heat / balance.heat.max) * balance.heat.raidScaleAtMax;
  const raw = def.risk.raidChance + ramp;
  return Math.min(raw, 1 - def.risk.poisonChance);
}

/**
 * Buy a data batch. Deterministic: the caller passes `roll` in [0,1) (like we
 * pass time into tick) so the engine stays pure and the risk is unit-testable.
 * Legit offers ignore the roll. Shady buys add Heat (and a raid cools you off —
 * you lay low after getting caught). Returns the next state and an outcome.
 */
export function buyDataOffer(
  state: GameState,
  id: string,
  roll: number,
): { state: GameState; outcome: MarketOutcome | null } {
  if (!canBuyDataOffer(state, id)) return { state, outcome: null };
  const def = OFFER_BY_ID[id]!;
  let dataGained = Big.of(def.data);
  let moneyLost = Big.of(def.cost);
  let kind: MarketOutcomeKind = "clean";
  let message = `Clean batch from ${def.vendor}. +${dataGained.format()} data.`;
  let heat = state.heat;

  if (def.risk) {
    heat = clampHeat(state.heat + (def.heat ?? 0));
    const raidChance = effectiveRaidChance(state, id);
    const { fine, raidDataFactor, poisonChance, poisonDataFactor } = def.risk;
    if (roll < raidChance) {
      kind = "raid";
      dataGained = dataGained.mul(raidDataFactor);
      moneyLost = moneyLost.add(fine);
      heat = clampHeat(state.heat * 0.4); // caught → lay low
      message = `🚨 Raided! Regulators kicked the door in. Fined $${Big.of(fine).format()}.`;
    } else if (roll < raidChance + poisonChance) {
      kind = "poisoned";
      dataGained = dataGained.mul(poisonDataFactor);
      message = `☠️ Poisoned batch — mostly raccoon photos. Only +${dataGained.format()} data.`;
    } else {
      message = `✅ Clean haul from the Bazaar. +${dataGained.format()} data.`;
    }
  }

  // A raid fine can exceed your balance — clamp so money never goes negative.
  const available = state.resources.money;
  if (moneyLost.gt(available)) moneyLost = available;
  const next: GameState = {
    ...state,
    resources: {
      ...state.resources,
      money: available.sub(moneyLost),
      data: state.resources.data.add(dataGained),
    },
    heat,
  };
  return { state: next, outcome: { kind, dataGained, moneyLost, message } };
}

// ---------- Regulatory Heat events ----------

export interface HeatEventResult {
  id: string;
  message: string;
  tone: "bad" | "good";
}

const HEAT_EVENTS = balance.heatEvents as HeatEvent[];
const TOTAL_EVENT_WEIGHT = HEAT_EVENTS.reduce((sum, e) => sum + e.weight, 0);

/** Pick a weighted heat event from a roll in [0,1). Pure/testable. */
export function pickHeatEvent(pickRoll: number): HeatEvent {
  let target = pickRoll * TOTAL_EVENT_WEIGHT;
  for (const e of HEAT_EVENTS) {
    if (target < e.weight) return e;
    target -= e.weight;
  }
  return HEAT_EVENTS[HEAT_EVENTS.length - 1]!;
}

/** Apply a heat event's effect to state. Pure given the event id. */
export function applyHeatEvent(state: GameState, eventId: string): { state: GameState; event: HeatEventResult } {
  const def = HEAT_EVENTS.find((e) => e.id === eventId) ?? HEAT_EVENTS[0]!;
  const { fineFraction, dataFraction, heatMul, heatAdd, heatSet } = def.effect;
  let money = state.resources.money;
  let data = state.resources.data;
  let heat = state.heat;
  if (fineFraction) money = money.mul(1 - fineFraction);
  if (dataFraction) data = data.mul(1 - dataFraction);
  if (heatMul !== undefined) heat = heat * heatMul;
  if (heatAdd !== undefined) heat = heat + heatAdd;
  if (heatSet !== undefined) heat = heatSet;
  return {
    state: { ...state, resources: { ...state.resources, money, data }, heat: clampHeat(heat) },
    event: { id: def.id, message: def.message, tone: def.tone },
  };
}

/**
 * Roll for a regulatory event this frame. Probability scales linearly with Heat
 * (zero when cold). Two rolls passed in (fire, pick) keep the engine pure — the
 * store supplies Math.random(), mirroring how the wall clock lives in the store.
 */
export function maybeHeatEvent(
  state: GameState,
  seconds: number,
  fireRoll: number,
  pickRoll: number,
): { state: GameState; event: HeatEventResult } | null {
  if (state.heat <= 0) return null;
  const heatFrac = state.heat / balance.heat.max;
  const chance = Math.min(
    heatFrac * balance.heat.eventChancePerSecAtMax * seconds,
    balance.heat.eventChanceCap,
  );
  if (fireRoll >= chance) return null;
  return applyHeatEvent(state, pickHeatEvent(pickRoll).id);
}
