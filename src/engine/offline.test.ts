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

describe("offline story (IMPROVEMENTS #16 — events, not just numbers)", () => {
  it("reports training completions and stable rank/era baselines", () => {
    const s = createInitialState();
    s.employees = [
      { id: "e1", name: "Kim", roleId: "researcher", level: 1, trait: null, assignedProductId: null, training: { remainingSec: 60, totalSec: 600 } },
    ];
    const { summary } = applyOffline(s, 10 * 60 * 1000); // 10m ≫ 60s left
    expect(summary.story.leveledUp).toEqual([{ name: "Kim", level: 2 }]);
    expect(summary.story.eraAfter).toBeGreaterThanOrEqual(summary.story.eraBefore);
    expect(summary.story.rankBefore).toBeNull(); // no live product
    expect(summary.story.rankAfter).toBeNull();
  });

  it("is all-empty on a zero-length window", () => {
    const { summary } = applyOffline(createInitialState(), 0);
    expect(summary.story.milestones).toEqual([]);
    expect(summary.story.upgradesFinished).toEqual([]);
    expect(summary.story.leveledUp).toEqual([]);
    expect(summary.story.eraAfter).toBe(summary.story.eraBefore);
  });
});
