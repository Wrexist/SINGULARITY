import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useGame, previewBackup } from "./store";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Restoring a backup (Settings › Restore). The loader turns ANY parseable JSON into a
 * game — right for a corrupt autosave (filter, don't wipe), wrong for a restore: a
 * pasted "12345" or "null" used to preview as a valid backup of a brand-new lab, and
 * one tap on Restore replaced the player's progress with it.
 */

function veteranLab(): GameState {
  const s = createInitialState();
  s.prestige = { legacyWeights: Big.of(500), ships: 7 };
  s.resources = { compute: Big.of(1e9), data: Big.of(1e9), money: Big.of(1e9) };
  return s;
}

let store: Record<string, string>;
let prevStorage: unknown;

beforeEach(() => {
  store = {};
  prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  useGame.setState({ game: veteranLab(), savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
});

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
});

describe("restore only accepts a save", () => {
  const notSaves = ["12345", "null", "true", "[]", "[1,2,3]", "\"hello\"", "{}", "{\"a\":1}", btoa("123"), btoa("null")];

  it("a pasted number, null, array or unrelated JSON is not a backup", () => {
    for (const text of notSaves) expect(previewBackup(text), text).toBeNull();
  });

  it("restoring one leaves the current progress alone", () => {
    for (const text of notSaves) {
      expect(useGame.getState().importSave(text), text).toBe(false);
      expect(useGame.getState().game.prestige.ships).toBe(7);
    }
    expect(store["singularity.save.v1"]).toBeUndefined();
  });

  it("a real backup, base64 or raw JSON, still previews and restores", () => {
    const blob = useGame.getState().exportSave();
    const raw = serialize(veteranLab());
    expect(previewBackup(blob)?.ships).toBe(7);
    expect(previewBackup(raw)?.ships).toBe(7);

    useGame.setState({ game: createInitialState() });
    expect(useGame.getState().importSave(blob)).toBe(true);
    expect(useGame.getState().game.prestige.ships).toBe(7);
    expect(JSON.parse(store["singularity.save.v1"]!).prestige.ships).toBe(7);
  });

  it("an old save without a version field still restores", () => {
    // Pre-versioning (v0) saves carried resources but no `version`; the migration
    // chain upgrades them, so they remain restorable.
    const v0 = JSON.stringify({ resources: { compute: "5", data: "0", money: "10" }, prestige: { legacyWeights: "0", ships: 2 } });
    expect(previewBackup(v0)?.ships).toBe(2);
  });
});
