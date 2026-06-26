import { describe, it, expect } from "vitest";
import { applyOffline } from "./offline";
import { earnedReputation } from "./reputation";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

describe("offline summary — Phase 3 meta progress", () => {
  it("reports achievements unlocked and reputation earned while away", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(1e6);
    s.upgrades = { rack_basic: 20 }; // earns resources over the window
    const repBefore = earnedReputation(s);

    const { state, summary } = applyOffline(s, 60 * 60 * 1000); // 1h
    // The big offline tick crosses early achievement thresholds (e.g. compute_1k).
    expect(summary.achievementsUnlocked.length).toBeGreaterThan(0);
    expect(summary.achievementsUnlocked).toEqual(state.achievements);
    // Reputation earned matches the achievements (each grants points).
    expect(summary.reputationEarned).toBe(earnedReputation(state) - repBefore);
    expect(summary.reputationEarned).toBeGreaterThan(0);
  });

  it("reports zero meta progress on a no-op (already-earned) window", () => {
    const s = createInitialState();
    const { summary } = applyOffline(s, 0);
    expect(summary.achievementsUnlocked).toEqual([]);
    expect(summary.reputationEarned).toBe(0);
  });
});
