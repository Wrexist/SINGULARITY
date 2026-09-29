import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame, claimWallTime, guardedDay } from "./store";
import { legacyClaimDay, localDayOf, loopDelta, MAX_OFFSET_MS, sanitizeOffset, sponsorDayFor } from "./clockGuard";
import { dailyAvailable, markDailyClaimed } from "../ui/daily";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import type { GameState } from "../engine/types";
import { contracts as CONTRACTS } from "../engine/balance/contracts";
import { claimSponsor, contractsReputation, rollSponsor, sponsorView } from "../engine/contracts";

/**
 * Round 10 (owner-approved): the Daily Boost and the sponsor objective roll over at
 * the player's LOCAL midnight, and the Daily Boost's claim lives in the game save.
 *
 * Before, both keyed off UTC days: in Tokyo "a new one tomorrow" arrived at 9:00, in
 * Los Angeles at 17:00. And the claim sat in its own localStorage key, so reinstalling
 * and restoring a backup re-opened a boost already claimed that day.
 */
const SAVE_KEY = "singularity.save.v1";
const TIME_KEY = "singularity.lastSeen.v1";
const LEGACY_KEY = "singularity.daily.v1";
const H = 3_600_000;
const DAY = 24 * H;
const D = 20_000;
/** The wall time (UTC ms) of `hour` o'clock on local day `day`, `zone` hours east of UTC. */
const at = (day: number, hour: number, zone: number) => day * DAY + hour * H - zone * H;
const localDay = (t: number, zone: number) => Math.floor((t + zone * H) / DAY);

let storage: Record<string, string>;
let prevStorage: unknown;
/** The device's zone (hours east of UTC) at a given wall time. */
let zoneAt: (t: number) => number = () => 0;
const setZone = (h: number) => { zoneAt = () => h; };

beforeEach(() => {
  storage = {};
  prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  setZone(0);
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockImplementation(function (this: Date) {
    return -zoneAt(this.getTime()) * 60;
  });
});

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const S = () => useGame.getState();

function lab(): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 5 };
  return s;
}

/** A lab past the contract ladder, so the daily sponsor is offered. */
function veteran(): GameState {
  const s = lab();
  s.contracts = { completed: CONTRACTS.pool.map((d) => d.id) };
  s.stats.totalShips = CONTRACTS.pool.length;
  s.stats.peakMau = 1000;
  s.stats.peakMrr = 1000;
  return s;
}

/** The save as the previous release (v40) wrote it: no claim day inside. */
function v40(s: GameState, seen: number): string {
  const raw = JSON.parse(serialize({ ...s, clockMark: seen }));
  raw.version = 40;
  delete raw.dailyDay;
  return JSON.stringify(raw);
}

/** Cold-launch the app at `wall` on this save (and any other stored keys). */
function launch(save: string, wall: number, lastSeen: number, extra: Record<string, string> = {}) {
  storage = { [SAVE_KEY]: save, [TIME_KEY]: String(lastSeen), ...extra };
  vi.setSystemTime(wall);
  S().init();
}

function install(wall: number, s: GameState = lab()) {
  launch(serialize(s), wall, wall);
}

/** Close the app (it saves), set the clock to `wall`, and launch it again. */
function relaunchAt(wall: number) {
  S().save();
  vi.setSystemTime(wall);
  S().init();
}

const roll = () => S().doRollSponsor(guardedDay());
/** Meet today's sponsor and claim it. */
function claimTodaysSponsor() {
  const sp = S().game.sponsor!;
  useGame.setState((st) => ({ game: { ...st.game, sponsor: { ...sp, target: 1 } } }));
  S().doClaimSponsor();
}
const sponsorIds = () => S().game.contracts.completed.filter((id) => id.startsWith("sponsor_"));

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe("the Daily Boost rolls over at the player's local midnight", () => {
  it("in Tokyo, just after midnight — not at 9:00 the next morning", () => {
    setZone(9);
    install(at(D, 23, 9));
    markDailyClaimed();
    expect(dailyAvailable()).toBe(false);
    relaunchAt(at(D + 1, 0, 9) + 30 * 60_000); // 00:30 in Tokyo (15:30 UTC, still day D there)
    expect(dailyAvailable()).toBe(true);
  });

  it("in Los Angeles, not at 17:00 the same afternoon", () => {
    setZone(-7);
    install(at(D, 8, -7));
    markDailyClaimed();
    relaunchAt(at(D, 17, -7) + 30 * 60_000); // 17:30 in LA: a new UTC day, the same local one
    expect(dailyAvailable()).toBe(false);
    relaunchAt(at(D + 1, 0, -7) + 30 * 60_000);
    expect(dailyAvailable()).toBe(true);
  });

  it("across a daylight-saving change, exactly once per local day", () => {
    // Los Angeles falls back from UTC-7 to UTC-8 at 02:00 on day D, and springs
    // forward again at 02:00 on day D+2 (compressed, to cross both in one run).
    const fallBack = at(D, 2, -7);
    const springForward = at(D + 2, 2, -8);
    zoneAt = (t) => (t < fallBack || t >= springForward ? -7 : -8);
    install(at(D - 1, 12, -7));
    const claimed: number[] = [];
    for (let t = at(D - 1, 12, -7); t < at(D + 4, 12, -7); t += 20 * 60_000) {
      vi.setSystemTime(t);
      claimWallTime(t - 20 * 60_000, t);
      if (dailyAvailable()) {
        // After the first, each opens on the first check of its local day, never later.
        if (claimed.length > 0) expect((t + zoneAt(t) * H) % DAY).toBeLessThan(20 * 60_000);
        claimed.push(localDay(t, zoneAt(t)));
        markDailyClaimed();
      }
    }
    expect(claimed).toEqual([D - 1, D, D + 1, D + 2, D + 3, D + 4]);
  });
});

describe("changing the time zone never claims a day twice", () => {
  it("back and forth gains at most the two midnights the zones span, once", () => {
    setZone(-12);
    install(at(D, 11, 0)); // 23:00 on day D-1 at UTC-12
    expect(dailyAvailable()).toBe(true);
    markDailyClaimed(); // day D-1
    setZone(14); // 01:00 on day D+1 at UTC+14: a later local day
    expect(dailyAvailable()).toBe(true);
    markDailyClaimed(); // day D+1
    for (const z of [-12, 0, 9, -7, 14, -12, 14]) {
      setZone(z);
      expect(dailyAvailable()).toBe(false);
    }
    // The next one opens only once a later local day arrives, in whatever zone.
    setZone(0);
    relaunchAt(at(D + 1, 9, 0));
    expect(dailyAvailable()).toBe(false);
    setZone(14); // 23:00 on day D+1
    expect(dailyAvailable()).toBe(false);
    relaunchAt(at(D + 2, 0, 14));
    expect(dailyAvailable()).toBe(true);
  });

  for (let seed = 1; seed <= 10; seed++) {
    it(`fuzz seed ${seed}: clocks and zones moved at will`, () => {
      const r = rng(seed);
      const T0 = at(D, 9, 0);
      install(T0, veteran());
      let lastWall = T0;
      let maxWall = T0;
      const claimed: number[] = [];
      const backups: string[] = [];
      const log: string[] = [];
      for (let step = 0; step < 80; step++) {
        const t = T0 + Math.floor(r() * 5 * DAY);
        const z = Math.floor(r() * 27) - 12;
        const op = Math.floor(r() * 8);
        if (op === 0) { setZone(z); log.push(`zone ${z}`); }
        else if (op === 1) { maxWall = Math.max(maxWall, t); relaunchAt(t); lastWall = t; log.push(`relaunch @${t - T0}`); }
        else if (op === 2) {
          maxWall = Math.max(maxWall, t); vi.setSystemTime(t);
          const raw = loopDelta(100, claimWallTime(lastWall, t));
          S().advance(Math.min(raw, 8 * H), raw); lastWall = t; log.push(`tick @${t - T0}`);
        } else if (op === 3) { backups.push(S().exportSave()); log.push("export"); }
        else if (op === 4 && backups.length) {
          maxWall = Math.max(maxWall, t); vi.setSystemTime(t); lastWall = t;
          S().importSave(backups[Math.floor(r() * backups.length)]!); log.push(`import @${t - T0}`);
        } else if (op === 5 && backups.length) {
          maxWall = Math.max(maxWall, t); vi.setSystemTime(t); lastWall = t;
          S().hardReset(); S().save(); S().init();
          S().importSave(backups[Math.floor(r() * backups.length)]!); log.push(`hard reset + import @${t - T0}`);
        } else {
          maxWall = Math.max(maxWall, t); vi.setSystemTime(t);
          if (dailyAvailable()) { claimed.push(guardedDay()); markDailyClaimed(); log.push(`daily day ${guardedDay() - D} @${t - T0}`); }
          roll();
          if (S().game.sponsor && !sponsorView(S().game)!.claimed) { claimTodaysSponsor(); log.push(`sponsor ${S().game.sponsor!.dayKey - D}`); }
        }
        // Never the same local day twice: every claim is on a later day than the last.
        for (let i = 1; i < claimed.length; i++) {
          if (claimed[i]! <= claimed[i - 1]!) throw new Error(`day ${claimed[i]} claimed after ${claimed[i - 1]}\n${log.join("\n")}`);
        }
        // At most the real (UTC) days spanned, plus the two midnights the zones reach.
        const days = Math.floor(maxWall / DAY) - Math.floor(T0 / DAY) + 1;
        if (claimed.length > days + 2) throw new Error(`${claimed.length} daily claims over ${days} days\n${log.join("\n")}`);
        const sponsors = sponsorIds();
        if (new Set(sponsors).size !== sponsors.length) throw new Error(`a sponsor day paid twice\n${log.join("\n")}`);
        if (sponsors.length > days + 2) throw new Error(`${sponsors.length} sponsors over ${days} days\n${log.join("\n")}`);
      }
      expect(claimed.length).toBeGreaterThan(0); // the run did claim
    });
  }

  for (let seed = 1; seed <= 8; seed++) {
    it(`honest traveller seed ${seed}: locked out for at most the zone difference`, () => {
      const r = rng(seed);
      let wall = at(D, 9, 0);
      let zone = 0;
      install(wall);
      let claimDay = -1;
      let claimZone = 0;
      for (let step = 0; step < 120; step++) {
        if (r() < 0.1) {
          // A flight: up to 14 hours in the air, landing up to 12 zones away.
          wall += Math.floor(r() * 14 * H);
          zone = Math.max(-12, Math.min(14, zone + Math.floor(r() * 25) - 12));
          setZone(zone);
        } else {
          wall += Math.floor(r() * 5 * H);
        }
        relaunchAt(wall);
        const open = dailyAvailable();
        // Open exactly when a later local day has begun where the player is now...
        expect(open).toBe(claimDay < 0 || localDay(wall, zone) > claimDay);
        // ...which is never later than the claimed day's end plus the zones crossed west.
        const dayEnd = (claimDay + 1) * DAY - claimZone * H;
        if (claimDay >= 0 && wall >= dayEnd + Math.max(0, claimZone - zone) * H) expect(open).toBe(true);
        if (open) { markDailyClaimed(); claimDay = localDay(wall, zone); claimZone = zone; }
      }
    });
  }
});

describe("the Daily Boost's claim is kept in the save (v41)", () => {
  it("reinstalling and restoring a backup does not re-open the day", () => {
    setZone(2);
    install(at(D, 10, 2));
    markDailyClaimed();
    const backup = S().exportSave();
    expect(JSON.parse(decodeURIComponent(escape(atob(backup)))).dailyDay).toBe(D);
    // Reinstall: every key is gone, then the backup is restored the same day.
    storage = {};
    vi.setSystemTime(at(D, 11, 2));
    S().init();
    expect(S().importSave(backup)).toBe(true);
    expect(dailyAvailable()).toBe(false);
    relaunchAt(at(D + 1, 0, 2) + 60_000);
    expect(dailyAvailable()).toBe(true);
  });

  it("an older backup or a Hard Reset does not re-open it either", () => {
    install(at(D, 10, 0));
    const before = S().exportSave(); // taken before today's claim
    markDailyClaimed();
    expect(S().importSave(before)).toBe(true);
    expect(dailyAvailable()).toBe(false);
    S().hardReset();
    S().save();
    relaunchAt(at(D, 12, 0));
    expect(dailyAvailable()).toBe(false);
    expect(JSON.parse(storage[SAVE_KEY]!).dailyDay).toBe(D);
  });

  it("the old per-device key is no longer written", () => {
    install(at(D, 10, 0));
    markDailyClaimed();
    S().save();
    expect(storage[LEGACY_KEY]).toBeUndefined();
    expect(JSON.parse(storage[SAVE_KEY]!).dailyDay).toBe(D);
  });
});

describe("updating from v40 takes in the old claim — no free re-claim", () => {
  it("Tokyo, claimed in the morning: closed for the rest of that day", () => {
    setZone(9);
    const claimAt = at(D, 11, 9); // 02:00 UTC on day D
    launch(v40(lab(), claimAt + 5 * 60_000), at(D, 20, 9), claimAt + 5 * 60_000, { [LEGACY_KEY]: String(D) });
    expect(dailyAvailable()).toBe(false);
    relaunchAt(at(D + 1, 0, 9) + 10 * 60_000);
    expect(dailyAvailable()).toBe(true);
  });

  it("Tokyo, claimed after local midnight (the UTC day before): still closed", () => {
    setZone(9);
    const claimAt = at(D + 1, 1, 9); // 16:00 UTC on day D: the old key says D
    launch(v40(lab(), claimAt + 5 * 60_000), at(D + 1, 5, 9), claimAt + 5 * 60_000, { [LEGACY_KEY]: String(D) });
    expect(dailyAvailable()).toBe(false); // local day D+1 is the one claimed
    relaunchAt(at(D + 1, 23, 9));
    expect(dailyAvailable()).toBe(false);
    relaunchAt(at(D + 2, 0, 9) + 10 * 60_000);
    expect(dailyAvailable()).toBe(true);
  });

  it("Los Angeles, claimed in the evening (the next UTC day): closed until local midnight", () => {
    setZone(-7);
    const claimAt = at(D - 1, 18, -7); // 01:00 UTC on day D
    launch(v40(lab(), claimAt + 5 * 60_000), at(D - 1, 22, -7), claimAt + 5 * 60_000, { [LEGACY_KEY]: String(D) });
    expect(dailyAvailable()).toBe(false);
    relaunchAt(at(D, 0, -7) + 30 * 60_000);
    expect(dailyAvailable()).toBe(true);
  });

  it("the old key is read once, on the update: a later launch is not re-locked by it", () => {
    setZone(9);
    const claimAt = at(D, 11, 9);
    launch(v40(lab(), claimAt), at(D, 20, 9), claimAt, { [LEGACY_KEY]: String(D) });
    expect(dailyAvailable()).toBe(false);
    relaunchAt(at(D + 1, 10, 9)); // a new local day, not claimed yet
    expect(dailyAvailable()).toBe(true);
    relaunchAt(at(D + 1, 10, 9) + 30 * 60_000);
    expect(dailyAvailable()).toBe(true);
    expect(storage[LEGACY_KEY]).toBe(String(D)); // left alone, never written again
  });

  it("an update with no old claim leaves the boost open", () => {
    launch(v40(lab(), at(D, 8, 0)), at(D, 9, 0), at(D, 8, 0));
    expect(dailyAvailable()).toBe(true);
  });
});

describe("the sponsor objective rolls over at local midnight", () => {
  it("a new sponsor at Tokyo's midnight", () => {
    setZone(9);
    install(at(D, 23, 9), veteran());
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D);
    relaunchAt(at(D + 1, 0, 9) + 30 * 60_000);
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D + 1);
  });

  it("Tokyo on the update day: the UTC day's sponsor is kept, today's rolls once", () => {
    setZone(9);
    // Rolled and claimed under UTC days (the old release) for UTC day D.
    let s = rollSponsor(veteran(), D);
    s = claimSponsor({ ...s, sponsor: { ...s.sponsor!, target: 1 } });
    const completed = [...s.contracts.completed];
    const rep = contractsReputation(s);
    const seen = at(D, 20, 9);
    launch(v40(s, seen), at(D + 1, 2, 9), seen); // 17:00 UTC on day D, local day D+1
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D + 1);
    expect(sponsorView(S().game)!.claimed).toBe(false);
    expect(S().game.contracts.completed).toEqual(completed); // sponsor_D untouched
    expect(contractsReputation(S().game)).toBe(rep);
    const today = S().game.sponsor!;
    relaunchAt(at(D + 1, 10, 9)); // UTC day D+1 begins: no second roll
    roll();
    expect(S().game.sponsor).toEqual(today);
    relaunchAt(at(D + 2, 0, 9) + 10 * 60_000);
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D + 2);
  });

  it("Los Angeles on the update day: no earlier day's sponsor rolls over today's", () => {
    setZone(-7);
    let s = rollSponsor(veteran(), D); // UTC day D began at 17:00 on LA's day D-1
    s = claimSponsor({ ...s, sponsor: { ...s.sponsor!, target: 1 } });
    const completed = [...s.contracts.completed];
    const seen = at(D - 1, 18, -7);
    launch(v40(s, seen), at(D - 1, 20, -7), seen); // local day D-1
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D);
    expect(sponsorView(S().game)!.claimed).toBe(true); // still "Done today"
    expect(S().game.contracts.completed).toEqual(completed);
    relaunchAt(at(D, 9, -7)); // local day D: that sponsor was day D's
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D);
    expect(sponsorIds().filter((id) => id === `sponsor_${D}`)).toHaveLength(1);
    relaunchAt(at(D + 1, 0, -7) + 30 * 60_000);
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D + 1);
  });

  it("an unmet sponsor from the old release is not replaced on the update day", () => {
    setZone(-7);
    const s = rollSponsor(veteran(), D);
    const seen = at(D - 1, 18, -7);
    launch(v40(s, seen), at(D - 1, 20, -7), seen);
    roll();
    expect(S().game.sponsor).toEqual(s.sponsor);
  });

  it("flying west keeps today's sponsor; its claim is not re-opened", () => {
    setZone(9);
    install(at(D, 10, 9), veteran());
    roll();
    claimTodaysSponsor();
    setZone(-7); // landed in LA: local day D-1
    relaunchAt(at(D, 18, 9));
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D);
    expect(sponsorView(S().game)!.claimed).toBe(true);
    expect(sponsorIds()).toEqual([`sponsor_${D}`]);
  });

  it("a sponsor dated on a clock years ahead is replaced within the trust window", () => {
    const s = rollSponsor(veteran(), D + 365);
    install(at(D, 10, 0), s);
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D + 7); // not stuck for a year
    relaunchAt(at(D + 8, 1, 0));
    roll();
    expect(S().game.sponsor!.dayKey).toBe(D + 8);
  });
});

describe("clock guard helpers for local days", () => {
  it("a device offset is clamped to the real zones; junk reads as UTC", () => {
    expect(sanitizeOffset(9 * H)).toBe(9 * H);
    expect(sanitizeOffset(-7 * H)).toBe(-7 * H);
    expect(sanitizeOffset(40 * H)).toBe(MAX_OFFSET_MS);
    expect(sanitizeOffset(-40 * H)).toBe(-MAX_OFFSET_MS);
    expect(sanitizeOffset(Number.NaN)).toBe(0);
    expect(sanitizeOffset(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("an old UTC-day claim maps to a local day never earlier than the real one", () => {
    const r = rng(7);
    for (let i = 0; i < 5000; i++) {
      const claimAt = D * DAY + Math.floor(r() * DAY);
      const zone = Math.floor(r() * 27) - 12;
      // The old release saved at, or after, the claim: sometimes days later.
      const seen = claimAt + Math.floor(r() * (r() < 0.5 ? H : 3 * DAY));
      const mapped = legacyClaimDay(Math.floor(claimAt / DAY), seen, zone * H);
      const real = localDayOf(claimAt, zone * H);
      expect(mapped).toBeGreaterThanOrEqual(real);
      expect(mapped).toBeLessThanOrEqual(real + 1);
      // Seen the same local day as the claim: exact.
      if (localDayOf(seen, zone * H) === real && Math.floor(seen / DAY) === D) expect(mapped).toBe(real);
    }
    expect(legacyClaimDay(Number.NaN, 0, 0)).toBe(-1);
    expect(legacyClaimDay(-3, 0, 0)).toBe(-1);
  });

  it("the sponsor day never goes back within the trust window", () => {
    const wall = at(D, 12, 0);
    expect(sponsorDayFor(D, D - 1, wall, 0)).toBe(D); // zone moved west
    expect(sponsorDayFor(D, D + 1, wall, 0)).toBe(D + 1); // a new day
    expect(sponsorDayFor(-1, D, wall, 0)).toBe(D); // none yet
    expect(sponsorDayFor(D + 365, D, wall, 0)).toBe(D + 7); // far ahead: the edge
  });
});
