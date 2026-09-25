import { describe, it, expect } from "vitest";
import { Big } from "./math/Big";
import { createInitialState } from "./state";
import { prestige, nextRunMultiplier, type ShipMode } from "./prestige";
import { queueTrial } from "./trials";
import { derive } from "./derive";
import { balance } from "./balance/config";
import type { GameState } from "./types";

const MODES = Object.keys(balance.prestige.shipModes) as ShipMode[];

/** A veteran lab (Unplugged unlocks at ship 10) that can Ship right now. */
function veteran(): GameState {
  const s = createInitialState();
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e12);
  s.prestige = { legacyWeights: Big.of(5000), ships: 12 };
  return s;
}

/** The Legacy boost the fresh lab really runs at after shipping in `mode`. */
const actualNextBoost = (s: GameState, mode: ShipMode) => derive(prestige(s, mode)).legacyMult.toNumber();

describe("the Ship panel's next-run Legacy boost", () => {
  it("is the boost the next run really starts with", () => {
    const s = veteran();
    for (const mode of MODES) {
      expect(nextRunMultiplier(s, mode).toNumber()).toBeCloseTo(actualNextBoost(s, mode), 9);
    }
  });

  it("reads ×1 when the Ship starts a queued Unplugged Trial", () => {
    // The Trial starts on the fresh lab and switches Legacy off for that whole run.
    // Every mode's row used to promise "×19.4 → ×25.2" while the run began at ×1.
    const s = queueTrial(veteran(), "trial_unplugged");
    expect(s.queuedTrial).toBe("trial_unplugged");
    expect(prestige(s).activeTrial).toBe("trial_unplugged");
    for (const mode of MODES) {
      expect(actualNextBoost(s, mode)).toBe(1);
      expect(nextRunMultiplier(s, mode).toNumber()).toBe(1);
    }
  });

  it("gives the boost back for the run after an Unplugged one", () => {
    // Shipping OUT of an Unplugged run (nothing queued) restores the full boost.
    const running = prestige(queueTrial(veteran(), "trial_unplugged"));
    const s = { ...running, research: [balance.prestige.capabilityResearch], lifetimeMoney: Big.of(1e12) };
    expect(nextRunMultiplier(s).toNumber()).toBeGreaterThan(1);
    expect(nextRunMultiplier(s).toNumber()).toBeCloseTo(actualNextBoost(s, "deploy"), 9);
  });
});
