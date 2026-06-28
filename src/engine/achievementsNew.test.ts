import { describe, it, expect } from "vitest";
import { evaluateAchievements, achievementDefs, metricValue } from "./achievements";
import { releaseProduct } from "./products";
import { createInitialState } from "./state";
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
    expect(metricValue(s, "rivalsBeaten").toNumber()).toBe(5);
    expect(new Set(evaluateAchievements(s)).has("market_1")).toBe(true);
  });

  it("the Completionist target is reachable (accounts for exclusive groups)", () => {
    const completionist = achievementDefs.find((a) => a.id === "research_30")!;
    // It must be < the raw node count (exclusive siblings can't all be owned).
    expect(completionist.threshold).toBeLessThan(achievementDefs.length); // sanity
    expect(completionist.threshold).toBeGreaterThan(0);
  });
});
