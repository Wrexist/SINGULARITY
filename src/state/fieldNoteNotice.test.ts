import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * "New Field Note" in generation 1 (bug hunt round 3). The Field Notes panel only
 * appears on Lab › HQ from the first Ship on, but the store toasted a new note the
 * moment one unlocked — about ten minutes into a brand-new game ("On the Training
 * Run", at 100 Compute/sec), with the success chime, for a panel the player could not
 * find anywhere for the next twenty.
 */
function labCrossing100(ships: number): GameState {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.stats.totalShips = ships;
  s.upgrades = { rack_basic: 10, rack_server: 10 };
  s.stats.peakComputePerSec = Big.of(50); // below the first note's 100 Compute/sec
  return s;
}

function fieldNoteNotices(start: GameState): string[] {
  useGame.setState({ game: start, offline: null, notice: null, event: null, worldEvent: null });
  const out: string[] = [];
  for (let i = 0; i < 40; i++) {
    useGame.getState().advance(100, 100);
    const n = useGame.getState().notice;
    if (n && /Field Note/.test(n.message) && !out.includes(n.message)) out.push(n.message);
  }
  return out;
}

describe("Field Note notices wait for the Field Notes panel", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  beforeEach(() => { vi.spyOn(Math, "random").mockReturnValue(0.99); });

  it("stays quiet in generation 1, before the panel exists", () => {
    const s = labCrossing100(0);
    expect(derive(s).computePerSec.gt(100)).toBe(true);
    expect(fieldNoteNotices(s)).toEqual([]);
    // The note still unlocks; it is simply there to read once the panel opens.
    expect(useGame.getState().game.stats.peakComputePerSec.gt(100)).toBe(true);
  });

  it("announces a new note once the panel is on HQ", () => {
    expect(fieldNoteNotices(labCrossing100(1)).length).toBe(1);
  });
});
