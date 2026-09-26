import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { advisorItems } from "./advisor";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * "Start a training run" is the first session's hand-holding for the manual loop. Once
 * Auto-Train is owned the lab starts its own runs, yet the nudge still fired whenever the
 * run happened to be idle: between compute-bound runs (every ~2s cycle, so the notice
 * chip and the Lab badge flickered on and off) and all through a deliberate hold (the
 * slider at 0, or a "Save for this" pin), where following it spends the Compute the
 * player is banking.
 */
const START = "Start a training run to earn Data & $";

/** A first-generation lab past its first research, with auto-train and fast runs. */
function autoLab(focus: number): GameState {
  const s = createInitialState();
  s.research = ["backprop", "curated_data", "mixed_precision", "data_aug", "distributed", "caching", "distillation"];
  s.upgrades = { rack_basic: 20, auto_claim: 1, auto_train: 1, batching: 12 };
  s.computeFocus = focus;
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  return s;
}

const says = (s: GameState, text: string) => advisorItems(s, derive(s)).some((i) => i.text === text);

describe("advisor — no hand-start nudge once Auto-Train runs the loop", () => {
  it("stays quiet between compute-bound runs instead of flickering every cycle", () => {
    let s = autoLab(1);
    let idleSeen = 0;
    let nudged = 0;
    for (let i = 0; i < 100; i++) {
      s = tick(s, 100);
      if (!s.run.active && !s.run.readyToClaim) {
        idleSeen++;
        if (says(s, START)) nudged++;
      }
    }
    expect(idleSeen).toBeGreaterThan(0); // the lab really does sit idle between runs
    expect(nudged).toBe(0);
  });

  it("does not tell a player holding training to start a run", () => {
    const s = tick(autoLab(0), 100);
    expect(s.run.active).toBe(false);
    expect(says(s, START)).toBe(false);
  });

  it("still coaches the manual loop before Auto-Train", () => {
    const s = autoLab(1);
    s.upgrades = { rack_basic: 20, auto_claim: 1, batching: 12 };
    expect(says(s, START)).toBe(true);
  });
});
