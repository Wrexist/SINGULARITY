import { describe, it, expect } from "vitest";
import { deserialize, serialize } from "./save";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { Big } from "./math/Big";
import { productFeatures } from "./balance/products";
import type { GameState } from "./types";

/**
 * Hostile saves, round 2. A backup is text a player can paste from anywhere, so each
 * loaded field must come back in a shape the runtime itself could have produced.
 * These are the holes the round-2 persistence fuzz found past the first hardening
 * passes (saveLimits.test.ts, security.test.ts).
 */

function blob(overrides: Record<string, unknown>): string {
  return JSON.stringify({ version: 38, ...overrides });
}

const product = (over: Record<string, unknown> = {}) => ({
  id: "prod-1", name: "P", type: "general", version: 1, quality: 10, priceMult: 1,
  enterprise: false, enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 },
  mau: 1000, paid: 50, buzzSec: 0, ageSec: 100, upgrade: null, features: [], ...over,
});

const productsOf = (active: unknown[], extra: Record<string, unknown> = {}) =>
  ({ active, drafts: [], frontier: 10, sold: 0, milestones: [], ...extra });

/** A lab with racks, so a tick visibly moves every lane. */
function runningLab(): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 10, rack_server: 2 };
  s.resources = { compute: Big.of(1000), data: Big.of(1000), money: Big.of(1000) };
  return s;
}

describe("product features load as the catalogue's own ids", () => {
  const known = productFeatures.map((f) => f.id);

  it("drops unknown feature ids, so a pasted flood can't slow every tick", () => {
    // featureMods walks every id on every product, every tick (and every render). A
    // flood of made-up ids used to load verbatim — 200K of them made one tick take
    // ~100ms — and the next autosave wrote them straight back.
    const junk = Array.from({ length: 20_000 }, (_, i) => `junk_${i}`);
    const g = deserialize(blob({ products: productsOf([product({ features: [...junk, known[0]!] })]) }));
    expect(g.products.active[0]!.features).toEqual([known[0]]);
  });

  it("keeps every real feature a product owns, in order", () => {
    const owned = known.slice(0, 3).reverse();
    const g = deserialize(blob({ products: productsOf([product({ features: owned })]) }));
    expect(g.products.active[0]!.features).toEqual(owned);
  });
});

describe("ship log cap", () => {
  const entry = { mode: "deploy", era: 1, asc: false };

  it("a lab with no ships on record loads no Archive entries", () => {
    // The log is capped at min(shipLogCap, totalShips) via slice(-n) — and slice(-0)
    // is slice(0), the WHOLE array. So a save claiming zero ships kept every entry it
    // carried: 5K rows in the Archive, rebuilt on every tick while it was open.
    const shipLog = Array.from({ length: 5_000 }, () => ({ ...entry }));
    const g = deserialize(blob({ shipLog, stats: { totalShips: 0 } }));
    expect(g.shipLog).toEqual([]);
  });

  it("still keeps the newest entries up to the ships on record", () => {
    const shipLog = Array.from({ length: 10 }, (_, i) => ({ ...entry, gen: i + 1 }));
    const g = deserialize(blob({ shipLog, stats: { totalShips: 3 } }));
    expect(g.shipLog.map((e) => e.gen)).toEqual([8, 9, 10]);
  });
});

describe("product ids that can't key a plain object", () => {
  it("a product saved as '__proto__' can't turn the portfolio's numbers into NaN", () => {
    // The staff fold keys per-product buffs by id in plain objects, and assigning to
    // obj["__proto__"] sets the prototype instead of a key: the product then read
    // Object.prototype as its buffs, its users/subscribers went NaN on the next tick,
    // and so did the career peaks folded from them (which the next reload zeroed).
    const g = deserialize(blob({
      prestige: { legacyWeights: "0", ships: 3 },
      products: productsOf([product(), product({ id: "__proto__" })]),
    }));
    let t = g;
    for (let i = 0; i < 5; i++) t = tick(t, 1000);
    for (const p of t.products.active) {
      expect(Number.isFinite(p.mau)).toBe(true);
      expect(Number.isFinite(p.paid)).toBe(true);
    }
    expect(Number.isFinite(t.stats.peakMau)).toBe(true);
    expect(Number.isFinite(t.stats.peakMrr)).toBe(true);
    // The honest product is untouched.
    expect(t.products.active.map((p) => p.id)).toContain("prod-1");
  });
});

describe("timed buffs load as the runtime makes them", () => {
  const buff = { id: "evt", target: "computeMult", factor: 1.5, remainingSec: 600, label: "Buff", tone: "good" };

  it("a buff with a zero or negative factor is dropped (no negative Compute)", () => {
    // Every buff/debuff the game grants multiplies by a positive factor. A crafted
    // factor of −1 flipped Compute production negative and drained the bank below 0.
    const save = JSON.parse(serialize(runningLab()));
    save.modifiers = [{ ...buff, factor: -1 }, { ...buff, id: "zero", factor: 0 }];
    const g = deserialize(JSON.stringify(save));
    expect(g.modifiers).toEqual([]);
    const t = tick(g, 5_000);
    expect(t.resources.compute.gte(0)).toBe(true);
  });

  it("the same buff id loads once, like the runtime replaces it", () => {
    // Granting a buff replaces any live one with its id; a pasted save that repeated
    // the Daily Boost 40 times stacked it 40 times over.
    const save = JSON.parse(serialize(runningLab()));
    save.modifiers = Array.from({ length: 40 }, (_, i) => ({ ...buff, remainingSec: 600 - i }));
    const g = deserialize(JSON.stringify(save));
    expect(g.modifiers.length).toBe(1);
    // The newest grant (last in the list) is the one the runtime would hold.
    expect(g.modifiers[0]!.remainingSec).toBe(561);
  });

  it("an honest buff stack is untouched", () => {
    const s = runningLab();
    s.modifiers = [
      { id: "a", target: "computeMult", factor: 1.5, remainingSec: 60, label: "A", tone: "good" },
      { id: "b", target: "dataMult", factor: 0.7, remainingSec: 90, label: "B", tone: "bad", worked: true },
      { id: "regulator_truce", target: "moneyMult", factor: 1, remainingSec: 300, label: "Truce", tone: "bad" },
    ];
    expect(deserialize(serialize(s)).modifiers).toEqual(s.modifiers);
  });
});
