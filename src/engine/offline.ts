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
 * Describe a simulated window as a "while you were away" summary — PURE, and
 * derived entirely from the two states either side of it. It performs no tick
 * of its own, which is what lets the live-loop resume path reuse it: on iOS the
 * normal return is suspend → resume, where the game loop (not `applyOffline`)
 * already ticks the away window, clamped to the very same cap. Re-ticking there
 * to build a recap would pay the window twice; diffing the states the loop
 * already produced cannot. (2026-08 audit §1.5.)
 *
 * `elapsedMs` is the REAL time away, `appliedMs` the part actually simulated —
 * so `capped` falls out of the two.
 */
export function summarizeWindow(
  before: GameState,
  after: GameState,
  elapsedMs: number,
  appliedMs: number,
): OfflineSummary {
  // Coerce a non-finite elapsed (corrupt TIME_KEY / clock weirdness) so the
  // summary never reports NaN.
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  const applied = Number.isFinite(appliedMs) ? Math.max(0, appliedMs) : 0;
  const hadAchievements = new Set(before.achievements);
  const hadMilestones = new Set(before.products.milestones);
  const wasUpgrading = new Map(before.products.active.map((p) => [p.id, !!p.upgrade]));
  const wasTraining = new Map(before.employees.map((e) => [e.id, !!e.training]));
  return {
    elapsedMs: elapsed,
    appliedMs: applied,
    capped: elapsed > applied,
    gained: {
      compute: after.resources.compute.sub(before.resources.compute).max(0),
      data: after.resources.data.sub(before.resources.data).max(0),
      money: after.resources.money.sub(before.resources.money).max(0),
    },
    achievementsUnlocked: after.achievements.filter((id) => !hadAchievements.has(id)),
    reputationEarned: Math.max(0, earnedReputation(after) - earnedReputation(before)),
    story: {
      milestones: after.products.milestones.filter((id) => !hadMilestones.has(id)),
      upgradesFinished: after.products.active
        .filter((p) => wasUpgrading.get(p.id) && !p.upgrade)
        .map((p) => ({ name: p.name, version: p.version })),
      leveledUp: after.employees
        .filter((e) => wasTraining.get(e.id) && !e.training)
        .map((e) => ({ name: e.name, level: e.level })),
      rankBefore: playerMarketRank(before),
      rankAfter: playerMarketRank(after),
      eraBefore: currentEra(before),
      eraAfter: currentEra(after),
    },
  };
}

/**
 * Is this window worth taking over the screen for? The recap is a designed
 * reward beat, not a receipt: a momentary app-switch, or a window in which a
 * brand-new lab produced nothing at all, must never interrupt with an empty
 * "while you were away". Requires both real time away AND something to report.
 */
export function recapWorthShowing(summary: OfflineSummary): boolean {
  if (summary.appliedMs < balance.offline.recapMinMs) return false;
  const { gained, story } = summary;
  return (
    gained.compute.gt(0) ||
    gained.data.gt(0) ||
    gained.money.gt(0) ||
    summary.achievementsUnlocked.length > 0 ||
    summary.reputationEarned > 0 ||
    story.milestones.length > 0 ||
    story.upgradesFinished.length > 0 ||
    story.leveledUp.length > 0 ||
    story.eraAfter !== story.eraBefore ||
    story.rankAfter !== story.rankBefore
  );
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
  const next = tick(state, appliedMs);
  return { state: next, summary: summarizeWindow(state, next, elapsed, appliedMs) };
}
