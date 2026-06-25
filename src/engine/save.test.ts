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

  it("preserves computeFocus through a round-trip, and backfills it on a v4 save", () => {
    const s = createInitialState();
    s.computeFocus = 0.4;
    expect(deserialize(serialize(s)).computeFocus).toBe(0.4);
    const v4 = {
      version: 4,
      resources: { compute: "1", data: "1", money: "1" },
      upgrades: {}, research: [],
      run: { active: false, progress: 0, readyToClaim: false },
      prestige: { legacyWeights: "0", ships: 0 },
      lifetimeMoney: "1", heat: 0, modifiers: [], alignment: 0,
    };
    expect(migrate(v4).computeFocus).toBe(1); // v4 → v5 backfill (full training)
  });

  it("preserves faction alignment through a round-trip, and backfills it on a v3 save", () => {
    const s = createInitialState();
    s.alignment = -0.5;
    expect(deserialize(serialize(s)).alignment).toBe(-0.5);
    const v3 = {
      version: 3,
      resources: { compute: "1", data: "1", money: "1" },
      upgrades: {}, research: [],
      run: { active: false, progress: 0, readyToClaim: false },
      prestige: { legacyWeights: "0", ships: 0 },
      lifetimeMoney: "1", heat: 0, modifiers: [],
    };
    expect(migrate(v3).alignment).toBe(0); // v3 → v4 backfill
  });

  it("round-trips active modifiers", () => {
    const s = createInitialState();
    s.modifiers = [
      { id: "viral_demo", target: "moneyMult", factor: 2, remainingSec: 30, label: "Viral Demo", tone: "good" },
    ];
    expect(deserialize(serialize(s)).modifiers).toEqual(s.modifiers);
  });

  it("drops malformed modifiers and clamps out-of-range Heat on load", () => {
    const raw = JSON.stringify({
      version: SAVE_VERSION,
      resources: { compute: "0", data: "0", money: "0" },
      upgrades: {},
      research: [],
      run: { active: false, progress: 0, readyToClaim: false },
      prestige: { legacyWeights: "0", ships: 0 },
      lifetimeMoney: "0",
      heat: 999, // out of range → clamped to 100
      modifiers: [
        { id: "ok", target: "dataMult", factor: 1.5, remainingSec: 10, label: "Good", tone: "good" },
        { id: "bad", target: "notATarget", factor: 1, remainingSec: 10, label: "X", tone: "good" }, // dropped
        { id: "expired", target: "dataMult", factor: 1.5, remainingSec: 0, label: "X", tone: "good" }, // dropped
      ],
    });
    const state = deserialize(raw);
    expect(state.heat).toBe(100);
    expect(state.modifiers).toHaveLength(1);
    expect(state.modifiers[0]!.id).toBe("ok");
  });

  it("round-trips a well-formed product, but rejects a products block with a malformed entry", () => {
    // Good entry survives.
    const good = createInitialState();
    good.products = {
      frontier: 3,
      sold: 0,
      drafts: [],
      milestones: [],
      assignments: {},
      active: [{ id: "prod-1", name: "Nimbus", type: "general", version: 1, quality: 2, priceMult: 1, marketingPerSec: 0, mau: 10, paid: 2, buzzSec: 0, upgrade: null, features: [], enterprise: false, enterprisePrice: 1 }],
    };
    expect(deserialize(serialize(good)).products.active).toHaveLength(1);

    // A NaN/zero-priceMult entry would poison Money via simulateProducts → the
    // whole products block is rejected and falls back to a fresh (empty) one.
    const raw = JSON.parse(serialize(good));
    raw.products.active[0].paid = "not a number";
    const recovered = deserialize(JSON.stringify(raw));
    expect(recovered.products.active).toHaveLength(0);
    expect(Number.isFinite(recovered.products.frontier)).toBe(true);
  });

  it("round-trips drafts and an in-flight timed upgrade (v7)", () => {
    const s = createInitialState();
    s.products = {
      frontier: 5,
      sold: 0,
      drafts: [{ id: "draft-2", quality: 4, ships: 2 }],
      milestones: [],
      assignments: {},
      active: [{
        id: "prod-1", name: "Cortex", type: "code", version: 3, quality: 4,
        priceMult: 1, marketingPerSec: 0, mau: 100, paid: 20, buzzSec: 0,
        upgrade: { targetVersion: 4, remainingCompute: 1000, remainingData: 100, remainingSec: 30, totalSec: 90 },
        features: [],
        enterprise: false, enterprisePrice: 1,
      }],
    };
    const back = deserialize(serialize(s)).products;
    expect(back.drafts).toHaveLength(1);
    expect(back.drafts[0]!.quality).toBe(4);
    expect(back.active[0]!.upgrade!.targetVersion).toBe(4);
    expect(back.active[0]!.upgrade!.remainingSec).toBe(30);

    // A malformed upgrade is dropped (product kept, just no in-flight research).
    const raw = JSON.parse(serialize(s));
    raw.products.active[0].upgrade.remainingSec = "soon";
    const recovered = deserialize(JSON.stringify(raw));
    expect(recovered.products.active).toHaveLength(1);
    expect(recovered.products.active[0]!.upgrade).toBeNull();
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
    expect(state.modifiers).toEqual([]); // defaulted when missing
    expect(state.lifetimeMoney.eq(50)).toBe(true); // backfilled from money
    expect(state.run.active).toBe(false);
  });
});
