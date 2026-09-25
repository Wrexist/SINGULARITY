import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { researchCost } from "../engine/actions";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * "Save for this" holds training until the bank covers a walled node — often many
 * minutes. A resume from suspend reaches the store as one big advance(). When that
 * window ended before the bank got there, the store let go of the pin and ran the window
 * at the player's full intensity instead, so locking the phone for a few seconds
 * mid-save silently cancelled it and the runs drained everything banked so far.
 */
const NODE = "moe";

function walledLab(): GameState {
  const s = createInitialState();
  s.research = ["backprop", "curated_data", "mixed_precision", "data_aug", "distributed", "caching", "distillation"];
  s.upgrades = { rack_basic: 20, auto_claim: 1, auto_train: 1, batching: 12 };
  s.computeFocus = 1;
  s.resources = { compute: Big.ZERO, data: Big.of(1e12), money: Big.of(1e9) };
  return s;
}

describe("save for this — a resume that ends before the bank gets there", () => {
  beforeEach(() => {
    useGame.setState({ game: walledLab(), savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
  });

  it("keeps the pin and the eased intensity, and keeps banking through the window", () => {
    useGame.getState().doSaveFor(NODE);
    const pinned = useGame.getState();
    const eased = pinned.game.computeFocus;
    expect(eased).toBeLessThan(1);
    const g = pinned.game;
    const cost = researchCost(g, balance.research.find((r) => r.id === NODE)!).compute;
    const cps = derive(g).computePerSec;
    // The node takes minutes of banking; the phone is locked for 30 seconds.
    expect(cost.div(cps).toNumber()).toBeGreaterThan(120);
    const before = g.resources.compute;

    useGame.getState().advance(30_000, 30_000);

    const after = useGame.getState();
    expect(after.savingFor).toEqual({ id: NODE, prevFocus: 1 });
    expect(after.game.computeFocus).toBe(eased);
    // The window banked (nothing drained it), rather than being spent on full-size runs.
    expect(after.game.resources.compute.sub(before).div(cps).toNumber()).toBeCloseTo(30, 0);
  });

  it("a later window that does reach it still buys the node and restores the slider", () => {
    useGame.getState().doSaveFor(NODE);
    useGame.getState().advance(30_000, 30_000);
    const hour = 3600 * 1000;
    useGame.getState().advance(hour, hour);
    const done = useGame.getState();
    expect(done.game.research).toContain(NODE);
    expect(done.savingFor).toBeNull();
    expect(done.game.computeFocus).toBe(1);
  });
});
