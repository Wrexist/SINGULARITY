import { describe, it, expect } from "vitest";
import { deserialize } from "./save";
import { productFeatures } from "./balance/products";

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
