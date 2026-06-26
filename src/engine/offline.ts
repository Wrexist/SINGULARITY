import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { tick } from "./tick";
import { earnedReputation } from "./reputation";
import type { GameState } from "./types";

export interface OfflineSummary {
  /** Real time that passed since last save. */
  elapsedMs: number;
  /** Time actually simulated after clamping (the cap protects against exploits). */
  appliedMs: number;
  /** Whether the offline window was clamped to the cap. */
  capped: boolean;
  gained: {
    compute: Big;
    data: Big;
    money: Big;
  };
  /** Ids of achievements unlocked during the offline window (Phase 3). */
  achievementsUnlocked: string[];
  /** Lab Reputation points earned during the offline window. */
  reputationEarned: number;
}

/**
 * Apply offline progress on load. Offline is "just a tick with a big elapsedMs"
 * (LEARNINGS) — clamp the window so returning is a reward, not an exploit, and
 * return a summary the "while you were away" screen renders as a designed beat.
 */
export function applyOffline(
  state: GameState,
  elapsedMs: number,
  capHours: number = balance.offline.maxHours,
): {
  state: GameState;
  summary: OfflineSummary;
} {
  const capMs = capHours * 3600 * 1000;
  const appliedMs = Math.max(0, Math.min(elapsedMs, capMs));
  const before = state.resources;
  const hadAchievements = new Set(state.achievements);
  const repBefore = earnedReputation(state);
  const next = tick(state, appliedMs);
  return {
    state: next,
    summary: {
      elapsedMs,
      appliedMs,
      capped: elapsedMs > capMs,
      gained: {
        compute: next.resources.compute.sub(before.compute).max(0),
        data: next.resources.data.sub(before.data).max(0),
        money: next.resources.money.sub(before.money).max(0),
      },
      achievementsUnlocked: next.achievements.filter((id) => !hadAchievements.has(id)),
      reputationEarned: Math.max(0, earnedReputation(next) - repBefore),
    },
  };
}
