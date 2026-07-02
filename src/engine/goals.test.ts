import { describe, it, expect } from "vitest";
import { goalCandidates, nextGoal } from "./goals";
import { createInitialState } from "./state";
import { achievementDefs } from "./achievements";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

describe("goals (the next-goal carrot)", () => {
  it("always has a goal for a fresh player, with progress in [0, 1)", () => {
    const goals = goalCandidates(createInitialState());
    expect(goals.length).toBeGreaterThan(0);
    for (const g of goals) {
      expect(g.progress).toBeGreaterThanOrEqual(0);
      expect(g.progress).toBeLessThan(1);
      expect(g.label.length).toBeGreaterThan(0);
    }
  });

  it("nextGoal returns the candidate with the highest progress", () => {
    const s = createInitialState();
    const goals = goalCandidates(s);
    const top = nextGoal(s)!;
    for (const g of goals) expect(top.progress).toBeGreaterThanOrEqual(g.progress);
  });

  it("tracks era progress by research count before the first era", () => {
    const s = createInitialState();
    s.research = ["backprop", "curated_data"];
    const era = goalCandidates(s).find((g) => g.kind === "era")!;
    expect(era.progress).toBeCloseTo(2 / balance.eras.startupAtResearchCount);
    expect(era.desc).toContain(`2/${balance.eras.startupAtResearchCount}`);
  });

  it("tracks era progress by ships in the shipping eras", () => {
    const s = createInitialState();
    s.prestige.ships = balance.eras.frontierAtShips; // era 3 → next gate is hyperscaler
    const era = goalCandidates(s).find((g) => g.kind === "era")!;
    expect(era.progress).toBeCloseTo(balance.eras.frontierAtShips / balance.eras.hyperscalerAtShips);
  });

  it("never surfaces secret or already-unlocked achievements", () => {
    const s = createInitialState();
    s.achievements = achievementDefs.filter((d) => !d.secret).map((d) => d.id);
    const labels = new Set(goalCandidates(s).filter((g) => g.kind === "achievement").map((g) => g.label));
    for (const d of achievementDefs) {
      if (d.secret || s.achievements.includes(d.id)) expect(labels.has(d.label)).toBe(false);
    }
  });

  it("excludes a contract that is met and waiting to be claimed (advisor's job)", () => {
    const s = createInitialState();
    s.stats.peakComputePerSec = Big.of(1e18); // blows past every compute contract target
    for (const g of goalCandidates(s)) expect(g.progress).toBeLessThan(1);
  });
});
