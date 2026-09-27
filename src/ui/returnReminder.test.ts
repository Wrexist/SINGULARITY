import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The one return reminder ("Your lab's at capacity ... Come collect") must never be left
 * pending while the player is in the app: the Capacitor plugin presents a local
 * notification in the FOREGROUND too (alert + sound), so a stale one lands as a banner
 * over live play.
 *
 *  - Leaving and coming straight back: scheduling awaits a permission check, so the
 *    return's cancel ran first and the schedule landed after it, pending for hours.
 *  - A cold launch (iOS killed the suspended app, the common case) fires no
 *    visibilitychange, so the reminder set when the player last left was never cancelled.
 */

type Pending = Map<number, unknown>;

function fakeNotifications() {
  const pending: Pending = new Map();
  let releasePerm: (() => void) | null = null;
  let gatePerm = false;
  const api = {
    async checkPermissions() {
      if (gatePerm) await new Promise<void>((r) => { releasePerm = r; });
      return { display: "granted" };
    },
    async requestPermissions() { return { display: "granted" }; },
    async schedule(o: { notifications: Array<{ id: number }> }) { for (const n of o.notifications) pending.set(n.id, n); },
    async cancel(o: { notifications: Array<{ id: number }> }) { for (const n of o.notifications) pending.delete(n.id); },
  };
  return {
    api,
    pending,
    gate() { gatePerm = true; },
    release() { gatePerm = false; releasePerm?.(); },
  };
}

function fakeDocument(state: "visible" | "hidden") {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: state,
    addEventListener: (_t: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_t: string, fn: () => void) => { listeners.delete(fn); },
  };
  return {
    doc,
    set(s: "visible" | "hidden") { doc.visibilityState = s; for (const fn of listeners) fn(); },
  };
}

async function load(fake: ReturnType<typeof fakeNotifications>) {
  vi.resetModules();
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
  vi.doMock("@capacitor/local-notifications", () => ({ LocalNotifications: fake.api }));
  return import("./notifications");
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

afterEach(() => {
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@capacitor/local-notifications");
  delete (globalThis as Record<string, unknown>).document;
});

describe("return reminder lifecycle", () => {
  it("a quick leave-and-return leaves nothing pending", async () => {
    const fake = fakeNotifications();
    const n = await load(fake);
    fake.gate(); // the permission check is still in flight when the player comes back
    const leaving = n.scheduleReturnReminder(8, true);
    await n.cancelReturnReminder();
    fake.release();
    await leaving;
    await flush();
    expect(fake.pending.size).toBe(0);
  });

  it("a cold launch cancels the reminder set when the player last left", async () => {
    const fake = fakeNotifications();
    const n = await load(fake);
    await n.scheduleReturnReminder(8, true); // set by the previous session, then the app was killed
    expect(fake.pending.size).toBe(1);
    const d = fakeDocument("visible");
    (globalThis as Record<string, unknown>).document = d.doc;
    const stop = n.watchReturnReminders(() => ({ enabled: true, capHours: 8, producing: true }));
    await flush();
    expect(fake.pending.size).toBe(0);
    // ...and still schedules on leave / cancels on return afterwards.
    d.set("hidden");
    await flush();
    expect(fake.pending.size).toBe(1);
    d.set("visible");
    await flush();
    expect(fake.pending.size).toBe(0);
    stop();
  });

  it("leaves nothing scheduled while reminders are off", async () => {
    const fake = fakeNotifications();
    const n = await load(fake);
    const d = fakeDocument("visible");
    (globalThis as Record<string, unknown>).document = d.doc;
    const stop = n.watchReturnReminders(() => ({ enabled: false, capHours: 8, producing: true }));
    d.set("hidden");
    await flush();
    expect(fake.pending.size).toBe(0);
    stop();
  });

  it("fires when the cap actually fills, not while the clock guard is still paying nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const T = 1_800_000_000_000;
      vi.setSystemTime(T);
      const fake = fakeNotifications();
      const n = await load(fake);
      const d = fakeDocument("visible");
      (globalThis as Record<string, unknown>).document = d.doc;
      // The phone's clock was 3 hours ahead and has been corrected: the lab earns
      // nothing for 3 hours, so an 8-hour cap fills 11 hours from now, not 8.
      const stop = n.watchReturnReminders(() => ({ enabled: true, capHours: 8, producing: true, accruesFrom: T + 3 * 3_600_000 }));
      d.set("hidden");
      await flush();
      const at = (fake.pending.get(4207) as { schedule: { at: Date } }).schedule.at.getTime();
      expect(at).toBe(T + 11 * 3_600_000);
      stop();
      // An honest clock (or a stale value in the past) still means cap hours from now.
      await n.scheduleReturnReminder(8, true, T - 5_000);
      expect((fake.pending.get(4207) as { schedule: { at: Date } }).schedule.at.getTime()).toBe(T + 8 * 3_600_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
