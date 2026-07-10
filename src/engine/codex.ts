import { codex as C, type CodexEntry } from "./balance/codex";
import { collectionProgress } from "./cosmetics";
import { balance } from "./balance/config";
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

/** A4 — the entry's body, re-read for the player's tenure + stance. Veteran (deep
 *  ship count) takes precedence, then a committed faction lean, else the default.
 *  Pure; falls back to `entry.body` when no variant applies. */
export function codexBody(state: GameState, entry: CodexEntry): string {
  const v = entry.variants;
  if (!v) return entry.body;
  if (v.veteran && state.stats.totalShips >= v.veteran.atShips) return v.veteran.body;
  const t = balance.worldEvents.factionThreshold;
  if (v.doomer && state.alignment <= -t) return v.doomer;
  if (v.accel && state.alignment >= t) return v.accel;
  return entry.body;
}

/** Compact number for an unlock hint (1_000_000 → "1M"). Local so codex.ts stays
 *  UI-free; the thresholds are small integers or round powers, so this is plenty. */
const compact = (n: number): string => {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(n);
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** What it takes to unlock a still-locked field note — the panel promises "locked
 *  entries show what unlocks them", but every one used to read the same placeholder.
 *  Pure; phrased per metric from the entry's own threshold. */
export function codexUnlockHint(entry: CodexEntry): string {
  const n = entry.threshold;
  switch (entry.metric) {
    case "totalShips": return `Unlocks at ${plural(n, "model")} shipped`;
    case "ascensions": return `Unlocks at ${plural(n, "AGI ascension")}`;
    case "openSourceShips": return `Unlocks after open-sourcing ${plural(n, "model")}`;
    case "productsLaunched": return `Unlocks after launching ${plural(n, "product")}`;
    case "employeesHired": return `Unlocks after hiring ${plural(n, "specialist")}`;
    case "peakComputePerSec": return `Unlocks at ${compact(n)} Compute/sec`;
    case "peakMau": return `Unlocks at ${compact(n)} total users`;
    case "peakMrr": return `Unlocks at $${compact(n)}/sec revenue`;
    case "worldEventsResolved": return `Unlocks after ${plural(n, "world event")}`;
    case "peakResearchCount": return `Unlocks with ${plural(n, "research node")} owned`;
    case "contractsCompleted": return `Unlocks after ${plural(n, "contract")}`;
    case "rivalsBeaten": return `Unlocks after outranking ${plural(n, "rival")}`;
    case "legacyInvested": return `Unlocks after ${plural(n, "Legacy investment")}`;
    case "themesUnlocked": return `Unlocks after earning ${plural(n, "hall theme")}`;
  }
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
