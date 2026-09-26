import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Settings actions when the device refuses a storage write (quota full, storage
 * blocked). Both used to leave the lab in a state the sheet didn't describe:
 *  - Restore replaced the running lab with the backup, then reported "That backup
 *    didn't look valid" because the write threw; the next launch brought the old save
 *    back, so everything played in between was lost.
 *  - Hard Reset threw out of the confirm handler before touching the lab, so "Wipe it"
 *    did nothing at all.
 */

const SAVE_KEY = "singularity.save.v1";

function veteranLab(): GameState {
  const s = createInitialState();
  s.prestige = { legacyWeights: Big.of(500), ships: 7 };
  s.resources = { compute: Big.of(1e9), data: Big.of(1e9), money: Big.of(1e9) };
  return s;
}

let store: Record<string, string>;
let prevStorage: unknown;
let failWrites = false;

beforeEach(() => {
  store = {};
  failWrites = false;
  prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const quota = () => { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; return e; };
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { if (failWrites) throw quota(); store[k] = v; },
    removeItem: (k: string) => { if (failWrites) throw quota(); delete store[k]; },
  };
  useGame.setState({ game: veteranLab(), savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
});

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
});

describe("storage refuses a write", () => {
  it("a Restore that cannot be saved leaves the running lab alone", () => {
    const backup = createInitialState();
    backup.prestige = { legacyWeights: Big.of(3), ships: 1 };
    const blob = serialize(backup);
    failWrites = true;
    const ok = useGame.getState().importSave(blob);
    expect(ok).toBe(false);
    // The sheet says the restore failed, so the lab must still be the player's own.
    expect(useGame.getState().game.prestige.ships).toBe(7);
  });

  it("a Restore that saves still replaces the lab", () => {
    const backup = createInitialState();
    backup.prestige = { legacyWeights: Big.of(3), ships: 1 };
    expect(useGame.getState().importSave(serialize(backup))).toBe(true);
    expect(useGame.getState().game.prestige.ships).toBe(1);
    expect(JSON.parse(store[SAVE_KEY]!).prestige.ships).toBe(1);
  });

  it("Hard Reset still wipes the lab when storage throws", () => {
    failWrites = true;
    expect(() => useGame.getState().hardReset()).not.toThrow();
    expect(useGame.getState().game.prestige.ships).toBe(0);
  });
});
