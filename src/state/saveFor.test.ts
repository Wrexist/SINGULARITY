import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { derive, computeBankCeiling } from "../engine/derive";
import { researchCost } from "../engine/actions";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * "Save for this" (2026-09 pacing audit): at full training intensity auto-train drains
 * the Compute bank before it can reach mid-tree research, and a player who never finds
 * the slider sat 20+ minutes with nothing to do. Tapping a walled node pins it: the
 * store eases intensity just enough, buys the node when the bank covers it, then puts
 * the slider back. Player-only (the balance sim never calls it), so curve-safe.
 */
const NODE = "moe";

/** A mid-run lab with auto-train on at 100% whose bank can't reach `moe`. */
function walledLab(): GameState {
  const s = createInitialState();
  const prereqs = ["backprop", "curated_data", "mixed_precision", "data_aug", "distributed", "caching", "distillation"];
  s.research = prereqs;
  s.upgrades = { rack_basic: 20, auto_claim: 1, auto_train: 1 };
  s.computeFocus = 1;
  s.resources = { compute: Big.ZERO, data: Big.of(1e12), money: Big.of(1e9) };
  return s;
}

describe("save for this — store wiring", () => {
  beforeEach(() => {
    useGame.setState({ game: walledLab(), savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
  });

  it("the fixture is genuinely walled at full intensity", () => {
    const g = useGame.getState().game;
    const cost = researchCost(g, balance.research.find((r) => r.id === NODE)!).compute;
    expect(cost.gt(computeBankCeiling(g, derive(g))!)).toBe(true);
  });

  it("eases intensity, buys the node once the bank covers it, then restores the slider", () => {
    useGame.getState().doSaveFor(NODE);
    const pinned = useGame.getState();
    expect(pinned.savingFor).toEqual({ id: NODE, prevFocus: 1 });
    expect(pinned.game.computeFocus).toBeLessThan(1);

    // Let the eased bank climb (live-sized steps).
    for (let i = 0; i < 20 * 60 * 10 && useGame.getState().savingFor; i++) useGame.getState().advance(100);

    const done = useGame.getState();
    expect(done.game.research).toContain(NODE);
    expect(done.savingFor).toBeNull();
    expect(done.game.computeFocus).toBe(1);
  });

  it("moving the slider by hand cancels the pin", () => {
    useGame.getState().doSaveFor(NODE);
    useGame.getState().setComputeFocus(0.5);
    expect(useGame.getState().savingFor).toBeNull();
    expect(useGame.getState().game.computeFocus).toBe(0.5);
  });

  it("ignores nodes that can't be pinned (owned or not yet available)", () => {
    useGame.getState().doSaveFor("backprop"); // owned
    useGame.getState().doSaveFor("world_model"); // prerequisites missing
    expect(useGame.getState().savingFor).toBeNull();
    expect(useGame.getState().game.computeFocus).toBe(1);
  });
});
