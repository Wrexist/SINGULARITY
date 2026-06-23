/**
 * Tiny haptics abstraction. Uses the web Vibration API where available (Android
 * web). iOS Safari ignores it — in the Phase 1 Capacitor build this is the seam
 * to swap in @capacitor/haptics for real iOS taps. Always a safe no-op otherwise.
 */
function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* never let feedback break the game */
  }
}

export const haptics = {
  /** Light tick for routine taps (buy, start). */
  tap: () => vibrate(8),
  /** Positive confirmation (claim a payout). */
  success: () => vibrate([10, 30, 14]),
  /** Big moment (Ship the Model). */
  celebrate: () => vibrate([16, 40, 24, 40, 40]),
};
