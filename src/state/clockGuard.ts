/**
 * Offline clock guard (round 8, owner-approved). The wall clock is the only time
 * source the app has, and the player can move it. Setting it forward, then back,
 * then forward again used to pay the same offline window twice, and re-open the
 * Daily Boost and the sponsor objective for a day already claimed.
 *
 * The guard keeps a HIGH-WATER MARK: the latest wall-clock time the game has ever
 * seen (persisted in the save as `clockMark`). Offline time is credited only for
 * wall time beyond it, and the day the dailies key off is the mark's day, so a
 * clock set backwards credits nothing and does not move the mark back.
 *
 * Fair rule for honest players (a phone that was wrongly AHEAD, then corrected):
 *  - Live play never depends on the mark. The game loop runs on the monotonic
 *    clock; the mark only gates the extra wall time a suspend adds on top of it.
 *  - The mark is trusted at most MARK_TRUST_MS (7 days) ahead of the clock the
 *    device shows NOW. A clock that was off by a few hours or days (the common
 *    mistakes: a wrong day, AM/PM, a timezone) is fully guarded, and costs its
 *    owner exactly the size of the error: no offline credit and no new daily until
 *    real time catches up with it. A clock that was off by months or years (a dead
 *    clock battery, a typo in the year) costs at most 7 days, not years. (The one
 *    window open when the clock is corrected reads as negative time and is not
 *    paid; it never was, before the guard either.)
 *  - The Daily Boost's claim record is bounded the same way, so a claim made on a
 *    clock years ahead re-opens within about a week.
 *  - The trade-off, stated plainly: someone who jumps more than 7 days forward,
 *    then back, on every cycle still re-earns one capped offline window per cycle.
 *    Every smaller jump is blocked outright.
 *
 * Pure functions of the wall time passed in (the store and loop own Date.now()).
 */

export const DAY_MS = 86_400_000;

/** How far ahead of the device's current clock a remembered time is still trusted. */
export const MARK_TRUST_MS = 7 * DAY_MS;

/** The latest representable Date (ms). A saved mark past it is junk. */
const MAX_TIME_MS = 8.64e15;

/** A remembered wall time from untrusted storage: a finite, non-negative whole ms
 *  no later than the last representable Date, else 0 (no mark — the pre-guard
 *  behaviour, never a lock-out). */
export function sanitizeMark(x: unknown): number {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_TIME_MS) return 0;
  return Math.floor(n);
}

/** The part of a remembered time the guard trusts at wall time `wall`. */
export function trustedMark(mark: number, wall: number): number {
  return Math.min(mark, wall + MARK_TRUST_MS);
}

/**
 * Wall-clock ms to credit for a window that began at `from` (the last time the
 * game saw the clock) and ends at `wall`, given the high-water `mark`: only the
 * time beyond both. A clock set backwards (wall below either) credits 0.
 */
export function creditableMs(from: number, mark: number, wall: number): number {
  const anchor = trustedMark(Math.max(from, mark), wall);
  return Math.max(0, wall - anchor);
}

/** The mark after the game sees `wall`: it only moves forward, except that a mark
 *  past the trust window is pulled back to its edge (see the fair rule above). */
export function nextMark(mark: number, wall: number): number {
  return Math.max(trustedMark(mark, wall), wall);
}

/** The guarded day index (UTC days since epoch) at wall time `wall`: the day of the
 *  latest trusted time the game has seen, so turning the clock back never returns
 *  to a day already played. */
export function guardedDayOf(mark: number, wall: number): number {
  return Math.floor(nextMark(mark, wall) / DAY_MS);
}

/**
 * A once-a-day claim record read from storage, bounded by the trust window: a claim
 * dated past it (a clock that was months or years ahead) is pulled back to the
 * window's edge. The caller persists the bounded value, so its owner waits at most
 * the trust window for the next claim, not until that far-off date. Junk reads as
 * "never claimed".
 */
export function boundClaimDay(claimedDay: number, wall: number): number {
  if (!Number.isFinite(claimedDay) || claimedDay < 0) return -1;
  return Math.min(Math.floor(claimedDay), Math.floor((wall + MARK_TRUST_MS) / DAY_MS));
}

/** Whether a once-a-day reward last claimed on `claimedDay` is open again: only on a
 *  LATER guarded day, so a clock set back (or forward and back) never re-opens a day
 *  already claimed. */
export function dayOpen(claimedDay: number, mark: number, wall: number): boolean {
  return guardedDayOf(mark, wall) > boundClaimDay(claimedDay, wall);
}

/**
 * The live loop's delta for one interval: the monotonic delta, unless the wall
 * clock credits clearly more (the device slept with the app open and the monotonic
 * clock stopped). `wallCredit` is already guarded (creditableMs), so a clock moved
 * back and forward again while the app is open is never paid twice — and a clock
 * set back simply falls back to the monotonic delta, so live play runs on.
 */
export function loopDelta(perfRaw: number, wallCredit: number): number {
  return wallCredit > perfRaw + 2000 ? wallCredit : perfRaw;
}
