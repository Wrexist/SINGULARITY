import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import { Big } from "../engine/math/Big";

/**
 * A Hard Reset (and a Restore, in the instant before its reload) swaps the whole save
 * under the running app. The App diffs the game across renders to raise its moments — a
 * Ship (ships went up), an era crossing, a new best market rank, the one-time unlock
 * lines — against baselines taken from the OLD save. After a Hard Reset the market
 * rank baseline stayed at the old lab's best (#1), so no climb in the new game was ever
 * announced that session, and every unlock line was already spent. A Restore swapped in
 * a 7-ship save and the Ship effect fired its celebration, sound, haptic and Game Center
 * push for a Ship that never happened before the page reloaded.
 *
 * The store now says when the save was REPLACED (Restore, Hard Reset) with a counter the
 * App re-takes its baselines on. Nothing else moves it: a Ship, a tick or a refused
 * restore is the same save.
 */
function veteranBackup(): string {
  const s = createInitialState();
  s.prestige = { legacyWeights: Big.of(5e6), ships: 7 };
  s.stats = { ...s.stats, totalShips: 7, totalLegacy: Big.of(5e6) };
  return serialize(s);
}

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
  useGame.setState({ game: createInitialState(), offline: null, notice: null, event: null, worldEvent: null, savingFor: null });
});
afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
});

describe("a replaced save is marked for the UI to re-baseline", () => {
  it("a Restore bumps the save epoch", () => {
    const before = useGame.getState().saveEpoch;
    expect(typeof before).toBe("number");
    expect(useGame.getState().importSave(veteranBackup())).toBe(true);
    expect(useGame.getState().game.prestige.ships).toBe(7);
    expect(useGame.getState().saveEpoch).toBe(before + 1);
  });

  it("a Hard Reset bumps it too", () => {
    const before = useGame.getState().saveEpoch;
    useGame.getState().hardReset();
    expect(useGame.getState().saveEpoch).toBe(before + 1);
  });

  it("a refused restore, a Ship or a tick is the same save", () => {
    const before = useGame.getState().saveEpoch;
    expect(useGame.getState().importSave("not a backup")).toBe(false);
    useGame.getState().advance(1000);
    useGame.getState().doPrestige("deploy");
    useGame.getState().save();
    expect(useGame.getState().saveEpoch).toBe(before);
  });
});
