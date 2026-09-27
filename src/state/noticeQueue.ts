import type { FiredEvent } from "./store";

/**
 * The completion-notice backlog (achievements, milestones, version ships, level-ups,
 * Field Notes). The store drains it one notice per ~900ms so a burst reads as
 * staggered toasts. It used to be cut to six, silently dropping the 7th+ notice of a
 * burst; now every notice is kept in order. Only a runaway backlog past the cap (well
 * over a single burst — each tick already coalesces its own notices by kind) folds its
 * overflow into ONE summary notice at the tail, so the queue stays bounded and the
 * player is still told how much happened.
 */
export const NOTICE_BACKLOG_CAP = 16;

/** Summary notices carry how many notices they stand for (runtime only, never saved). */
type Queued = FiredEvent & { merged?: number };

export function enqueueNotices(queue: readonly FiredEvent[], earned: readonly FiredEvent[], cap: number = NOTICE_BACKLOG_CAP): FiredEvent[] {
  const all = [...queue, ...earned] as Queued[];
  if (all.length <= cap) return all;
  const keep = all.slice(0, Math.max(0, cap - 1));
  const rest = all.slice(keep.length);
  const count = rest.reduce((sum, x) => sum + (x.merged ?? 1), 0);
  const last = rest[rest.length - 1]!;
  const tone: FiredEvent["tone"] = rest.some((x) => x.tone === "good") ? "good" : rest.some((x) => x.tone === "bad") ? "bad" : "neutral";
  const summary: Queued = { key: last.key, message: `${count} more updates — the lab has been busy`, tone, merged: count };
  return [...keep, summary];
}
