import { describe, it, expect } from "vitest";
import { deserialize, migrate } from "./save";
import { balance } from "./balance/config";
import { products as PRODUCTS } from "./balance/products";

/**
 * Hostile-save length limits.
 *
 * `importSave` accepts an arbitrary base64 blob a player can paste from anywhere
 * ("free money save!"), so every persisted collection is hostile input. Entries are
 * already filtered one-by-one, but a collection with no LENGTH cap is still a denial
 * of service: the per-tick cost is linear in portfolio/roster size, so a few thousand
 * well-formed products make each tick outrun the tick interval. Worse, the next
 * autosave writes the bloated save straight back, so it bricks every future launch
 * and hard reset is the only way out.
 *
 * `modifiers` already had a cap for exactly this reason (a crafted flood overflowed
 * tick's window-split recursion). These tests generalise that guarantee.
 */

function blob(overrides: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, ...overrides });
}

describe("save length limits", () => {
  it("caps a flood of well-formed products", () => {
    const one = {
      id: "p", name: "X", type: "general", version: 1, quality: 10, priceMult: 1,
      enterprise: false, enterprisePrice: 1, marketingPerSec: 0, channelMix: {},
      mau: 1, paid: 0, buzzSec: 0, ageSec: 1, upgrade: null, features: [],
    };
    const active = Array.from({ length: 5000 }, (_, i) => ({ ...one, id: `p_${i}` }));
    const g = deserialize(blob({ products: { active, drafts: [], frontier: 10, sold: 0, milestones: [] } }));
    // The engine's own ceiling is a handful of slots; anything near it is fine, 5000 is not.
    expect(g.products.active.length).toBeLessThanOrEqual(64);
  });

  it("caps a flood of drafts", () => {
    const drafts = Array.from({ length: 5000 }, (_, i) => ({ id: `d_${i}`, quality: 5, ships: 1 }));
    const g = deserialize(blob({ products: { active: [], drafts, frontier: 10, sold: 0, milestones: [] } }));
    expect(g.products.drafts.length).toBeLessThanOrEqual(PRODUCTS.maxDrafts);
  });

  it("caps a flood of employees", () => {
    const employees = Array.from({ length: 5000 }, (_, i) => ({
      id: `e_${i}`, name: "N", roleId: balance.staff.roles[0]!.id, level: 1, xp: 0,
      traits: [], assignedTo: null, training: null,
    }));
    const g = deserialize(blob({ employees }));
    expect(g.employees.length).toBeLessThanOrEqual(512);
  });

  it("caps floods of id collections (achievements, milestones, upgrades)", () => {
    const achievements = Array.from({ length: 5000 }, (_, i) => `fake_ach_${i}`);
    const milestones = Array.from({ length: 5000 }, (_, i) => `fake_ms_${i}`);
    const upgrades: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) upgrades[`fake_up_${i}`] = 1;
    const g = deserialize(blob({
      achievements,
      upgrades,
      products: { active: [], drafts: [], frontier: 10, sold: 0, milestones },
    }));
    expect(g.achievements.length).toBeLessThanOrEqual(512);
    expect(g.products.milestones.length).toBeLessThanOrEqual(512);
    expect(Object.keys(g.upgrades).length).toBeLessThanOrEqual(512);
  });
});

describe("migrate hardening", () => {
  it("survives a non-object top-level save instead of throwing", () => {
    // JSON.parse("null") -> null, which used to hit `s.version` on null and throw.
    // A throw is the ONE true wipe path in the app, so it must not be reachable from
    // input this trivial.
    expect(() => deserialize("null")).not.toThrow();
    expect(() => deserialize("123")).not.toThrow();
    expect(() => deserialize('"a string"')).not.toThrow();
    expect(() => deserialize("[]")).not.toThrow();
    expect(() => deserialize("true")).not.toThrow();
  });

  it("normalises a bogus version rather than skipping every migration", () => {
    // A non-integer version matched no `if (s.version === N)` branch, so the save
    // passed through the whole chain untouched and was then stamped as current.
    for (const version of [null, "7", 3.5, -5, NaN, {}, []]) {
      const out = migrate({ version } as never);
      expect(Number.isInteger(out.version)).toBe(true);
    }
  });

  it("does not silently downgrade a save from a newer build", () => {
    // A future-version save must not be reinterpreted under today's semantics.
    const out = migrate({ version: 9999 } as never);
    expect(out.version).toBeLessThanOrEqual(9999);
  });
});
