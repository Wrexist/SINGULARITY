import { Big } from "./math/Big";
import { achievements as DEFS, type AchievementDef, type AchMetric } from "./balance/achievements";
import { currentEra } from "./eras";
import { rivalsBeaten } from "./market";
import { collectionProgress } from "./cosmetics";
import type { GameState } from "./types";

/**
 * Achievements (Phase 3) — pure detection over the lifetime-stats store + live
 * state. Deterministic; no clock, no RNG. evaluate() returns newly-unlocked ids;
 * apply() folds them into state.achievements (which survives prestige) and reports
 * the defs so the UI can celebrate. Progress() drives the badge bars.
 */

export { DEFS as achievementDefs };

/** Current value of a metric as a Big (uniform so thresholds compare cleanly). */
export function metricValue(state: GameState, metric: AchMetric): Big {
  const s = state.stats;
  switch (metric) {
    case "peakCompute": return s.peakComputePerSec;
    case "totalMoney": return s.totalMoney;
    case "totalLegacy": return s.totalLegacy;
    case "peakMrr": return Big.of(s.peakMrr);
    case "peakMau": return Big.of(s.peakMau);
    case "productsLaunched": return Big.of(s.productsLaunched);
    case "productsSold": return Big.of(state.products.sold);
    case "liveProducts": return Big.of(state.products.active.length);
    case "peakVersion": return Big.of(state.products.active.reduce((m, p) => Math.max(m, p.version), 0));
    case "employeesHired": return Big.of(s.employeesHired);
    case "staffLevel": return Big.of(state.employees.reduce((m, e) => Math.max(m, e.level), 0));
    case "totalShips": return Big.of(s.totalShips);
    case "eraReached": return Big.of(currentEra(state));
    case "peakResearch": return Big.of(s.peakResearchCount);
    case "worldEventsResolved": return Big.of(s.worldEventsResolved);
    case "playtimeSec": return Big.of(s.playtimeSec);
    case "openSourceShips": return Big.of(s.openSourceShips);
    case "contractsDone": return Big.of(state.contracts.completed.length);
    case "legacyInvested": return Big.of(state.legacyInvestments.length);
    case "rivalsBeaten": return Big.of(rivalsBeaten(state));
    case "ascensions": return Big.of(s.ascensions);
    // Cosmetic collection (R6.3): count themes earned by PLAY (premium excluded, so it's
    // a genuine play achievement, not a purchase). Derived from monotonic lifetime stats.
    case "themesUnlocked": return Big.of(collectionProgress(state, false).owned);
  }
}

/** 0..1 progress toward an achievement's threshold (for the UI bar). */
export function achievementProgress(state: GameState, def: AchievementDef): number {
  if (def.threshold <= 0) return 1;
  const v = metricValue(state, def.metric).div(def.threshold).toNumber();
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
}

/** Ids unlocked right now that the player doesn't already hold. */
export function evaluateAchievements(state: GameState): string[] {
  const have = new Set(state.achievements);
  const out: string[] = [];
  for (const def of DEFS) {
    if (have.has(def.id)) continue;
    if (metricValue(state, def.metric).gte(Big.of(def.threshold))) out.push(def.id);
  }
  return out;
}

export interface AchievementUnlock { def: AchievementDef; }

/** Award any newly-reached achievements. Pure & idempotent. Returns the fresh
 *  unlocks so the UI can toast them. */
export function applyAchievements(state: GameState): { state: GameState; unlocked: AchievementUnlock[] } {
  const ids = evaluateAchievements(state);
  if (ids.length === 0) return { state, unlocked: [] };
  const byId = new Map(DEFS.map((d) => [d.id, d]));
  const unlocked = ids.map((id) => ({ def: byId.get(id)! })).filter((u) => u.def);
  return {
    state: { ...state, achievements: [...state.achievements, ...ids] },
    unlocked,
  };
}
