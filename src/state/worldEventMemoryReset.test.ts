import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { pickWorldEvent, worldEventLab } from "../engine/actions";
import { serialize } from "../engine/save";
import type { GameState } from "../engine/types";

/**
 * The store remembers the last few world events so related ones cluster and a
 * sequel ("Remember the shortage? ... the scalper ring gets raided") can call back to
 * its parent. That memory outlived a Hard Reset and a Restore, so a brand-new lab, or
 * a restored one, could open with a sequel to an event it never had.
 */

const PARENT = "gpu_shortage";
const SEQUEL = "gpu_scalper_bust";

function researchedLab(): GameState {
  return { ...createInitialState(), research: ["backprop"] };
}

/** Roll one world event on the next frame with these two dice (fire, pick). */
function rollOnce(pick: number) {
  const dice = [0, pick];
  vi.spyOn(Math, "random").mockImplementation(() => dice.shift() ?? 0.99);
  useGame.getState().advance(100);
  vi.restoreAllMocks();
  return useGame.getState().worldEvent;
}

/** Pick rolls: one landing the parent on a fresh lab, one landing the sequel once the
 *  parent is recent, and a topic-free filler to flush the window between tests. */
function rolls(lab: GameState) {
  const l = worldEventLab(lab);
  const FILLER = "breakthrough_paper";
  let parent = -1;
  let sequel = -1;
  let filler = -1;
  for (let r = 0; r < 1; r += 0.0005) {
    if (parent < 0 && pickWorldEvent(r, 0, [], l).id === PARENT) parent = r;
    if (sequel < 0 && pickWorldEvent(r, 0, [PARENT], l).id === SEQUEL) sequel = r;
    if (filler < 0 && [[], [FILLER], [FILLER, FILLER]].every((w) => pickWorldEvent(r, 0, w, l).id === FILLER)) filler = r;
  }
  expect(parent).toBeGreaterThanOrEqual(0);
  expect(sequel).toBeGreaterThanOrEqual(0);
  expect(filler).toBeGreaterThanOrEqual(0);
  // Start every test from the same window: three fillers, then the parent.
  for (let i = 0; i < 3; i++) {
    expect(rollOnce(filler)?.id).toBe(FILLER);
    useGame.setState({ worldEvent: null });
  }
  return { parent, sequel };
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
  useGame.setState({ game: researchedLab(), savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
});

describe("the world-event memory belongs to the lab it happened in", () => {
  it("control: in the same lab, the sequel can follow its parent", () => {
    const { parent, sequel } = rolls(researchedLab());
    expect(rollOnce(parent)?.id).toBe(PARENT);
    useGame.setState({ worldEvent: null });
    expect(rollOnce(sequel)?.id).toBe(SEQUEL);
  });

  it("a Hard Reset forgets it: the fresh lab never opens on a sequel", () => {
    const { parent, sequel } = rolls(researchedLab());
    expect(rollOnce(parent)?.id).toBe(PARENT);
    useGame.getState().hardReset();
    useGame.setState({ game: researchedLab() }); // the new lab does its first research
    expect(rollOnce(sequel)?.id).not.toBe(SEQUEL);
  });

  it("a Restore forgets it too", () => {
    const { parent, sequel } = rolls(researchedLab());
    expect(rollOnce(parent)?.id).toBe(PARENT);
    expect(useGame.getState().importSave(serialize(researchedLab()))).toBe(true);
    expect(rollOnce(sequel)?.id).not.toBe(SEQUEL);
  });
});
