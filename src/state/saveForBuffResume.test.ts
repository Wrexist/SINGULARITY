import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { grantDailyBoost } from "../engine/actions";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * A resume long enough to reach a "Save for this" node is split at the moment the bank
 * covers it. That moment was estimated once, from the Compute rate at the start of the
 * window — so a buff that lapsed mid-window (the 3-minute Daily Boost, a world-event
 * surge) made the estimate land early, the node was not yet affordable there, and the
 * store let go of the pin: the rest of the window ran at full intensity, drained the
 * bank and the node was never bought.
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

describe("save for this — a buff that lapses during the resume window", () => {
  beforeEach(() => {
    useGame.setState({ game: grantDailyBoost(walledLab()), savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
  });

  it("still buys the node when the bank gets there, then restores the slider", () => {
    useGame.getState().doSaveFor(NODE);
    expect(useGame.getState().savingFor?.id).toBe(NODE);
    const hour = 3600 * 1000;
    useGame.getState().advance(hour, hour);
    const after = useGame.getState();
    expect(after.game.research).toContain(NODE);
    expect(after.savingFor).toBeNull();
    expect(after.game.computeFocus).toBe(1);
  });
});
