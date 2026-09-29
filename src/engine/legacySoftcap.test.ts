import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import {
  legacyWeightsGain, legacyWeightsForMode, nextRunMultiplier, prestige,
  softcapLegacyGain, legacySoftcapWeights, legacyWeightMoneyStep,
} from "./prestige";
import { legacyMultiplier } from "./derive";
import { legacyAvailable } from "./legacyTree";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Legacy softcap above x10 (owner-approved, round 8). Veterans reach x1e6+ Legacy
 * multipliers and seconds-long runs. The weights a FUTURE Ship earns now meet
 * diminishing returns once the multiplier is above x10; the stock a player already
 * holds is never touched, so no save's multiplier goes down. The balance sim peaks
 * at x2.9, far below the cap, so it is byte-identical.
 */

const { multiplierPerPoint: per, multiplierExponent: ex } = balance.prestige;
/** The weights that give a Legacy multiplier of `m`. */
const weightsFor = (m: number) => Big.of(((m - 1) / per) ** (1 / ex));

/** A ship-ready lab holding `stock` weights with `money` earned this run. */
function lab(stock: Big, money: Big): GameState {
  const s = createInitialState();
  s.prestige.ships = 40;
  s.stats.totalShips = 40;
  s.research = balance.research.map((r) => r.id);
  s.prestige.legacyWeights = stock;
  s.lifetimeMoney = money;
  return s;
}

describe("Legacy softcap above x10", () => {
  it("the cap sits at the weights that make x10", () => {
    expect(legacyMultiplier(legacySoftcapWeights()).toNumber()).toBeCloseTo(balance.prestige.legacySoftcapAt, 6);
  });

  it("a x5 player's next Ship pays exactly what it did", () => {
    const stock = weightsFor(5);
    const s = lab(stock, Big.of(1e11)); // raw gain 1000 weights: x5 -> x8.4, under the cap
    const raw = legacyWeightsGain(s);
    expect(raw.toNumber()).toBe(1000);
    expect(legacyWeightsForMode(s, "deploy").toNumber()).toBe(1000);
    expect(softcapLegacyGain(stock, raw)).toBe(raw);
  });

  it("a x1e6 veteran's next Ship meets diminishing returns, and keeps every weight it had", () => {
    const stock = weightsFor(1e6);
    // A Ship that would double their weights (x1e6 -> about x1.74e6 uncapped).
    const s = lab(stock, stock.pow(2).mul(balance.prestige.scale));
    const raw = legacyWeightsGain(s);
    expect(raw.div(stock).toNumber()).toBeCloseTo(1, 6);
    const paid = legacyWeightsForMode(s, "deploy");
    // Softened, but a Ship still visibly moves a veteran: between 5% and 25% of raw.
    expect(paid.lt(raw.div(4))).toBe(true);
    expect(paid.gt(raw.div(20))).toBe(true);
    const after = prestige(s);
    expect(after.prestige.legacyWeights.toNumber()).toBeCloseTo(stock.add(paid).toNumber(), 0);
    // Never down: the fresh run starts at least where the veteran was.
    expect(legacyMultiplier(legacyAvailable(after)).gte(legacyMultiplier(stock))).toBe(true);
    // ...and the multiplier grows by a noticeable step, not a frozen 0.0x%.
    expect(legacyMultiplier(after.prestige.legacyWeights).div(legacyMultiplier(stock)).toNumber()).toBeGreaterThan(1.02);
    // The Ship panel quotes the multiplier the Ship really leaves.
    expect(nextRunMultiplier(s).toNumber()).toBeCloseTo(legacyMultiplier(after.prestige.legacyWeights).toNumber(), 6);
  });

  it("is smooth across x10 and never pays less for earning more", () => {
    const cap = legacySoftcapWeights();
    // Just under the cap, a small Ship pays in full; one that crosses it keeps the
    // part below x10 in full and softens only the part above.
    const under = cap.sub(100);
    expect(softcapLegacyGain(under, Big.of(50)).toNumber()).toBe(50);
    const crossing = softcapLegacyGain(under, Big.of(300)).toNumber();
    expect(crossing).toBeGreaterThan(100);
    expect(crossing).toBeLessThan(300);
    let prev = 0;
    for (const g of [1, 10, 100, 1e3, 1e4, 1e6, 1e9, 1e15, 1e40]) {
      const paid = softcapLegacyGain(under, Big.of(g)).toNumber();
      expect(paid).toBeGreaterThanOrEqual(prev);
      expect(paid).toBeLessThanOrEqual(g);
      prev = paid;
    }
    // At the cap the rate is continuous: a tiny gain pays (almost) in full.
    expect(softcapLegacyGain(cap, Big.of(1)).toNumber()).toBeCloseTo(1, 3);
    // Huge stocks stay finite and positive (no precision collapse to 0 or NaN).
    const huge = softcapLegacyGain(Big.of("1e300"), Big.of("1e305"));
    expect(huge.isFinite() && huge.gt(0)).toBe(true);
  });

  it("the 'Progress to next Legacy Weight' bar measures the weight the Ship will really pay", () => {
    const paidAt = (s: GameState, m: Big) => legacyWeightsForMode({ ...s, lifetimeMoney: m }, "deploy").toNumber();
    const scale = balance.prestige.scale;
    // Below the cap: exactly the plain weight curve, weight n at scale × n².
    const low = lab(weightsFor(5), Big.of(scale * 100.25 ** 2));
    const a = legacyWeightMoneyStep(low)!;
    expect(a.at.toNumber() / (scale * 100 ** 2)).toBeCloseTo(1, 9);
    expect(a.next.toNumber() / (scale * 101 ** 2)).toBeCloseTo(1, 9);

    // A x20 player: the step brackets the softcapped count the Ship will pay, and one
    // more PAID weight costs far more Money than one more raw weight.
    const stock = weightsFor(20);
    const s = lab(stock, Big.of(scale * 2000 ** 2)); // raw 2000 weights
    const paid = paidAt(s, s.lifetimeMoney);
    expect(paid).toBeLessThan(2000);
    const b = legacyWeightMoneyStep(s)!;
    expect(b.at.lte(s.lifetimeMoney) && b.next.gt(s.lifetimeMoney)).toBe(true);
    expect(paidAt(s, b.at)).toBe(paid);
    expect(paidAt(s, b.next)).toBe(paid + 1);
    expect(paidAt(s, b.next.mul(1 - 1e-9))).toBe(paid);
    const rawStep = scale * (2001 ** 2 - 2000 ** 2);
    expect(b.next.sub(b.at).toNumber()).toBeGreaterThan(rawStep * 1.2);
  });
});
