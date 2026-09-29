/**
 * Daily Boost day-tracking. Honest by design (GDD §6): no countdown, no penalty for
 * missing a day; it's simply available again the next calendar day — the player's
 * own, from their local midnight.
 *
 * The day is the offline clock guard's (clockGuard.ts): the latest local day the app
 * has seen, and a claim only re-opens on a LATER one. Comparing "today != claimed
 * day" re-opened the boost every time the clock was set forward a day and back again.
 * The claim itself lives in the game save (v41, kept by the store): in its own
 * localStorage key, a reinstall that restored a backup re-opened the day.
 */
import { dailyBoostOpen, recordDailyClaim } from "../state/store";

export function dailyAvailable(): boolean {
  try {
    return dailyBoostOpen();
  } catch {
    return false;
  }
}

export function markDailyClaimed(): void {
  recordDailyClaim();
}
