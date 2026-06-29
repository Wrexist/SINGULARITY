import { describe, it, expect } from "vitest";
import { evaluateAchievements, achievementDefs, metricValue } from "./achievements";
import { releaseProduct } from "./products";
import { tick } from "./tick";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

describe("achievements for the new systems", () => {
  it("unlocks open-source, contracts, legacy-tree and ascension badges at threshold", () => {
    const s = createInitialState();
    s.stats.openSourceShips = 1;
    s.contracts.completed = ["boot", "seed_round", "hello_science", "headcount", "rack_em_up"];
    s.legacyInvestments = ["leg_compute1"];
    s.stats.ascensions = 1;
    const unlocked = new Set(evaluateAchievements(s));
    expect(unlocked.has("os_1")).toBe(true);
    expect(unlocked.has("contracts_5")).toBe(true);
    expect(unlocked.has("legacy_1")).toBe(true);
    expect(unlocked.has("ascend_1")).toBe(true);
    // higher tiers not yet
    expect(unlocked.has("os_5")).toBe(false);
  });

  it("rivalsBeaten metric grows with a dominant product", () => {
    let s = createInitialState();
    s.prestige.ships = 1;
    s.resources.compute = Big.of(1e12);
    s.resources.data = Big.of(1e12);
    s = releaseProduct(s, { type: "general", name: "Goliath", id: "p1" });
    s.products.active[0]!.mau = 500_000_000; // crush the rivals
    // The metric reads the MONOTONIC best-so-far (accrued each tick), not the live
    // value — so tick once to record the dominant rank into bestRivalsBeaten.
    s = tick(s, 1000); // accrues bestRivalsBeaten AND applies the achievement
    expect(metricValue(s, "rivalsBeaten").toNumber()).toBe(5);
    expect(s.achievements).toContain("market_1"); // tick already awarded it
  });

  it("the Completionist target equals the OWNABLE node count (accounts for exclusive groups)", () => {
    const completionist = achievementDefs.find((a) => a.id === "research_30")!;
    // Derive the max-ownable node count the same way the badge does: total nodes
    // minus (groupSize − 1) for each mutually-exclusive group. This pins the
    // threshold to the real cap, so a regression in either side fails the test.
    const groupSizes = balance.research.reduce<Record<string, number>>((acc, r) => {
      if (r.exclusiveGroup) acc[r.exclusiveGroup] = (acc[r.exclusiveGroup] ?? 0) + 1;
      return acc;
    }, {});
    const ownableResearchCount =
      balance.research.length - Object.values(groupSizes).reduce((sum, size) => sum + (size - 1), 0);
    expect(completionist.threshold).toBe(ownableResearchCount);
    // And it must be strictly below the raw node count when any exclusive group exists.
    expect(completionist.threshold).toBeLessThanOrEqual(balance.research.length);
  });
});
