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

  it("nextGoal returns the candidate with the highest progress (once the first Ship is behind you)", () => {
    const s = createInitialState();
    s.prestige.ships = 1;
    s.stats.totalShips = 1;
    s.lifetimeMoney = Big.of(5_000);
    s.stats.totalMoney = Big.of(5_000);
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

describe("product-milestone goals (mid-game carrots)", () => {
  it("surfaces unreached milestones once products are unlocked, never achieved ones", () => {
    const s = createInitialState();
    s.prestige.ships = 1; // products unlocked
    s.products.milestones = ["first_launch"];
    const goals = goalCandidates(s).filter((g) => g.kind === "milestone");
    expect(goals.length).toBeGreaterThan(0);
    expect(goals.some((g) => g.label === "Hello, World")).toBe(false); // achieved → gone
    for (const g of goals) expect(g.progress).toBeLessThan(1);
  });

  it("stays out of the pre-products game entirely", () => {
    expect(goalCandidates(createInitialState()).some((g) => g.kind === "milestone")).toBe(false);
  });

  it("in generation 1 the first Ship is the goal, measured along its research path", () => {
    const s = createInitialState();
    s.stats.totalMoney = Big.of(9_000); // a side-chase at 90% must not bury it
    let g = nextGoal(s)!;
    expect(g.kind).toBe("ship");
    expect(g.progress).toBe(0);
    s.research = ["backprop", "curated_data"];
    g = nextGoal(s)!;
    expect(g.kind).toBe("ship");
    expect(g.progress).toBeGreaterThan(0);
    // Once the capability node is owned the goal is met and leaves the strip.
    s.research = [...s.research, balance.prestige.capabilityResearch];
    expect(goalCandidates(s).some((x) => x.kind === "ship")).toBe(false);
  });

  it("never offers a cosmetic collection counter as the next goal", () => {
    const s = createInitialState();
    s.prestige.ships = 1;
    expect(goalCandidates(s).some((g) => /theme/i.test(g.desc))).toBe(false);
  });
});
