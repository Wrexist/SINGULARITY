import { automation as A, type AutomationDef } from "./balance/automation";
import { objectiveBoard, claimObjective } from "./objectives";
import { contractBoard, claimContract } from "./contracts";
import { assignEmployee, roleMatchesSegment, roleDef } from "./employees";
import { canStartUpgrade, startUpgrade, productMetrics } from "./products";
import { products as PRODUCTS, type ProductTypeId, type SegmentSkew } from "./balance/products";
import type { GameState } from "./types";

/**
 * Automation engine (IDEAS #C) — pure & deterministic. `applyAutomation` runs the toggled-on
 * "autopilots" each tick (from the store's advance()), doing exactly what the player would do
 * by hand: claim met objectives/contracts, post idle crew to a synergy product, and start a
 * lagging product's next version when affordable. (Draft auto-launch needs id minting, so it
 * lives store-side.) Every autopilot is off by default and gated by ship count, and the sim
 * never enables one — so the tuned curve is untouched.
 */

const BY_ID = new Map(A.list.map((a) => [a.id, a]));
const SEG_BY_TYPE = Object.fromEntries(PRODUCTS.types.map((t) => [t.id, t.segment])) as Record<ProductTypeId, SegmentSkew>;

export function automationList(): AutomationDef[] {
  return A.list;
}

/** True once the whole panel reveals. */
export function automationUnlockedAny(state: GameState): boolean {
  return A.enabled && state.prestige.ships >= A.revealAtShips;
}

/** Is a specific autopilot unlocked (by ship count)? */
export function automationUnlocked(state: GameState, id: string): boolean {
  const def = BY_ID.get(id);
  return A.enabled && !!def && state.prestige.ships >= def.unlockShips;
}

/** Is it unlocked AND switched on? */
export function automationEnabled(state: GameState, id: string): boolean {
  return automationUnlocked(state, id) && !!state.automation[id];
}

/** Flip an autopilot on/off (no-op if still locked). */
export function toggleAutomation(state: GameState, id: string): GameState {
  if (!automationUnlocked(state, id)) return state;
  return { ...state, automation: { ...state.automation, [id]: !state.automation[id] } };
}

/**
 * Run the pure autopilots on the post-tick state. Cheap early-out when nothing is enabled;
 * each branch only acts when there's a real chore waiting, so most ticks are no-ops.
 */
export function applyAutomation(state: GameState): GameState {
  if (!A.enabled) return state;
  let s = state;

  if (automationEnabled(s, "auto_objectives")) {
    for (const v of objectiveBoard(s)) if (v.ready) s = claimObjective(s, v.def.id);
  }

  if (automationEnabled(s, "auto_contracts")) {
    for (const c of contractBoard(s)) if (c.ready) s = claimContract(s, c.def.id);
  }

  if (automationEnabled(s, "auto_assign") && s.products.active.length > 0) {
    // Post each idle product-team specialist to a product it synergizes with (else the first).
    for (const e of s.employees) {
      if (e.assignedProductId !== null || roleDef(e.roleId)?.team !== "product") continue;
      const match = s.products.active.find((p) => roleMatchesSegment(e.roleId, SEG_BY_TYPE[p.type] ?? "consumer"));
      const target = match ?? s.products.active[0];
      if (target) s = assignEmployee(s, e.id, target.id);
    }
  }

  if (automationEnabled(s, "auto_upgrade")) {
    // Start the next version on a product that's fallen behind rivals, if it's affordable now.
    for (const p of s.products.active) {
      if (p.upgrade) continue;
      if (productMetrics(p, s.products.frontier).qf < 0.6 && canStartUpgrade(s, p.id)) s = startUpgrade(s, p.id);
    }
  }

  return s;
}
