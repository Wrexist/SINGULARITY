import { Big } from "./math/Big";
import {
  balance,
  type UpgradeDef,
  type ResearchDef,
  type DataOffer,
  type HeatEvent,
  type WorldEvent,
  type WorldEventEffect,
  type StaffRole,
} from "./balance/config";
import { derive } from "./derive";
import { alignmentHeatMult } from "./alignment";
import { suspicionEventMult, regulatorIsNamed, regulatorState, clampSuspicion } from "./regulator";
import { autoResearchEnabled, researchCostMult } from "./reputation";
import { isRackId, floorFull, evictableRackFor } from "./hall";
import type { ActiveModifier, GameState } from "./types";

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
  return Big.of(def.cost.base).mul(Big.of(def.cost.growth).pow(owned)).mul(balance.difficulty.costMult);
}

export function canBuyUpgrade(state: GameState, id: string): boolean {
  const def = UPGRADE_BY_ID[id];
  if (!def) return false;
  const owned = state.upgrades[id] ?? 0;
  if (owned >= def.max) return false;
  // Racks are bound by floor space. On a full floor a higher tier can still be
  // bought by replacing a lower-tier rack in place; only when there's nothing
  // lower to evict must you expand the hall.
  if (isRackId(id) && floorFull(state) && !evictableRackFor(state, id)) return false;
  return state.resources[def.cost.resource].gte(upgradeCost(def, owned));
}

export function buyUpgrade(state: GameState, id: string): GameState {
  if (!canBuyUpgrade(state, id)) return state;
  const def = UPGRADE_BY_ID[id]!;
  const owned = state.upgrades[id] ?? 0;
  const cost = upgradeCost(def, owned);
  // Buying dark-web tools puts you on a list — a little heat each time, scaled
  // by your faction stance (accelerationist runs hotter, doomer keeps it clean).
  const heat = def.market === "darkweb"
    ? clampHeat(state.heat + balance.heat.toolBuyHeat * alignmentHeatMult(state))
    : state.heat;
  // The regulator notes every shady purchase — suspicion is a long memory (B3).
  const suspicion = def.market === "darkweb"
    ? clampSuspicion(state.suspicion + balance.regulator.perShadyBuy)
    : state.suspicion;
  const upgrades = { ...state.upgrades, [id]: owned + 1 };
  // Full floor + a higher-tier rack → upgrade in place: evict the lowest
  // lower-tier rack to free its slot (canBuyUpgrade guaranteed one exists).
  if (isRackId(id) && floorFull(state)) {
    const evict = evictableRackFor(state, id)!;
    upgrades[evict] = (upgrades[evict] ?? 0) - 1;
  }
  return {
    ...state,
    resources: {
      ...state.resources,
      [def.cost.resource]: state.resources[def.cost.resource].sub(cost),
    },
    upgrades,
    heat,
    suspicion,
  };
}

/**
 * Plan a bulk buy of `id`: how many levels you can actually buy (up to `want`,
 * or Infinity for "Max") and their total cost — honoring affordability, max
 * level, floor space and rack auto-eviction. Pure: it simulates real buys (each
 * `buyUpgrade` is cheap — no `derive`), so the plan can never diverge from what
 * `buyUpgradeBulk` does. Used by the panel to label the ×10 / Max buttons.
 */
export function planBulkUpgrade(
  state: GameState,
  id: string,
  want: number,
): { count: number; totalCost: Big; resource: UpgradeDef["cost"]["resource"] } {
  const def = UPGRADE_BY_ID[id];
  if (!def) return { count: 0, totalCost: Big.ZERO, resource: "money" };
  const cap = Math.min(want, 10000); // safety bound for low-growth infinite-max upgrades
  let s = state;
  let count = 0;
  let totalCost = Big.ZERO;
  while (count < cap && canBuyUpgrade(s, id)) {
    totalCost = totalCost.add(upgradeCost(def, s.upgrades[id] ?? 0));
    s = buyUpgrade(s, id);
    count += 1;
  }
  return { count, totalCost, resource: def.cost.resource };
}

/** Buy up to `want` levels of `id` (Infinity = as many as affordable). Stops at
 *  the first level you can't buy. No-op-safe (returns the same state if count 0). */
export function buyUpgradeBulk(state: GameState, id: string, want: number): GameState {
  const cap = Math.min(want, 10000);
  let s = state;
  let n = 0;
  while (n < cap && canBuyUpgrade(s, id)) {
    s = buyUpgrade(s, id);
    n += 1;
  }
  return s;
}

// ---------- Staff (Phase 2) ----------

const STAFF_BY_ID: Record<string, StaffRole> = Object.fromEntries(
  balance.staff.roles.map((r) => [r.id, r]),
);

/** Recruiters cut hire costs: multiplier ≤ 1 from `hireDiscount` perLevel, floored. */
export function staffHireDiscount(state: GameState): number {
  if (!balance.staff.enabled) return 1;
  let cut = 0;
  for (const role of balance.staff.roles) {
    if (role.effect.kind === "meta" && role.effect.lane === "hireDiscount") {
      cut += role.effect.perLevel * (state.upgrades[role.id] ?? 0);
    }
  }
  return Math.max(balance.staff.hireDiscountFloor, 1 - cut);
}

/** Cost to hire the next of a role: base * growth^owned, after any Recruiter discount. */
export function staffHireCost(role: StaffRole, owned: number, discount = 1): Big {
  return Big.of(role.hire.base).mul(Big.of(role.hire.growth).pow(owned)).mul(discount);
}

export function canHireStaff(state: GameState, id: string): boolean {
  const role = STAFF_BY_ID[id];
  if (!role || !balance.staff.enabled) return false;
  return state.resources.money.gte(staffHireCost(role, state.upgrades[id] ?? 0, staffHireDiscount(state)));
}

/** Hire one of a role. No-op if unaffordable. Counts live in the upgrades map. */
export function hireStaff(state: GameState, id: string): GameState {
  if (!canHireStaff(state, id)) return state;
  const role = STAFF_BY_ID[id]!;
  const owned = state.upgrades[id] ?? 0;
  const cost = staffHireCost(role, owned, staffHireDiscount(state));
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.sub(cost) },
    upgrades: { ...state.upgrades, [id]: owned + 1 },
  };
}

/** Office perks are one-time (0/1) purchases living in the upgrades map. */
export function canBuyOfficePerk(state: GameState, id: string): boolean {
  if (!balance.office.enabled) return false;
  const perk = balance.office.perks.find((p) => p.id === id);
  if (!perk || (state.upgrades[id] ?? 0) > 0) return false;
  return state.resources.money.gte(perk.cost);
}

export function buyOfficePerk(state: GameState, id: string): GameState {
  if (!canBuyOfficePerk(state, id)) return state;
  const perk = balance.office.perks.find((p) => p.id === id)!;
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.sub(perk.cost) },
    upgrades: { ...state.upgrades, [id]: 1 },
  };
}

// ---------- Research ----------

export function researchAvailable(state: GameState, id: string): boolean {
  const def = RESEARCH_BY_ID[id];
  if (!def) return false;
  if (state.research.includes(id)) return false;
  if (!def.requires.every((req) => state.research.includes(req))) return false;
  // Mutually-exclusive: locked once a sibling in the same group is owned (R-depth).
  if (def.exclusiveGroup) {
    const siblingOwned = balance.research.some(
      (r) => r.id !== id && r.exclusiveGroup === def.exclusiveGroup && state.research.includes(r.id),
    );
    if (siblingOwned) return false;
  }
  return true;
}

/** A research node is "locked out" if a mutually-exclusive sibling was chosen. */
export function researchLockedOut(state: GameState, id: string): boolean {
  const def = RESEARCH_BY_ID[id];
  if (!def?.exclusiveGroup || state.research.includes(id)) return false;
  return balance.research.some(
    (r) => r.id !== id && r.exclusiveGroup === def.exclusiveGroup && state.research.includes(r.id),
  );
}

/** Effective research cost after the Research Fellowship reputation discount (R5.6).
 *  Mult is 1 with no perk owned, so a fresh run pays the tuned full price. */
export function researchCost(state: GameState, def: ResearchDef): { compute: Big; data: Big } {
  const mult = researchCostMult(state) * balance.difficulty.costMult;
  return {
    compute: Big.of(def.cost.compute).mul(mult),
    data: Big.of(def.cost.data).mul(mult),
  };
}

export function canBuyResearch(state: GameState, id: string): boolean {
  const def = RESEARCH_BY_ID[id];
  if (!def || !researchAvailable(state, id)) return false;
  const cost = researchCost(state, def);
  return state.resources.compute.gte(cost.compute) && state.resources.data.gte(cost.data);
}

/**
 * Auto-buy research (R5.3, gated behind the Research Director reputation perk).
 * Buys the cheapest affordable, prerequisite-met node repeatedly until none is
 * affordable. Pure; runs in tick() so it also works during offline catch-up. Does
 * exactly what an engaged player would do by hand, so it can't outrun the curve —
 * and it's off until the (deep-endgame) perk is owned, so the sim is unaffected.
 */
export function applyAutoResearch(state: GameState): GameState {
  if (!autoResearchEnabled(state)) return state;
  let s = state;
  let guard = 0;
  while (guard++ < 500) {
    const node = balance.research
      .filter((r) => canBuyResearch(s, r.id))
      .sort((a, b) => a.cost.compute + a.cost.data - (b.cost.compute + b.cost.data))[0];
    if (!node) break;
    s = buyResearch(s, node.id);
  }
  return s;
}

export function buyResearch(state: GameState, id: string): GameState {
  if (!canBuyResearch(state, id)) return state;
  const def = RESEARCH_BY_ID[id]!;
  const cost = researchCost(state, def);
  return {
    ...state,
    resources: {
      ...state.resources,
      compute: state.resources.compute.sub(cost.compute),
      data: state.resources.data.sub(cost.data),
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

  let raided = false;
  if (def.risk) {
    heat = clampHeat(state.heat + (def.heat ?? 0) * alignmentHeatMult(state));
    const raidChance = effectiveRaidChance(state, id);
    const { fine, raidDataFactor, poisonChance, poisonDataFactor } = def.risk;
    if (roll < raidChance) {
      kind = "raid";
      raided = true;
      dataGained = dataGained.mul(raidDataFactor);
      moneyLost = moneyLost.add(fine);
      heat = clampHeat(state.heat * balance.heat.postRaidHeatMult); // caught → lay low
    } else if (roll < raidChance + poisonChance) {
      kind = "poisoned";
      dataGained = dataGained.mul(poisonDataFactor);
      message = `Poisoned batch — mostly raccoon photos. Only +${dataGained.format()} data.`;
    } else {
      message = `Clean haul from the Bazaar. +${dataGained.format()} data.`;
    }
  }

  // A raid fine can exceed your balance — clamp so money never goes negative.
  const available = state.resources.money;
  if (moneyLost.gt(available)) moneyLost = available;
  let dodgeSuspicion = 0;
  if (raided) {
    // Report the fine ACTUALLY charged (cost is always affordable; the fine is
    // what the clamp may have trimmed) so the toast never overstates the hit.
    const finePaid = moneyLost.sub(def.cost).max(0);
    // Anti-exploit: a fine you dodged by being broke converts to Heat + suspicion,
    // so spending down to ~cost before every shady buy isn't a free pass.
    const dodged = Math.max(0, (def.risk?.fine ?? 0) - finePaid.toNumber());
    if (dodged > 0) {
      heat = clampHeat(heat + Math.min(balance.heat.max, dodged / balance.regulator.fineDodgeToHeat));
      dodgeSuspicion = balance.regulator.fineDodgeSuspicion;
    }
    message = `Raided! Regulators kicked the door in. Fined $${finePaid.format()}.`;
  }
  // A risky (shady) Bazaar buy is logged by the regulator — suspicion rises (B3).
  const suspicion = def.risk ? clampSuspicion(state.suspicion + balance.regulator.perShadyBuy + dodgeSuspicion) : state.suspicion;
  const next: GameState = {
    ...state,
    resources: {
      ...state.resources,
      money: available.sub(moneyLost),
      data: state.resources.data.add(dataGained),
    },
    heat,
    suspicion,
  };
  return { state: next, outcome: { kind, dataGained, moneyLost, message } };
}

// ---------- Lobbying (Money → cool Heat) ----------

/** Money cost to lobby right now — rises with current Heat (a hotter lab costs
 *  more to clean up). Big-valued (economy contract); the UI shows it live. */
export function lobbyCost(state: GameState): Big {
  return Big.of(Math.round(balance.heat.lobby.baseCost + state.heat * balance.heat.lobby.costPerHeat));
}

/** Lobbying only makes sense when you're actually warm and can afford it. The heat
 *  gate is a tunable, so it lives in balance (shared with the UI), not in logic. */
export function canLobby(state: GameState): boolean {
  return state.heat > balance.heat.lobby.minHeat && state.resources.money.gte(lobbyCost(state));
}

/** Spend Money to buy regulatory goodwill: cut Heat by a fraction. No-op-safe. */
export function lobby(state: GameState): GameState {
  if (!canLobby(state)) return state;
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.sub(lobbyCost(state)) },
    heat: clampHeat(state.heat * (1 - balance.heat.lobby.reductionFraction)),
    // Lobbying also buys down the regulator's suspicion (B3) — appease, don't just cool.
    suspicion: clampSuspicion(state.suspicion * (1 - balance.regulator.lobbyReduction)),
  };
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
  // Unknown id (stale save / typo): no-op rather than applying a DIFFERENT event's
  // fines — silently charging the wrong penalty would be a real bug.
  const def = HEAT_EVENTS.find((e) => e.id === eventId);
  if (!def) return { state, event: { id: eventId, message: "", tone: "good" } };
  const { fineFraction, dataFraction, heatMul, heatAdd, heatSet } = def.effect;
  let money = state.resources.money;
  let data = state.resources.data;
  let heat = state.heat;
  // Clamp the multiplier ≥ 0 and floor the result so a (future/tampered) fraction > 1
  // can never drive a resource negative.
  if (fineFraction) money = money.mul(Math.max(0, 1 - fineFraction)).max(Big.ZERO);
  if (dataFraction) data = data.mul(Math.max(0, 1 - dataFraction)).max(Big.ZERO);
  if (heatMul !== undefined) heat = heat * heatMul;
  if (heatAdd !== undefined) heat = heat + heatAdd;
  if (heatSet !== undefined) heat = heatSet;
  // Once the regulator escalates to a named, personal presence (B3), regulatory
  // events are signed by them — the bureaucrat becomes a recurring character.
  const message = regulatorIsNamed(state) ? `${regulatorState(state).name}: ${def.message}` : def.message;
  return {
    state: { ...state, resources: { ...state.resources, money, data }, heat: clampHeat(heat) },
    event: { id: def.id, message, tone: def.tone },
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
  // Regulator scrutiny (B3) multiplies the audit rate — a watched lab gets hit more
  // often at the same Heat. Identity at suspicion 0, so it's curve-safe.
  const chance = Math.min(
    heatFrac * balance.heat.eventChancePerSecAtMax * seconds * suspicionEventMult(state),
    balance.heat.eventChanceCap,
  );
  if (fireRoll >= chance) return null;
  return applyHeatEvent(state, pickHeatEvent(pickRoll).id);
}

// ---------- Ambient world events (satire layer, GDD Phase 1) ----------

export interface WorldEventResult {
  id: string;
  headline: string;
  body: string;
  tone: "good" | "bad";
  /** Short effect summary for the card, e.g. "+25% $" or "Compute ×1.5 · 60s". */
  summary: string;
  /** Present for faction events: the two branches to render as buttons. */
  choices?: { label: string; summary: string }[];
}

const WORLD_EVENTS = balance.worldEvents.list as WorldEvent[];

/** Events eligible at the player's current alignment (R6.2). Untagged events always
 *  qualify; a faction-tagged event only joins the pool once you've committed to that
 *  side. At neutral (incl. the sim) only untagged events are eligible → base pool. */
function eligibleWorldEvents(alignment: number): WorldEvent[] {
  const t = balance.worldEvents.factionThreshold;
  return WORLD_EVENTS.filter((e) => {
    if (!e.faction) return true;
    return e.faction === "doomer" ? alignment <= -t : alignment >= t;
  });
}

/** Effective weight of an event given recent activity — "hot topics" chaining (A2).
 *  An event whose topic matches a recently-fired event (but isn't that same event)
 *  gets a boost, so related crises cluster. Identity when nothing recent matches. */
function chainedWeight(e: WorldEvent, recentTopics: Set<string>, recentIds: Set<string>): number {
  const topic = balance.worldEvents.topics[e.id];
  if (topic && recentTopics.has(topic) && !recentIds.has(e.id)) return e.weight * balance.worldEvents.chainBoost;
  return e.weight;
}

export function pickWorldEvent(roll: number, alignment = 0, recentIds: string[] = []): WorldEvent {
  const pool = eligibleWorldEvents(alignment);
  const ids = new Set(recentIds);
  const recentTopics = new Set(
    recentIds.map((id) => balance.worldEvents.topics[id]).filter((t): t is string => !!t),
  );
  const weights = pool.map((e) => chainedWeight(e, recentTopics, ids));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let target = roll * total;
  for (let i = 0; i < pool.length; i++) {
    if (target < weights[i]!) return pool[i]!;
    target -= weights[i]!;
  }
  return pool[pool.length - 1]!;
}

const TARGET_LABEL: Record<string, string> = {
  computeMult: "Compute",
  dataMult: "Data",
  moneyMult: "Revenue",
};
const RES_LABEL: Record<string, string> = { compute: "compute", data: "data", money: "$" };

function effectSummary(effect: WorldEventEffect): string {
  if (effect.kind === "grantPct") {
    const sign = effect.pct > 0 ? "+" : "";
    return `${sign}${Math.round(effect.pct * 100)}% ${RES_LABEL[effect.resource]}`;
  }
  if (effect.kind === "frontierJump") return "Rivals leap ahead";
  if (effect.kind === "productBuzz") return `Product buzz · ${effect.durationSec}s`;
  return `${TARGET_LABEL[effect.target]} ×${effect.factor} · ${effect.durationSec}s`;
}

/** Apply one effect (immediate swing, timed modifier, or product effect). */
function applyEffect(state: GameState, effect: WorldEventEffect, id: string, tone: "good" | "bad"): GameState {
  if (effect.kind === "grantPct") {
    const { resource, pct } = effect;
    // Clamp the multiplier ≥ 0 and floor at 0 so a pct ≤ −1 (a future/tampered debuff)
    // can never produce a negative resource that poisons derive / the prestige math.
    const next = state.resources[resource].mul(Math.max(0, 1 + pct)).max(Big.ZERO);
    return { ...state, resources: { ...state.resources, [resource]: next } };
  }
  if (effect.kind === "frontierJump") {
    // Competitors advance — your shipped products fall behind (more churn).
    return { ...state, products: { ...state.products, frontier: state.products.frontier + effect.amount } };
  }
  if (effect.kind === "productBuzz") {
    // Industry hype — every live product gets a buzz wave (acquisition + churn cut).
    return {
      ...state,
      products: {
        ...state.products,
        active: state.products.active.map((p) => ({ ...p, buzzSec: Math.max(p.buzzSec, effect.durationSec) })),
      },
    };
  }
  const mod: ActiveModifier = {
    id,
    target: effect.target,
    factor: effect.factor,
    remainingSec: effect.durationSec,
    label: `${TARGET_LABEL[effect.target]} ×${effect.factor}`,
    tone,
  };
  // Refresh rather than stack a repeat of the same event.
  return { ...state, modifiers: [...state.modifiers.filter((m) => m.id !== id), mod] };
}

/**
 * Daily Boost — apply a short global output buff (compute/data/money) through the
 * normal modifier system. Temporary by construction, so it never touches the
 * permanent curve. Day-tracking lives in the UI (no save schema change).
 */
export function grantDailyBoost(state: GameState): GameState {
  const { factor, durationSec } = balance.daily;
  const targets: ActiveModifier["target"][] = ["computeMult", "dataMult", "moneyMult"];
  const mods: ActiveModifier[] = targets.map((target) => ({
    id: `daily_${target}`,
    target,
    factor,
    remainingSec: durationSec,
    label: `Daily ×${factor}`,
    tone: "good",
  }));
  return { ...state, modifiers: [...state.modifiers.filter((m) => !m.id.startsWith("daily_")), ...mods] };
}

/**
 * Fire a world event. Simple events apply their effect immediately. Faction
 * events (with `choices`) do NOT apply anything here — they wait for the player's
 * pick via applyWorldEventChoice — but surface their branches for the card.
 */
export function applyWorldEvent(state: GameState, eventId: string): { state: GameState; event: WorldEventResult } {
  const def = WORLD_EVENTS.find((e) => e.id === eventId);
  // Unknown id (stale save / typo): apply nothing rather than the wrong event.
  if (!def) return { state, event: { id: eventId, headline: "", body: "", tone: "good", summary: "" } };
  const base = { id: def.id, headline: def.headline, body: def.body, tone: def.tone };

  if (def.choices && def.choices.length > 0) {
    return {
      state, // unchanged until the player chooses
      event: { ...base, summary: "", choices: def.choices.map((c) => ({ label: c.label, summary: effectSummary(c.effect) })) },
    };
  }

  const effect = def.effect!;
  const next = applyEffect(state, effect, def.id, def.tone);
  return {
    state: { ...next, stats: { ...next.stats, worldEventsResolved: next.stats.worldEventsResolved + 1 } },
    event: { ...base, summary: effectSummary(effect) },
  };
}

/** Apply a chosen branch of a faction event: its effect + an alignment shift. */
export function applyWorldEventChoice(
  state: GameState,
  eventId: string,
  choiceIndex: number,
): { state: GameState; event: WorldEventResult } {
  const def = WORLD_EVENTS.find((e) => e.id === eventId);
  if (!def) return { state, event: { id: eventId, headline: "", body: "", tone: "good", summary: "" } };
  const choice = def.choices?.[choiceIndex];
  const base = { id: def.id, headline: def.headline, body: def.body, tone: def.tone, summary: "" };
  if (!choice) return { state, event: base };
  const next = applyEffect(state, choice.effect, def.id, def.tone);
  const alignment = Math.max(-1, Math.min(1, state.alignment + choice.alignment));
  return {
    state: { ...next, alignment, stats: { ...next.stats, worldEventsResolved: next.stats.worldEventsResolved + 1 } },
    event: { ...base, summary: effectSummary(choice.effect) },
  };
}

/**
 * Roll for an ambient world event this frame. Slow Poisson-ish rate, gated until
 * the lab is established. Two rolls passed in (fire, pick) keep the engine pure.
 */
export function maybeWorldEvent(
  state: GameState,
  seconds: number,
  fireRoll: number,
  pickRoll: number,
  recentIds: string[] = [],
): { state: GameState; event: WorldEventResult } | null {
  if (state.research.length < balance.worldEvents.minResearch) return null;
  const chance = Math.min(seconds / balance.worldEvents.meanIntervalSec, 0.4);
  if (fireRoll >= chance) return null;
  // R6.2 — pool branches on alignment; A2 — recent events bias toward related topics.
  return applyWorldEvent(state, pickWorldEvent(pickRoll, state.alignment, recentIds).id);
}
