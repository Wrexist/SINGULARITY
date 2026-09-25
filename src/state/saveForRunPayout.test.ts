import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { startRun } from "../engine/actions";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * "Save for this" eases Training intensity while a run is usually already in flight
 * (auto-train keeps one going almost all the time). That run was charged at the full
 * intensity, so it must still pay the full payout — pinning a node used to silently
 * cost the in-flight run up to 70% of its Data and Money.
 */
const NODE = "moe";

function walledLabMidRun(): GameState {
  const s = createInitialState();
  s.research = ["backprop", "curated_data", "mixed_precision", "data_aug", "distributed", "caching", "distillation"];
  s.upgrades = { rack_basic: 20, auto_claim: 1, auto_train: 1 };
  s.computeFocus = 1;
  s.resources = { compute: Big.ZERO, data: Big.of(1e12), money: Big.of(1e9) };
  const cost = derive(s).runComputeCost;
  return startRun({ ...s, resources: { ...s.resources, compute: cost } });
}

describe("save for this — the run already in flight", () => {
  beforeEach(() => {
    useGame.setState({ game: walledLabMidRun(), savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
  });

  it("pays the full-intensity payout it was charged for, even with the slider eased", () => {
    const full = derive(useGame.getState().game);
    expect(useGame.getState().game.run.active).toBe(true);
    useGame.getState().doSaveFor(NODE);
    expect(useGame.getState().game.computeFocus).toBeLessThan(1);

    // Data only arrives from run claims in this lab (no scrapers), so the first rise
    // in Data is exactly the in-flight run's payout.
    const before = useGame.getState().game.resources.data;
    let gained = Big.ZERO;
    for (let i = 0; i < 200 && gained.eq(0); i++) {
      useGame.getState().advance(100);
      gained = useGame.getState().game.resources.data.sub(before);
    }
    // (3 digits: the payout lands on a 1e12 Data bank, so the diff carries float dust.)
    expect(gained.div(full.runDataYield).toNumber()).toBeCloseTo(1, 3);
  });
});
