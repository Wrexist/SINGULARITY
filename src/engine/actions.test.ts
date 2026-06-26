import { describe, it, expect } from "vitest";
import {
  startRun,
  claimRun,
  buyUpgrade,
  canBuyUpgrade,
  buyResearch,
  canBuyResearch,
  researchAvailable,
  upgradeCost,
  grantDailyBoost,
} from "./actions";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { derive } from "./derive";
import { Big } from "./math/Big";

describe("daily boost", () => {
  it("applies a temporary all-output buff and refreshes (never stacks)", () => {
    const s = createInitialState();
    const a = grantDailyBoost(s);
    const daily = a.modifiers.filter((m) => m.id.startsWith("daily_"));
    expect(daily).toHaveLength(3); // compute + data + money
    expect(daily.every((m) => m.factor === balance.daily.factor)).toBe(true);
    expect(daily.every((m) => m.remainingSec === balance.daily.durationSec)).toBe(true);
    // Claiming again refreshes rather than piling up a second set.
    const b = grantDailyBoost(a);
    expect(b.modifiers.filter((m) => m.id.startsWith("daily_"))).toHaveLength(3);
  });
});

describe("training run actions", () => {
  it("startRun spends compute and activates a run when affordable", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(100);
    const cost = derive(s).runComputeCost;
    const next = startRun(s);
    expect(next.run.active).toBe(true);
    expect(next.resources.compute.eq(Big.of(100).sub(cost))).toBe(true);
  });

  it("startRun is a no-op when compute is insufficient", () => {
    const s = createInitialState();
    expect(startRun(s)).toBe(s);
  });

  it("claimRun pays out Data and Money and resets the run", () => {
    const s = createInitialState();
    s.run = { active: false, progress: 1, readyToClaim: true };
    const d = derive(s);
    const next = claimRun(s);
    expect(next.resources.data.eq(d.runDataYield)).toBe(true);
    expect(next.resources.money.eq(d.runMoneyYield)).toBe(true);
    expect(next.run.readyToClaim).toBe(false);
  });

  it("claimRun is a no-op when nothing is ready", () => {
    const s = createInitialState();
    expect(claimRun(s)).toBe(s);
  });
});

describe("upgrade actions", () => {
  it("cost scales by growth^owned", () => {
    const def = balance.upgrades[0]!;
    expect(upgradeCost(def, 0).eq(def.cost.base)).toBe(true);
    expect(upgradeCost(def, 1).toNumber()).toBeCloseTo(def.cost.base * def.cost.growth, 6);
  });

  it("buys when affordable, deducts cost, raises owned and next cost", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    const def = balance.upgrades[0]!;
    expect(canBuyUpgrade(s, def.id)).toBe(true);
    const next = buyUpgrade(s, def.id);
    expect(next.upgrades[def.id]).toBe(1);
    expect(next.resources.money.lt(1000)).toBe(true);
    expect(upgradeCost(def, 1).gt(upgradeCost(def, 0))).toBe(true);
  });

  it("respects max level (automations are one-shot)", () => {
    const s = createInitialState();
    s.resources.data = Big.of(1e9);
    s.upgrades = { auto_claim: 1 };
    expect(canBuyUpgrade(s, "auto_claim")).toBe(false);
  });
});

describe("research actions", () => {
  it("gates nodes behind prerequisites", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(1e9);
    s.resources.data = Big.of(1e9);
    expect(researchAvailable(s, "backprop")).toBe(true);
    expect(researchAvailable(s, "curated_data")).toBe(false);
  });

  it("buys an available node and unlocks its successor", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(1e9);
    s.resources.data = Big.of(1e9);
    expect(canBuyResearch(s, "backprop")).toBe(true);
    const next = buyResearch(s, "backprop");
    expect(next.research).toContain("backprop");
    expect(researchAvailable(next, "curated_data")).toBe(true);
  });
});
