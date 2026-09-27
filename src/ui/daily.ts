/**
 * Daily Boost day-tracking — UI-only (a separate localStorage key, so the
 * versioned game save is untouched). Honest by design (GDD §6): no countdown,
 * no penalty for missing a day; it's simply available again the next calendar day.
 *
 * The day is the offline clock guard's (clockGuard.ts): the latest day the app has
 * seen, and a claim only re-opens on a LATER one. Comparing "today != claimed day"
 * re-opened the boost every time the clock was set forward a day and back again.
 */
import { currentClockMark, guardedDay } from "../state/store";
import { boundClaimDay, dayOpen } from "../state/clockGuard";

const KEY = "singularity.daily.v1";

export function dailyAvailable(): boolean {
  try {
    const wall = Date.now();
    const raw = localStorage.getItem(KEY);
    const claimed = raw === null ? -1 : Number(raw);
    // A claim dated past the guard's trust window (a clock that was far ahead) is
    // pulled back to its edge and remembered there, so it locks for at most a week.
    const bounded = boundClaimDay(claimed, wall);
    if (raw !== null && bounded >= 0 && bounded !== claimed) localStorage.setItem(KEY, String(bounded));
    return dayOpen(bounded, currentClockMark(), wall);
  } catch {
    return false;
  }
}

export function markDailyClaimed(): void {
  try {
    localStorage.setItem(KEY, String(guardedDay()));
  } catch {
    /* ignore */
  }
}
