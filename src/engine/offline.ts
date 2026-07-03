import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { tick } from "./tick";
import { earnedReputation } from "./reputation";
import { playerMarketRank } from "./market";
import { currentEra } from "./eras";
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
  /** The STORY since last open (IMPROVEMENTS #16) — what happened, not just
   *  what accrued. All pure before/after diffs of the catch-up tick. */
  story: {
    /** Product-milestone ids reached while away. */
    milestones: string[];
    /** Products whose version upgrade finished while away. */
    upgradesFinished: { name: string; version: number }[];
    /** Specialists whose training completed while away. */
    leveledUp: { name: string; level: number }[];
    /** Market rank before/after (null = no live product). */
    rankBefore: number | null;
    rankAfter: number | null;
    /** Era index before/after (an era crossing offline is a headline). */
    eraBefore: number;
    eraAfter: number;
  };
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
  // Coerce a non-finite elapsed (corrupt TIME_KEY / clock weirdness) to 0 so the
  // summary never reports NaN and the catch-up tick is simply skipped.
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  const appliedMs = Math.max(0, Math.min(elapsed, capMs));
  const before = state.resources;
  const hadAchievements = new Set(state.achievements);
  const repBefore = earnedReputation(state);
  // Story witnesses (cheap: ids/flags only, snapshotted before the big tick).
  const hadMilestones = new Set(state.products.milestones);
  const wasUpgrading = new Map(state.products.active.map((p) => [p.id, !!p.upgrade]));
  const wasTraining = new Map(state.employees.map((e) => [e.id, !!e.training]));
  const rankBefore = playerMarketRank(state);
  const eraBefore = currentEra(state);
  const next = tick(state, appliedMs);
  return {
    state: next,
    summary: {
      // Report the coerced elapsed, and judge `capped` from it too — a non-finite
      // raw value applied 0ms, and must not read as "capped at the max, gained ~0".
      elapsedMs: elapsed,
      appliedMs,
      capped: elapsed > capMs,
      gained: {
        compute: next.resources.compute.sub(before.compute).max(0),
        data: next.resources.data.sub(before.data).max(0),
        money: next.resources.money.sub(before.money).max(0),
      },
      achievementsUnlocked: next.achievements.filter((id) => !hadAchievements.has(id)),
      reputationEarned: Math.max(0, earnedReputation(next) - repBefore),
      story: {
        milestones: next.products.milestones.filter((id) => !hadMilestones.has(id)),
        upgradesFinished: next.products.active
          .filter((p) => wasUpgrading.get(p.id) && !p.upgrade)
          .map((p) => ({ name: p.name, version: p.version })),
        leveledUp: next.employees
          .filter((e) => wasTraining.get(e.id) && !e.training)
          .map((e) => ({ name: e.name, level: e.level })),
        rankBefore,
        rankAfter: playerMarketRank(next),
        eraBefore,
        eraAfter: currentEra(next),
      },
    },
  };
}
