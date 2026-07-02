import { components as C, SLOTS_BY_TIER, type ComponentDef, type SlotClass } from "./balance/components";
import { RACK_IDS, totalRacks } from "./hall";
import type { ComponentsState, GameState } from "./types";

/**
 * Rig Bay (C1) — rack components, the store and the loadouts. Pure/deterministic:
 * no React, no clock, no RNG. Design shape (research-backed, RIG_BAY_PLAN.md):
 * components apply per rack TIER via loadout templates — one better GPU line
 * improves the whole fleet of that tier — never per individual rack.
 */

export { C as componentsBalance, SLOTS_BY_TIER };

const BY_ID = new Map(C.catalog.map((d) => [d.id, d]));

export function componentDef(id: string): ComponentDef | undefined {
  return BY_ID.get(id);
}

export function freshComponents(): ComponentsState {
  return { owned: {}, loadout: SLOTS_BY_TIER.map(() => ({})) };
}

/** The Rig Bay reveals once the hall runs a few racks (~2 minutes in). */
export function componentsUnlocked(state: GameState): boolean {
  return C.enabled && totalRacks(state) >= C.revealAtRacks;
}

/** Catalog parts visible at the current fleet size (reveal in waves, never dump).
 *  The catalog is FIXED: nothing rotates, nothing is randomized. */
export function visibleCatalog(state: GameState): ComponentDef[] {
  const racks = totalRacks(state);
  return C.catalog.filter((d) => racks >= d.revealAtRacks);
}

/** Copies of a component currently slotted across all tiers. */
export function equippedCount(state: GameState, id: string): number {
  let n = 0;
  for (const slots of state.components.loadout) {
    for (const v of Object.values(slots)) if (v === id) n++;
  }
  return n;
}

export function canBuyComponent(state: GameState, id: string): boolean {
  const def = BY_ID.get(id);
  if (!def || !componentsUnlocked(state)) return false;
  if (totalRacks(state) < def.revealAtRacks) return false;
  return state.resources.money.gte(def.cost);
}

/** Buy one physical copy into the inventory. Same-ref no-op when not allowed. */
export function buyComponent(state: GameState, id: string): GameState {
  if (!canBuyComponent(state, id)) return state;
  const def = BY_ID.get(id)!;
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.sub(def.cost) },
    components: {
      ...state.components,
      owned: { ...state.components.owned, [id]: (state.components.owned[id] ?? 0) + 1 },
    },
  };
}

/**
 * Equip an owned, un-slotted copy into a tier's slot (id = null clears the slot).
 * Slots are class-typed: an accelerator can only sit in an accelerator slot.
 * Freely re-fittable, parts are never destroyed (PCBS's #1 complaint was parts
 * you can see but can't change).
 */
export function equipComponent(state: GameState, tier: number, slot: SlotClass, id: string | null): GameState {
  const slots = SLOTS_BY_TIER[tier];
  if (!slots || !slots.includes(slot)) return state;
  const current = state.components.loadout[tier]?.[slot];
  if (id === (current ?? null)) return state;
  if (id !== null) {
    const def = BY_ID.get(id);
    if (!def || def.class !== slot) return state;
    // A copy already slotted elsewhere can't be slotted twice.
    const freeCopies = (state.components.owned[id] ?? 0) - equippedCount(state, id) + (current === id ? 1 : 0);
    if (freeCopies <= 0) return state;
  }
  const loadout = state.components.loadout.map((s, t) => {
    if (t !== tier) return s;
    const next = { ...s };
    if (id === null) delete next[slot];
    else next[slot] = id;
    return next;
  });
  return { ...state, components: { ...state.components, loadout } };
}

// ---------- Derived effects (read by derive/power) ----------

/** Multiplier on Compute output for racks of this tier (slotted accelerator). */
export function tierComputeMult(state: GameState, tier: number): number {
  const id = state.components.loadout[tier]?.accelerator;
  const def = id ? BY_ID.get(id) : undefined;
  return def?.class === "accelerator" ? def.value : 1;
}

/** Multiplier on this tier's power draw (slotted cooling; < 1 = less draw). */
export function tierPowerMult(state: GameState, tier: number): number {
  const id = state.components.loadout[tier]?.cooling;
  const def = id ? BY_ID.get(id) : undefined;
  return def?.class === "cooling" ? def.value : 1;
}

/** Total flat Data/sec from interconnects (per rack of each slotted tier). */
export function loadoutDataPerSec(state: GameState): number {
  let total = 0;
  for (let tier = 0; tier < RACK_IDS.length; tier++) {
    const id = state.components.loadout[tier]?.interconnect;
    const def = id ? BY_ID.get(id) : undefined;
    if (def?.class === "interconnect") total += def.value * (state.upgrades[RACK_IDS[tier]!] ?? 0);
  }
  return total;
}

/** 0..1 loadout fill for a tier — drives the hall's subtle visual accent. */
export function tierLoadoutFill(state: GameState, tier: number): number {
  const slots = SLOTS_BY_TIER[tier];
  if (!slots || slots.length === 0) return 0;
  let filled = 0;
  for (const s of slots) if (state.components.loadout[tier]?.[s]) filled++;
  return filled / slots.length;
}
