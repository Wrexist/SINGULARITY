/**
 * Return reminders — the one honest re-engagement hook (POST_LAUNCH / audit: the
 * single highest-leverage retention lever the game was missing). ONE local
 * notification, fired only when the offline cap fills (i.e. your lab is genuinely
 * at capacity and further idle time is wasted), and only for a lab that actually
 * produces something. No streaks, no FOMO, no "we miss you" nagging — it respects
 * the player's time (GDD §6), which is itself the retention driver.
 *
 * Opt-in and OS-gated: it does nothing until the player enables the toggle AND
 * grants permission. Native-only (Capacitor LocalNotifications); a safe no-op on
 * web and anywhere the plugin is unavailable — reminders must never break the game.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/** Fixed id so a fresh schedule always replaces the previous pending reminder. */
const REMINDER_ID = 4207;

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Is the return-reminder feature usable on this platform at all? */
export function remindersSupported(): boolean {
  return isNative();
}

/** Request OS permission (shows the system prompt on first ask). Returns whether
 *  reminders are now allowed. No-op → false off-device. */
export async function ensureReminderPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === "granted") return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch {
    return false;
  }
}

/**
 * Schedule the single return reminder `capHours` from now — call this when the app
 * goes to the background. Silently cancels any existing one first (so leaving twice
 * doesn't stack). No-op unless native + already permitted + the lab is producing.
 */
export async function scheduleReturnReminder(capHours: number, producing: boolean): Promise<void> {
  if (!isNative() || !producing || !Number.isFinite(capHours) || capHours <= 0) return;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return;
    const at = new Date(Date.now() + capHours * 3_600_000);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REMINDER_ID,
          title: "Singularity Inc.",
          body: "Your lab's at capacity — the racks are full and the numbers are waiting. Come collect.",
          schedule: { at },
        },
      ],
    });
  } catch {
    /* never let a reminder break the game */
  }
}

/** Cancel the pending reminder — call this when the app returns to the foreground
 *  (they're back; no need to nag) or when the toggle is turned off. */
export async function cancelReturnReminder(): Promise<void> {
  if (!isNative()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch {
    /* ignore */
  }
}
