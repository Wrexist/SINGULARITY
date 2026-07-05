/**
 * Tiny haptics abstraction. On device (Capacitor) it drives the native Haptics
 * plugin — the Taptic Engine on iOS, where the web Vibration API is silently
 * ignored. On the web it falls back to navigator.vibrate (Android browsers).
 * Always a safe no-op otherwise; feedback must never break the game.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { useSettings } from "./settings";

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Swallow the plugin's promise — haptics are fire-and-forget. */
const fire = (p: Promise<unknown>): void => {
  void p.catch(() => {});
};

function vibrate(pattern: number | number[]): void {
  try {
    const s = useSettings.getState();
    if (!s.haptics) return;
    // Light mode (IMPROVEMENTS #23): halve every pulse — same rhythm, softer
    // touch — for players who find celebrate-tier buzzes strong.
    const scale = (ms: number) => (s.hapticsLight ? Math.max(4, Math.round(ms * 0.5)) : ms);
    const scaled = Array.isArray(pattern) ? pattern.map(scale) : scale(pattern);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(scaled);
    }
  } catch {
    /* never let feedback break the game */
  }
}

/** Native path: semantic taps via the Taptic Engine. Light mode steps every
 *  impact down one style so the rhythm survives at a softer intensity. */
function native(kind: "tap" | "success" | "celebrate" | "warn"): void {
  try {
    const s = useSettings.getState();
    if (!s.haptics) return;
    const light = s.hapticsLight;
    switch (kind) {
      case "tap":
        fire(Haptics.impact({ style: light ? ImpactStyle.Light : ImpactStyle.Medium }));
        break;
      case "success":
        fire(Haptics.notification({ type: NotificationType.Success }));
        break;
      case "celebrate":
        // A success chord: notification + a trailing heavy tap for weight.
        fire(Haptics.notification({ type: NotificationType.Success }));
        if (!light) setTimeout(() => fire(Haptics.impact({ style: ImpactStyle.Heavy })), 90);
        break;
      case "warn":
        fire(Haptics.notification({ type: light ? NotificationType.Warning : NotificationType.Error }));
        break;
    }
  } catch {
    /* never let feedback break the game */
  }
}

const emit = (kind: "tap" | "success" | "celebrate" | "warn", pattern: number | number[]): void => {
  if (isNative()) native(kind);
  else vibrate(pattern);
};

export const haptics = {
  /** Light tick for routine taps (buy, start). */
  tap: () => emit("tap", 8),
  /** Positive confirmation (claim a payout). */
  success: () => emit("success", [10, 30, 14]),
  /** Big moment (Ship the Model). */
  celebrate: () => emit("celebrate", [16, 40, 24, 40, 40]),
  /** Something went wrong (a raid, a fine) — a heavier, blunter buzz. */
  warn: () => emit("warn", [40, 30, 40]),
};
