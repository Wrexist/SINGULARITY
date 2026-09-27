import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame, claimWallTime } from "./store";
import { loopDelta } from "./clockGuard";
import { dailyAvailable, markDailyClaimed } from "../ui/daily";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";

/**
 * Property fuzz for the offline clock guard, both ways round:
 *  - HONEST play (the clock only moves forward): every millisecond away is paid, on a
 *    relaunch and on a suspend alike, whatever order the autosave and the loop wake in,
 *    and the Daily Boost opens exactly once per new day.
 *  - A PLAYER MOVING THE CLOCK inside a band narrower than the trust window never earns
 *    more play time than the band's width plus the live time, and never more Daily
 *    Boosts than the days the band spans (restores and Hard Resets included).
 */
const SAVE_KEY = "singularity.save.v1";
const TIME_KEY = "singularity.lastSeen.v1";
const H = 3_600_000;
const DAY = 24 * H;
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

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function install() {
  const s = createInitialState();
  s.upgrades = { rack_basic: 5 };
  storage[SAVE_KEY] = serialize(s);
  storage[TIME_KEY] = String(T0);
  S().init();
}

/** One loop interval, as useGameLoop runs it. */
function loopTick(from: number, at: number, perfMs: number): number {
  vi.setSystemTime(at);
  const raw = loopDelta(perfMs, claimWallTime(from, at));
  S().advance(Math.min(raw, 8 * H), raw);
  return raw;
}

describe("clock guard fuzz — honest play is paid in full", () => {
  for (let seed = 1; seed <= 12; seed++) {
    it(`seed ${seed}`, () => {
      const r = rng(seed);
      install();
      let wall = T0;
      let lastWall = T0;
      let expected = playtime();
      let lastDailyDay = -1;
      const log: string[] = [];
      for (let step = 0; step < 80; step++) {
        const op = Math.floor(r() * 6);
        if (op === 0) {
          // Closed, then launched again up to 7 hours later.
          S().save();
          const gap = Math.floor(r() * 7 * H);
          wall += gap; vi.setSystemTime(wall); S().init(); lastWall = wall;
          expected += gap / 1000; log.push(`relaunch +${gap}`);
        } else if (op === 1) {
          wall += 100; loopTick(lastWall, wall, 100); lastWall = wall;
          expected += 0.1; log.push("tick");
        } else if (op === 2) {
          // Locked with the app open: saved on hide, the monotonic clock stops. On
          // waking, the autosave may run before the loop's first tick.
          S().save();
          const gap = Math.floor(r() * 7 * H) + 5000;
          wall += gap; vi.setSystemTime(wall);
          const saveFirst = r() < 0.5;
          if (saveFirst) S().save();
          const raw = loopTick(lastWall, wall, 20); lastWall = wall;
          expected += raw / 1000; log.push(`suspend +${gap}${saveFirst ? " (autosave first)" : ""} paid ${raw}`);
          if (Math.abs(raw - gap) > 50) throw new Error(`a suspend of ${gap} ms paid ${raw}\n${log.join("\n")}`);
        } else if (op === 3) {
          const day = Math.floor(wall / DAY);
          const open = dailyAvailable();
          if (open !== day > lastDailyDay) throw new Error(`daily open=${open} on day ${day}, last claimed ${lastDailyDay}\n${log.join("\n")}`);
          if (open) { markDailyClaimed(); lastDailyDay = day; }
        } else if (op === 4) {
          expect(S().importSave(S().exportSave())).toBe(true);
          expected = playtime(); log.push("export + import");
        } else {
          S().save(); log.push("save");
        }
        if (Math.abs(playtime() - expected) > 1) throw new Error(`playtime ${playtime()} vs ${expected}\n${log.join("\n")}`);
      }
    });
  }
});

describe("clock guard fuzz — moving the clock inside the trust window pays nothing twice", () => {
  for (let seed = 1; seed <= 12; seed++) {
    it(`seed ${seed}`, () => {
      const r = rng(seed);
      install();
      let lastWall = T0;
      let maxWall = T0;
      let live = 0;
      let claims = 0;
      const backups: string[] = [];
      const log: string[] = [];
      for (let step = 0; step < 60; step++) {
        const t = T0 + Math.floor(r() * 5 * DAY);
        const op = Math.floor(r() * 7);
        maxWall = Math.max(maxWall, t);
        if (op === 0) { S().save(); vi.setSystemTime(t); S().init(); lastWall = t; log.push(`relaunch @${t - T0}`); }
        else if (op === 1) { loopTick(lastWall, t, 100); live += 100; lastWall = t; log.push(`tick @${t - T0}`); }
        else if (op === 2) { backups.push(S().exportSave()); log.push("export"); }
        else if (op === 3 && backups.length) { vi.setSystemTime(t); lastWall = t; S().importSave(backups[Math.floor(r() * backups.length)]!); log.push(`import @${t - T0}`); }
        else if (op === 4 && backups.length) {
          vi.setSystemTime(t); lastWall = t;
          S().hardReset(); S().save(); S().init();
          S().importSave(backups[Math.floor(r() * backups.length)]!);
          log.push(`hard reset + import @${t - T0}`);
        } else if (op === 5) { vi.setSystemTime(t); if (dailyAvailable()) { markDailyClaimed(); claims++; log.push(`daily @${t - T0}`); } }
        else { vi.setSystemTime(t); S().save(); log.push(`save @${t - T0}`); }
        const cap = (maxWall - T0 + live) / 1000;
        if (playtime() > cap + 1) throw new Error(`playtime ${playtime()} > ${cap}\n${log.join("\n")}`);
        const days = Math.floor(maxWall / DAY) - Math.floor(T0 / DAY) + 1;
        if (claims > days) throw new Error(`${claims} daily claims over ${days} days\n${log.join("\n")}`);
      }
    });
  }
});
