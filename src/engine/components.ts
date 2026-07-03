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
 *  The catalog is FIXED: nothing rotates, nothing is randomized. Trophy parts
 *  are included once their milestone is complete (the UI also shows locked ones
 *  as visible chase targets — deterministic, never a slot pull). */
export function visibleCatalog(state: GameState): ComponentDef[] {
  const racks = totalRacks(state);
  return C.catalog.filter((d) => (d.earnedBy ? earnedSourceComplete(state, d) : racks >= d.revealAtRacks));
}

/** All trophy-part defs (for the UI's chase list and the grant fold). */
export function earnedDefs(): ComponentDef[] {
  return C.catalog.filter((d) => d.earnedBy);
}

/** True when a trophy part's source milestone is complete. */
export function earnedSourceComplete(state: GameState, def: ComponentDef): boolean {
  if (!def.earnedBy) return false;
  return def.earnedBy.kind === "contract"
    ? state.contracts.completed.includes(def.earnedBy.id)
    : state.achievements.includes(def.earnedBy.id);
}

/**
 * Grant every trophy part whose milestone is complete (one copy each).
 * Idempotent + same-ref no-op, so it can run every tick: sources (contracts /
 * achievements) persist across prestige, which also makes trophies effectively
 * permanent — a wiped loadout re-earns nothing, the part is simply still yours.
 */
export function grantEarnedComponents(state: GameState): GameState {
  let owned: Record<string, number> | null = null;
  for (const def of C.catalog) {
    if (!def.earnedBy) continue;
    if ((state.components.owned[def.id] ?? 0) > 0) continue;
    if (!earnedSourceComplete(state, def)) continue;
    owned = owned ?? { ...state.components.owned };
    owned[def.id] = 1;
  }
  if (!owned) return state;
  return { ...state, components: { ...state.components, owned } };
}

/** The trophy copies to carry through a prestige reset (loadout still clears). */
export function carryEarnedComponents(state: GameState): ComponentsState {
  const fresh = freshComponents();
  for (const def of C.catalog) {
    if (def.earnedBy && (state.components.owned[def.id] ?? 0) > 0) fresh.owned[def.id] = 1;
  }
  return fresh;
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
  if (def.earnedBy) return false; // trophies are earned, never sold
  if (totalRacks(state) < def.revealAtRacks) return false;
  return state.resources.money.gte(def.cost);
}

// ---------- Fusion (C3) ----------

/** Free (un-slotted) copies of a part. */
export function freeCopies(state: GameState, id: string): number {
  return (state.components.owned[id] ?? 0) - equippedCount(state, id);
}

/** Fusion needs `fuseCount` FREE copies (slotted parts are never consumed) and a
 *  ladder target. Trophy parts have no `fusesInto` — they never fuse away. */
export function canFuse(state: GameState, id: string): boolean {
  const def = BY_ID.get(id);
  if (!def?.fusesInto || !BY_ID.has(def.fusesInto)) return false;
  return freeCopies(state, id) >= C.fuseCount;
}

/** Combine fuseCount copies of a part into one of the next rung up its class
 *  ladder. Dupes always have value (the honest replacement for loot pity). */
export function fuseComponents(state: GameState, id: string): GameState {
  if (!canFuse(state, id)) return state;
  const def = BY_ID.get(id)!;
  const owned = { ...state.components.owned };
  owned[id] = (owned[id] ?? 0) - C.fuseCount;
  if (owned[id]! <= 0) delete owned[id];
  owned[def.fusesInto!] = (owned[def.fusesInto!] ?? 0) + 1;
  return { ...state, components: { ...state.components, owned } };
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
    // A copy already slotted elsewhere can't be slotted twice. (Re-slotting the
    // same id into the same slot is the no-op early return above.)
    if (freeCopies(state, id) <= 0) return state;
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

/** C4 matched rig: true when every slot of the tier is filled AND all parts
 *  share one grade — an all-standard budget rig counts just like an
 *  all-prototype one (rarity never gates function, it only scales it).
 *  Single-slot tiers can't match: one part isn't a "set", and a trivial match
 *  on the basic fleet turned the bonus into a hidden global buff (sim-caught:
 *  it moved first prestige by ~10 minutes). */
export function tierSetMatched(state: GameState, tier: number): boolean {
  const slots = SLOTS_BY_TIER[tier];
  if (!slots || slots.length < 2) return false;
  let grade: string | null = null;
  for (const s of slots) {
    const id = state.components.loadout[tier]?.[s];
    const def = id ? BY_ID.get(id) : undefined;
    if (!def) return false; // an empty slot breaks the set
    if (grade === null) grade = def.grade;
    else if (def.grade !== grade) return false;
  }
  return true;
}

/** Multiplier on Compute output for racks of this tier (slotted accelerator). */
export function tierComputeMult(state: GameState, tier: number): number {
  const id = state.components.loadout[tier]?.accelerator;
  const def = id ? BY_ID.get(id) : undefined;
  return def?.class === "accelerator" ? def.value : 1;
}

/** Multiplier on this tier's power draw: slotted cooling × the matched-rig set
 *  bonus (C4) — a matched loadout hums along on less power. */
export function tierPowerMult(state: GameState, tier: number): number {
  const id = state.components.loadout[tier]?.cooling;
  const def = id ? BY_ID.get(id) : undefined;
  const cool = def?.class === "cooling" ? def.value : 1;
  return tierSetMatched(state, tier) ? cool * C.setBonusPowerMult : cool;
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
