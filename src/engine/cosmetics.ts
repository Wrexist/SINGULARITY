/**
 * Cosmetic unlocks (R6.3) — PURE helpers over the cosmetic data + lifetime stats.
 * No clock, no storage, no RNG. Unlock conditions read only MONOTONIC lifetime stats,
 * so `themeUnlocked` is itself monotonic: once earned, a theme stays earned across
 * prestige and ascension (no need to persist an "unlocked set"). Cosmetic-only →
 * never folded into derive → the tuned curve is untouched.
 *
 * Premium is a UI/state concern (StoreKit), so it's passed IN as a flag — same
 * boundary as the wall clock and the RNG rolls.
 */
import { Big } from "./math/Big";
import type { GameState } from "./types";
import { themes, type CosmeticUnlock, type ThemeDef } from "./balance/cosmetics";

export { themes };

const BY_ID = new Map(themes.map((t) => [t.id, t]));

export function themeDef(id: string): ThemeDef | undefined {
  return BY_ID.get(id);
}

/** Is this unlock condition satisfied by the current progress? Pure. */
export function isUnlocked(state: GameState, isPremium: boolean, u: CosmeticUnlock): boolean {
  const s = state.stats;
  switch (u.kind) {
    case "free": return true;
    case "premium": return isPremium;
    case "ships": return s.totalShips >= u.n;
    case "ascensions": return s.ascensions >= u.n;
    case "peakCompute": return s.peakComputePerSec.gte(Big.of(u.n));
    case "totalMoney": return s.totalMoney.gte(Big.of(u.n));
    case "productsLaunched": return s.productsLaunched >= u.n;
    case "worldEvents": return s.worldEventsResolved >= u.n;
    case "playtimeHours": return s.playtimeSec >= u.n * 3600;
  }
}

/** Is a theme (by id) unlocked for this player? Unknown ids are treated as locked. */
export function themeUnlocked(state: GameState, isPremium: boolean, id: string): boolean {
  const def = BY_ID.get(id);
  return def ? isUnlocked(state, isPremium, def.unlock) : false;
}

/** How many of the collection the player owns, and the total (for an "N/M" chip). */
export function collectionProgress(state: GameState, isPremium: boolean): { owned: number; total: number } {
  let owned = 0;
  for (const t of themes) if (isUnlocked(state, isPremium, t.unlock)) owned += 1;
  return { owned, total: themes.length };
}

/** Human-readable "how to earn this" line for a LOCKED theme. Pure string mapping. */
export function unlockHint(u: CosmeticUnlock): string {
  switch (u.kind) {
    case "free": return "Available";
    case "premium": return "Premium unlock";
    case "ships": return `Ship ${u.n} models`;
    case "ascensions": return u.n === 1 ? "Ascend to AGI" : `Ascend ${u.n}×`;
    case "peakCompute": return `Reach ${compact(u.n)} Compute/s`;
    case "totalMoney": return `Earn $${compact(u.n)} all-time`;
    case "productsLaunched": return `Launch ${u.n} products`;
    case "worldEvents": return `Resolve ${u.n} world events`;
    case "playtimeHours": return `Play ${u.n} hours`;
  }
}

/** Compact magnitude for hint text (1_000_000 → "1M"). */
function compact(n: number): string {
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(n);
}
function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
