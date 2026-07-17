import { products as P } from "./balance/products";
import type { GameState } from "./types";

/**
 * Flagship — cross-ship "brand memory". The player designates ONE active product as
 * the flagship; every ship it survives raises its `tenure`, and tenure grants a
 * BOUNDED permanent revenue bonus (capped at capShips × perShip). Rewards nurturing a
 * single product across generations rather than set-and-forget.
 *
 * Kept in its own module (importing only balance data + types) so `derive` can fold
 * the bonus without the products.ts → derive cycle. Curve-safe: the deploy-only sim
 * never launches a product, so it never designates a flagship — tenure stays 0 and the
 * money multiplier is identity through the whole tuned run.
 */

const F = P.flagship;

/** The effective (capped) flagship tenure — 0 with no flagship designated. */
export function flagshipTenure(state: GameState): number {
  if (!F.enabled || !state.flagship.productId) return 0;
  return Math.min(F.capShips, Math.max(0, state.flagship.tenure));
}

/** Permanent revenue multiplier from the flagship's brand (1.0 with none / tenure 0). */
export function flagshipMoneyMult(state: GameState): number {
  return 1 + flagshipTenure(state) * F.perShip;
}

/** Designate (or clear, with null) the flagship. A product id must be currently active.
 *  Switching to a different product resets tenure — a new brand starts from scratch.
 *  Pure; no-op if the id isn't an active product or it's already the flagship. */
export function setFlagship(state: GameState, id: string | null): GameState {
  if (!F.enabled) return state;
  if (id !== null && !state.products.active.some((p) => p.id === id)) return state;
  if (state.flagship.productId === id) return state;
  return { ...state, flagship: { productId: id, tenure: 0 } };
}

/** Advance the flagship across a ship (called from prestige): if the designated product
 *  is still active, bump tenure (capped); otherwise the brand is lost (reset). */
export function advanceFlagship(state: GameState): { productId: string | null; tenure: number } {
  const id = state.flagship.productId;
  const stillActive = !!id && state.products.active.some((p) => p.id === id);
  return stillActive
    ? { productId: id, tenure: Math.min(F.capShips, state.flagship.tenure + 1) }
    : { productId: null, tenure: 0 };
}
