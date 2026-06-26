/**
 * Daily Boost day-tracking — UI-only (a separate localStorage key, so the
 * versioned game save is untouched). Honest by design (GDD §6): no countdown,
 * no penalty for missing a day; it's simply available again the next calendar day.
 */
const KEY = "singularity.daily.v1";

/** Local-day index (days since epoch in the device's timezone-naive UTC sense). */
function dayNumber(): number {
  return Math.floor(Date.now() / 86_400_000);
}

export function dailyAvailable(): boolean {
  try {
    return Number(localStorage.getItem(KEY) ?? "-1") !== dayNumber();
  } catch {
    return false;
  }
}

export function markDailyClaimed(): void {
  try {
    localStorage.setItem(KEY, String(dayNumber()));
  } catch {
    /* ignore */
  }
}
