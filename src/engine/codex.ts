import { codex as C, type CodexEntry } from "./balance/codex";
import { collectionProgress } from "./cosmetics";
import type { GameState } from "./types";

/**
 * Field Notes (Codex) engine — pure. Each entry is unlocked when a lifetime stat
 * crosses its threshold, so the whole collection is DERIVED from `state.stats`
 * (nothing to persist or migrate). Deterministic; safe per render.
 */

export { C as codexBalance };

export function codexMetricValue(state: GameState, metric: CodexEntry["metric"]): number {
  const s = state.stats;
  switch (metric) {
    case "totalShips": return s.totalShips;
    case "ascensions": return s.ascensions;
    case "openSourceShips": return s.openSourceShips;
    case "productsLaunched": return s.productsLaunched;
    case "employeesHired": return s.employeesHired;
    case "peakComputePerSec": return s.peakComputePerSec.toNumber();
    case "peakMau": return s.peakMau;
    case "peakMrr": return s.peakMrr;
    case "worldEventsResolved": return s.worldEventsResolved;
    case "peakResearchCount": return s.peakResearchCount;
    // contractsCompleted persists across prestige and only ever grows, and the legacy
    // tree is permanent — both are already monotonic. rivalsBeaten can FALL (rank slips),
    // so the codex reads the best-so-far stat instead, keeping unlocks one-way.
    case "contractsCompleted": return state.contracts.completed.length;
    case "rivalsBeaten": return state.stats.bestRivalsBeaten;
    case "legacyInvested": return state.legacyInvestments.length;
    // Hall themes earned by play (R6.3) — monotonic (reads lifetime stats), premium excluded.
    case "themesUnlocked": return collectionProgress(state, false).owned;
  }
}

export function codexUnlocked(state: GameState, entry: CodexEntry): boolean {
  return codexMetricValue(state, entry.metric) >= entry.threshold;
}

export interface CodexView {
  entry: CodexEntry;
  unlocked: boolean;
}

/** All entries with unlock state, unlocked ones first (in definition order). */
export function codexEntries(state: GameState): CodexView[] {
  const views = C.entries.map((entry) => ({ entry, unlocked: codexUnlocked(state, entry) }));
  return [...views.filter((v) => v.unlocked), ...views.filter((v) => !v.unlocked)];
}

export function codexUnlockedCount(state: GameState): number {
  return C.entries.reduce((n, e) => n + (codexUnlocked(state, e) ? 1 : 0), 0);
}
