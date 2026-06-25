import { Big } from "./math/Big";
import { productMetrics } from "./products";
import type { LifetimeStats, ProductsState } from "./types";

/**
 * Lifetime stats (Phase 3) — pure, monotonic counters that survive prestige and
 * feed achievements / the AGI gate / lab reputation. Continuous fields accrue each
 * tick via accrueStats(); discrete counters (ships, launches, hires, events) bump
 * at their event site. Nothing here ever decreases.
 */

export function initialStats(): LifetimeStats {
  return {
    totalMoney: Big.ZERO,
    peakComputePerSec: Big.ZERO,
    peakMrr: 0,
    peakMau: 0,
    peakResearchCount: 0,
    totalShips: 0,
    totalLegacy: Big.ZERO,
    productsLaunched: 0,
    employeesHired: 0,
    worldEventsResolved: 0,
    playtimeSec: 0,
  };
}

/** Fold one tick's continuous progress into the lifetime stats (pure, monotonic). */
export function accrueStats(
  prev: LifetimeStats,
  products: ProductsState,
  researchCount: number,
  computePerSec: Big,
  earnedThisTick: Big,
  seconds: number,
): LifetimeStats {
  let mrr = 0;
  let mau = 0;
  for (const p of products.active) {
    const m = productMetrics(p, products.frontier);
    mrr += m.mrr;
    mau += m.mau;
  }
  return {
    ...prev,
    totalMoney: prev.totalMoney.add(earnedThisTick.max(Big.ZERO)),
    peakComputePerSec: prev.peakComputePerSec.max(computePerSec),
    peakMrr: Math.max(prev.peakMrr, mrr),
    peakMau: Math.max(prev.peakMau, mau),
    peakResearchCount: Math.max(prev.peakResearchCount, researchCount),
    playtimeSec: prev.playtimeSec + Math.max(0, seconds),
  };
}
