import { describe, it, expect } from "vitest";
import { evaluateAchievements, applyAchievements, achievementProgress, achievementDefs } from "./achievements";
import { prestige } from "./prestige";
import { createInitialState } from "./state";
import { Big } from "./math/Big";
import { balance } from "./balance/config";

describe("achievements", () => {
  it("unlocks nothing on a fresh state", () => {
    expect(evaluateAchievements(createInitialState())).toEqual([]);
  });

  it("unlocks a lifetime-stat achievement when its threshold is crossed", () => {
    const s = createInitialState();
    s.stats.employeesHired = 1;
    const ids = evaluateAchievements(s);
    expect(ids).toContain("hire_1");
  });

  it("apply() is idempotent — an already-held achievement doesn't re-fire", () => {
    let s = createInitialState();
    s.stats.totalShips = 1;
    const first = applyAchievements(s);
    expect(first.unlocked.map((u) => u.def.id)).toContain("ship_1");
    s = first.state;
    const second = applyAchievements(s);
    expect(second.unlocked).toEqual([]); // nothing new
    expect(s.achievements.filter((a) => a === "ship_1")).toHaveLength(1); // no dupes
  });

  it("reads live state (not just stats) for liveProducts / peakVersion", () => {
    const s = createInitialState();
    s.products.active = [
      { id: "a", name: "A", type: "general", version: 10, quality: 1, priceMult: 1, enterprise: false, enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 }, mau: 0, paid: 0, buzzSec: 0, ageSec: 0, upgrade: null, features: [] },
    ];
    const ids = evaluateAchievements(s);
    expect(ids).toContain("version_10");
  });

  it("survives a prestige (it's a permanent collection)", () => {
    let s = createInitialState();
    s.research = [balance.prestige.capabilityResearch];
    s.lifetimeMoney = Big.of(1e9);
    s.achievements = ["hire_1"];
    s = prestige(s);
    expect(s.achievements).toContain("hire_1");
  });

  it("progress is 0..1 and reaches 1 at threshold", () => {
    const def = achievementDefs.find((d) => d.id === "hire_10")!;
    const s = createInitialState();
    s.stats.employeesHired = 5;
    expect(achievementProgress(s, def)).toBeCloseTo(0.5, 5);
    s.stats.employeesHired = 20;
    expect(achievementProgress(s, def)).toBe(1);
  });
});
