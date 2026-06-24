import { describe, it, expect } from "vitest";
import { serialize, deserialize, migrate } from "./save";
import { createInitialState, SAVE_VERSION } from "./state";
import { Big } from "./math/Big";

describe("save/load", () => {
  it("round-trips state losslessly", () => {
    const s = createInitialState();
    s.resources.compute = Big.of("123456789.5");
    s.resources.data = Big.of(42);
    s.resources.money = Big.of("9.99e20");
    s.upgrades = { rack_basic: 7, overclock: 3 };
    s.research = ["backprop", "curated_data"];
    s.prestige = { legacyWeights: Big.of(15), ships: 2 };
    s.lifetimeMoney = Big.of("1e7");

    const restored = deserialize(serialize(s));
    expect(restored.resources.compute.eq(s.resources.compute)).toBe(true);
    expect(restored.resources.money.eq(s.resources.money)).toBe(true);
    expect(restored.upgrades).toEqual(s.upgrades);
    expect(restored.research).toEqual(s.research);
    expect(restored.prestige.legacyWeights.eq(15)).toBe(true);
    expect(restored.prestige.ships).toBe(2);
    expect(restored.lifetimeMoney.eq(s.lifetimeMoney)).toBe(true);
    expect(restored.version).toBe(SAVE_VERSION);
  });

  it("migrates a pre-versioning (v0) save up to the current version", () => {
    const v0 = {
      resources: { compute: "100", data: "5", money: "50" },
      upgrades: { rack_basic: 1 },
      research: [],
      run: { active: false, progress: 0, readyToClaim: false },
      prestige: { legacyWeights: "0", ships: 0 },
    };
    const migrated = migrate(v0);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.lifetimeMoney).toBe("50"); // backfilled from money (v0→v1)
    expect(migrated.heat).toBe(0); // backfilled (v1→v2)
  });

  it("migrates a v1 save by adding cold Heat", () => {
    const v1 = {
      version: 1,
      resources: { compute: "100", data: "5", money: "50" },
      upgrades: {},
      research: [],
      run: { active: false, progress: 0, readyToClaim: false },
      prestige: { legacyWeights: "0", ships: 0 },
      lifetimeMoney: "50",
    };
    const migrated = migrate(v1);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.heat).toBe(0);
    expect(migrated.modifiers).toEqual([]); // v2→v3 backfill
  });

  it("preserves Heat through a round-trip", () => {
    const s = createInitialState();
    s.heat = 42;
    expect(deserialize(serialize(s)).heat).toBe(42);
  });

  it("loads a partial/legacy save without throwing (missing prestige/heat/run)", () => {
    // A genuine pre-versioning save that predates several fields.
    const partial = JSON.stringify({
      resources: { compute: "100", data: "5", money: "50" },
      upgrades: { rack_basic: 2 },
    });
    const state = deserialize(partial); // must not throw
    expect(state.resources.compute.eq(100)).toBe(true);
    expect(state.prestige.legacyWeights.eq(0)).toBe(true); // defaulted
    expect(state.prestige.ships).toBe(0);
    expect(state.heat).toBe(0);
    expect(state.lifetimeMoney.eq(50)).toBe(true); // backfilled from money
    expect(state.run.active).toBe(false);
  });
});
