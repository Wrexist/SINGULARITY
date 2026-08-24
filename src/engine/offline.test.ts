import { describe, it, expect } from "vitest";
import { applyOffline, summarizeWindow, recapWorthShowing } from "./offline";
import { earnedReputation } from "./reputation";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { balance } from "./balance/config";
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

/**
 * The resume path (2026-08 audit §1.5). On iOS the app is suspended and resumed
 * far more often than it is killed, and `applyOffline` is reachable only from
 * `init()` — so the welcome-back payload was skipped on the platform's most
 * common return. The fix summarizes the window the LIVE LOOP already ticked
 * rather than ticking a second one; these pin that it cannot pay twice.
 */
describe("resume recap — summarizeWindow", () => {
  const WINDOW = 30 * 60 * 1000; // 30m away

  const producingLab = () => {
    const s = createInitialState();
    s.resources.compute = Big.of(1e6);
    s.upgrades = { rack_basic: 20 };
    return s;
  };

  it("credits the window EXACTLY once — same state as applyOffline, summary and all", () => {
    const s = producingLab();
    const viaOffline = applyOffline(s, WINDOW);
    // The resume path: the game loop ticks (already cap-clamped), then we diff.
    const after = tick(s, WINDOW);
    const viaResume = summarizeWindow(s, after, WINDOW, WINDOW);

    expect(after.resources.compute.toString()).toBe(viaOffline.state.resources.compute.toString());
    expect(after.resources.data.toString()).toBe(viaOffline.state.resources.data.toString());
    expect(after.resources.money.toString()).toBe(viaOffline.state.resources.money.toString());
    // And the two summaries agree field for field.
    expect(viaResume.gained.compute.toString()).toBe(viaOffline.summary.gained.compute.toString());
    expect(viaResume.gained.money.toString()).toBe(viaOffline.summary.gained.money.toString());
    expect(viaResume.achievementsUnlocked).toEqual(viaOffline.summary.achievementsUnlocked);
    expect(viaResume.reputationEarned).toBe(viaOffline.summary.reputationEarned);
    expect(viaResume.story).toEqual(viaOffline.summary.story);
  });

  it("does not tick: the states handed in are left exactly as they were", () => {
    const s = producingLab();
    const before = s.resources.compute.toString();
    const after = tick(s, WINDOW);
    const afterCompute = after.resources.compute.toString();
    summarizeWindow(s, after, WINDOW, WINDOW);
    expect(s.resources.compute.toString()).toBe(before);
    expect(after.resources.compute.toString()).toBe(afterCompute);
  });

  it("reports a capped window when real time away exceeds what was simulated", () => {
    const s = producingLab();
    const applied = 8 * 3600 * 1000;
    const real = 20 * 3600 * 1000;
    expect(summarizeWindow(s, tick(s, applied), real, applied).capped).toBe(true);
    expect(summarizeWindow(s, tick(s, applied), applied, applied).capped).toBe(false);
  });
});

describe("recapWorthShowing — the recap is a reward beat, not a receipt", () => {
  it("stays silent for a glance at another app, however productive the lab", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(1e9);
    s.upgrades = { rack_basic: 30, rack_server: 10 };
    const brief = balance.offline.recapMinMs - 1000;
    const summary = summarizeWindow(s, tick(s, brief), brief, brief);
    expect(summary.gained.compute.gt(0)).toBe(true); // it DID earn
    expect(recapWorthShowing(summary)).toBe(false); // ...and still must not interrupt
  });

  it("stays silent for a long window that changed nothing at all", () => {
    // The defensive half of the gate: a state that came back identical has no
    // story to tell, so the recap must not claim the screen to say so. (In normal
    // play this is unreachable — even a bare lab accrues baseline Compute — which
    // is exactly why it's pinned here rather than assumed.)
    const s = createInitialState();
    const w = balance.offline.recapMinMs + 60_000;
    expect(recapWorthShowing(summarizeWindow(s, s, w, w))).toBe(false);
  });

  it("shows for an idle bare lab, which still accrues baseline output", () => {
    const s = createInitialState();
    const w = balance.offline.recapMinMs + 60_000;
    const summary = summarizeWindow(s, tick(s, w), w, w);
    expect(summary.gained.compute.gt(0)).toBe(true);
    expect(recapWorthShowing(summary)).toBe(true);
  });

  it("shows for a real window with something to report", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(1e6);
    s.upgrades = { rack_basic: 20 };
    const w = 60 * 60 * 1000;
    expect(recapWorthShowing(summarizeWindow(s, tick(s, w), w, w))).toBe(true);
  });

  it("cold launch and resume agree on what deserves the screen", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(1e6);
    s.upgrades = { rack_basic: 20 };
    for (const w of [1000, balance.offline.recapMinMs - 1, balance.offline.recapMinMs, 3 * 3600 * 1000]) {
      const cold = applyOffline(s, w).summary;
      const resume = summarizeWindow(s, tick(s, w), w, w);
      expect(recapWorthShowing(resume)).toBe(recapWorthShowing(cold));
    }
  });
});
