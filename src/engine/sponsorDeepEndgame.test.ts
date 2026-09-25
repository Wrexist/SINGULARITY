import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { rollSponsor, sponsorView } from "./contracts";
import { serialize, deserialize } from "./save";
import { contracts as CONTRACTS } from "./balance/contracts";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * The daily sponsor past a JS number's range.
 *
 * A sponsor's target is anchored at "your current best × 1.2–1.4", read as a number.
 * All-time earnings and peak Compute/sec are Bigs that a deep-endgame lab carries far
 * past 1.8e308, where that read is Infinity: the roll set target = Infinity, the card
 * read "∞ / ∞" with a NaN progress bar, the objective was met the moment it was rolled
 * (Infinity ≥ Infinity — a free daily claim), and the save wrote the target as null, so
 * the loader dropped the sponsor on every reload.
 */

function deepLab(): GameState {
  const s = createInitialState();
  return {
    ...s,
    prestige: { ...s.prestige, ships: 400 },
    // The whole ladder is cleared, so the sponsor is the board.
    contracts: { completed: CONTRACTS.pool.map((c) => c.id) },
    stats: {
      ...s.stats,
      totalShips: 400,
      totalMoney: Big.of("1e420"),
      peakComputePerSec: Big.of("1e380"),
      peakMau: 2_000_000,
      peakMrr: 90_000,
    },
  };
}

describe("the daily sponsor in the deep endgame", () => {
  it("always rolls a finite, beatable target", () => {
    for (let day = 20_000; day < 20_060; day++) {
      const s = rollSponsor(deepLab(), day);
      const sp = s.sponsor!;
      expect(sp).not.toBeNull();
      expect(Number.isFinite(sp.target)).toBe(true);
      const view = sponsorView(s)!;
      expect(Number.isFinite(view.progress)).toBe(true);
      expect(view.ready).toBe(false); // a fresh goal, not a free claim
    }
  });

  it("survives a save and reload", () => {
    for (let day = 20_000; day < 20_060; day++) {
      const s = rollSponsor(deepLab(), day);
      expect(deserialize(serialize(s)).sponsor).toEqual(s.sponsor);
    }
  });

  it("still rolls on a lab with no product history (only the huge lanes started)", () => {
    const base = deepLab();
    const s = rollSponsor({ ...base, stats: { ...base.stats, peakMau: 0, peakMrr: 0 } }, 20_001);
    expect(Number.isFinite(s.sponsor!.target)).toBe(true);
  });
});
