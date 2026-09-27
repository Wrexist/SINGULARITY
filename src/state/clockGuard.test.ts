import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame, claimWallTime, guardedDay, offlineAccruesFrom } from "./store";
import { loopDelta, MARK_TRUST_MS } from "./clockGuard";
import { dailyAvailable, markDailyClaimed } from "../ui/daily";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import { contracts as CONTRACTS } from "../engine/balance/contracts";
import { sponsorView } from "../engine/contracts";

/**
 * Offline clock guard (round 8, owner-approved). Setting the device clock forward,
 * then back, then forward again used to re-earn the same offline window, and
 * re-open the Daily Boost (and roll the sponsor back) for a day already claimed.
 * Offline time is now credited only beyond the latest wall time the app has seen,
 * and the dailies key off that guarded day.
 */
const SAVE_KEY = "singularity.save.v1";
const TIME_KEY = "singularity.lastSeen.v1";
const H = 3_600_000;
const DAY = 24 * H;
/** Mid-morning (UTC) of an arbitrary day, so ±hours stay on the same day. */
const T0 = 20_000 * DAY + 9 * H;

let storage: Record<string, string>;
let prevStorage: unknown;

beforeEach(() => {
  storage = {};
  prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
  vi.useRealTimers();
});

const S = () => useGame.getState();
const playtime = () => S().game.stats.playtimeSec;

/** A fresh install that has just been played and closed at `at`. */
function installAt(at: number) {
  vi.setSystemTime(at);
  const s = createInitialState();
  s.upgrades = { rack_basic: 5 };
  storage = {};
  storage[SAVE_KEY] = serialize(s);
  storage[TIME_KEY] = String(at);
  S().init();
}

/** Close the app (it saves), set the device clock to `at`, and cold-launch it. */
function relaunchAt(at: number): number {
  S().save();
  vi.setSystemTime(at);
  const before = playtime();
  S().init();
  return playtime() - before; // seconds of offline time credited
}

/** One live loop interval, as useGameLoop runs it: `perfMs` of monotonic time, the
 *  device clock now reading `at` (its previous reading was `from`). */
function loopTick(from: number, at: number, perfMs = 100): number {
  vi.setSystemTime(at);
  const raw = loopDelta(perfMs, claimWallTime(from, at));
  const before = playtime();
  S().advance(raw, raw);
  return playtime() - before;
}

describe("offline clock guard — cold launches", () => {
  it("an honest resume is credited exactly as before", () => {
    installAt(T0);
    expect(relaunchAt(T0 + H)).toBeCloseTo(3600, 0);
    expect(relaunchAt(T0 + 3 * H)).toBeCloseTo(2 * 3600, 0);
  });

  it("forward, back, forward again pays the window once", () => {
    installAt(T0);
    expect(relaunchAt(T0 + 8 * H)).toBeCloseTo(8 * 3600, 0); // the jump itself: credited
    expect(relaunchAt(T0 + 60_000)).toBe(0); // clock set back: nothing
    // Forward to just past the old high: only the 2 minutes beyond it count. (It used
    // to pay the whole 8 hours again, measured from the backward stamp.)
    expect(relaunchAt(T0 + 8 * H + 120_000)).toBeCloseTo(120, 0);
  });

  it("a clock wrongly 2 days ahead, then corrected, loses at most those 2 days", () => {
    const real = T0;
    installAt(real + 2 * DAY); // played while the phone read two days ahead
    let credited = 0;
    let away = 0;
    // Corrected: launched every 2 hours of real time for three days.
    for (let t = real + 2 * H; t <= real + 3 * DAY; t += 2 * H) {
      credited += relaunchAt(t);
      away += 2 * 3600;
    }
    expect(credited).toBeGreaterThanOrEqual(away - 2 * 86_400 - 1);
    // …and once real time passes the old reading, every window is paid in full.
    expect(relaunchAt(real + 3 * DAY + 2 * H)).toBeCloseTo(2 * 3600, 0);
  });

  it("a clock years ahead, then corrected, costs at most the 7-day trust window", () => {
    const real = T0;
    installAt(real + 365 * DAY);
    let credited = 0;
    let away = 0;
    for (let t = real + 6 * H; t <= real + 8 * DAY; t += 6 * H) {
      credited += relaunchAt(t);
      away += 6 * 3600;
    }
    // All but the trust window is paid — plus the window open when the clock was
    // corrected, which read as negative time and was never paid, before the guard too.
    expect(credited).toBeGreaterThanOrEqual(away - 7 * 86_400 - 6 * 3600 - 1);
    expect(relaunchAt(real + 8 * DAY + 4 * H)).toBeCloseTo(4 * 3600, 0);
    expect(MARK_TRUST_MS).toBe(7 * DAY);
  });

  it("the return reminder's start is when offline time starts to count", () => {
    installAt(T0 + 3 * H); // the phone read 3 hours ahead
    relaunchAt(T0); // corrected
    expect(offlineAccruesFrom(T0)).toBe(T0 + 3 * H);
    // The 8-hour cap fills 11 hours after this, which is exactly what a launch pays.
    expect(relaunchAt(T0 + 11 * H)).toBeCloseTo(8 * 3600, 0);
    expect(offlineAccruesFrom(T0 + 11 * H)).toBe(T0 + 11 * H); // honest from here on
  });

  it("restoring a backup keeps the mark it was taken with", () => {
    installAt(T0);
    relaunchAt(T0 + 8 * H); // paid once
    const backup = S().exportSave();
    relaunchAt(T0); // clock set back
    S().hardReset();
    expect(S().importSave(backup)).toBe(true);
    expect(relaunchAt(T0 + 8 * H)).toBe(0); // not paid again
  });
});

describe("offline clock guard — the live loop", () => {
  it("live play runs on while the clock is behind the mark", () => {
    installAt(T0 + 2 * DAY); // wrongly ahead
    // Corrected while the app is open: the wall clock drops two days.
    let wall = T0 + 2 * DAY;
    const back = T0 + 60_000;
    expect(loopTick(wall, back)).toBeCloseTo(0.1, 5); // the monotonic 100 ms, as ever
    wall = back;
    for (let i = 0; i < 50; i++) {
      expect(loopTick(wall, wall + 100)).toBeCloseTo(0.1, 5);
      wall += 100;
    }
  });

  it("a suspend's wall time is paid once across forward-back-forward", () => {
    installAt(T0);
    // Suspended with the app open: the monotonic clock barely moved, the wall 8h.
    expect(loopTick(T0, T0 + 8 * H, 50)).toBeCloseTo(8 * 3600, 0);
    // Clock set back, then forward to the same reading.
    expect(loopTick(T0 + 8 * H, T0 + 1000, 50)).toBeCloseTo(0.05, 5);
    expect(loopTick(T0 + 1000, T0 + 8 * H + 5000, 50)).toBeCloseTo(5, 0);
  });

  it("an honest suspend is credited exactly as before", () => {
    installAt(T0);
    expect(loopTick(T0, T0 + H, 50)).toBeCloseTo(3600, 0);
    expect(loopTick(T0 + H, T0 + H + 100, 100)).toBeCloseTo(0.1, 5);
  });

  it("an autosave that fires before the loop after a suspend does not eat the window", () => {
    installAt(T0);
    loopTick(T0, T0 + 100);
    // Locked with the app open for 8 hours. On waking, both overdue timers fire: when
    // the 5-second autosave happens to be due before the 100 ms loop tick, it runs
    // first. It only saw the time; the loop must still pay the suspend.
    vi.setSystemTime(T0 + 8 * H);
    S().save();
    expect(loopTick(T0 + 100, T0 + 8 * H + 50, 50)).toBeCloseTo(8 * 3600, -1);
    // …and paid once: the clock set back and forward again pays nothing more.
    expect(loopTick(T0 + 8 * H + 50, T0 + 1000, 50)).toBeCloseTo(0.05, 5);
    expect(loopTick(T0 + 1000, T0 + 8 * H + 5000, 50)).toBeCloseTo(4.95, 0);
  });

  it("the save's mark still covers every time a save has seen", () => {
    installAt(T0);
    loopTick(T0, T0 + 100);
    vi.setSystemTime(T0 + 8 * H);
    S().save(); // the device was killed right after this save (the loop never ran)
    // Clock set back, cold launch, then forward to the same reading: nothing to pay.
    expect(relaunchAt(T0 + 60_000)).toBe(0);
    expect(relaunchAt(T0 + 8 * H + 120_000)).toBeCloseTo(120, 0);
  });
});

describe("offline clock guard — dailies", () => {
  it("the Daily Boost cannot be claimed twice for one day", () => {
    installAt(T0);
    storage["singularity.daily.v1"] = String(Math.floor(T0 / DAY)); // claimed today
    expect(dailyAvailable()).toBe(false);
    relaunchAt(T0 + DAY); // clock forward a day: tomorrow's boost
    expect(dailyAvailable()).toBe(true);
    markDailyClaimed();
    relaunchAt(T0 + H); // back to today: it used to re-open here
    expect(dailyAvailable()).toBe(false);
    relaunchAt(T0 + DAY + H); // and forward again
    expect(dailyAvailable()).toBe(false);
    relaunchAt(T0 + 2 * DAY); // a genuinely new day
    expect(dailyAvailable()).toBe(true);
  });

  it("a clock 2 days ahead locks the boost for at most those 2 days", () => {
    const realDay = Math.floor(T0 / DAY);
    installAt(T0 + 2 * DAY);
    markDailyClaimed(); // claimed while the phone read two days ahead
    relaunchAt(T0 + H); // corrected, same real day
    expect(dailyAvailable()).toBe(false);
    relaunchAt(T0 + DAY + H); // real day +1: still behind the day it claimed on
    expect(dailyAvailable()).toBe(false);
    relaunchAt(T0 + 2 * DAY + H); // real day +2: the day it claimed on
    expect(dailyAvailable()).toBe(false);
    relaunchAt((realDay + 3) * DAY + H); // real day +3: open
    expect(dailyAvailable()).toBe(true);
  });

  it("a claim dated years ahead locks the boost for at most the trust window", () => {
    installAt(T0);
    storage["singularity.daily.v1"] = String(Math.floor(T0 / DAY) + 400);
    expect(dailyAvailable()).toBe(false);
    relaunchAt(T0 + 8 * DAY + H);
    expect(dailyAvailable()).toBe(true);
  });

  it("the sponsor day does not roll back when the clock does", () => {
    const s = createInitialState();
    s.contracts = { completed: CONTRACTS.pool.map((d) => d.id) };
    s.stats.totalShips = CONTRACTS.pool.length;
    s.stats.peakMau = 1000;
    s.stats.peakMrr = 1000;
    storage = { [SAVE_KEY]: serialize(s), [TIME_KEY]: String(T0) };
    S().init();
    relaunchAt(T0 + DAY); // clock forward a day
    S().doRollSponsor(guardedDay());
    const tomorrow = S().game.sponsor!.dayKey;
    expect(tomorrow).toBe(Math.floor((T0 + DAY) / DAY));
    // Meet it and claim it.
    const sp = S().game.sponsor!;
    useGame.setState((st) => ({ game: { ...st.game, sponsor: { ...sp, target: 1 } } }));
    S().doClaimSponsor();
    expect(sponsorView(S().game)!.claimed).toBe(true);
    relaunchAt(T0 + H); // clock back to today
    S().doRollSponsor(guardedDay());
    // Still the claimed day: no fresh objective until a genuinely new day.
    expect(S().game.sponsor!.dayKey).toBe(tomorrow);
    expect(sponsorView(S().game)!.ready).toBe(false);
    relaunchAt(T0 + DAY + 2 * H);
    S().doRollSponsor(guardedDay());
    expect(sponsorView(S().game)!.claimed).toBe(true);
  });
});
