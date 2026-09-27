import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { grantDailyBoost } from "./actions";
import { derive } from "./derive";
import { earnedReputation, nextRecordProgress, recordsCount } from "./reputation";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { ActiveModifier, GameState } from "./types";

/**
 * Compute records pay permanent Lab Reputation, one per power of ten the career-peak
 * Compute/sec crosses. The peak used to be measured on the boosted rate, so a stacked
 * timed boost (Daily Boost, an Objective reward, a world-event buff, ship momentum)
 * pulled a record forward that the lab couldn't reach on its own. The peak is now
 * measured with timed buffs divided out (boostFreeDerive), the same rule Legacy uses.
 */

function lab(): GameState {
  const s = createInitialState();
  s.prestige.ships = 5;
  s.stats.totalShips = 5;
  s.research = balance.research.map((r) => r.id);
  s.upgrades = { ...s.upgrades, rack_basic: 20, rack_server: 10, rack_tpu: 5, monetize: 5, batching: 3 };
  return s;
}

const computeBuff = (id: string, factor: number, sec: number): ActiveModifier =>
  ({ id, target: "computeMult", factor, remainingSec: sec, label: `x${factor}`, tone: "good" });

function run(s: GameState, ticks: number): GameState {
  for (let i = 0; i < ticks; i++) s = tick(s, 100);
  return s;
}

describe("a timed boost can't pull a Compute record forward", () => {
  it("a x10 compute buff leaves the career peak (and the records ladder) where boost-free play puts it", () => {
    const base = lab();
    const free = derive(base).computePerSec;
    expect(free.gt(Big.of(1e4))).toBe(true); // past the records floor, so records are live
    const plain = run(base, 20);
    const boosted = run({ ...lab(), modifiers: [computeBuff("obj_o_compute", 10, 60)] }, 20);
    // The boost really did raise the live rate…
    expect(derive(boosted).computePerSec.gt(free.mul(5))).toBe(true);
    // …but the peak, the records and the Rep they pay match boost-free play.
    expect(boosted.stats.peakComputePerSec.toNumber()).toBeCloseTo(plain.stats.peakComputePerSec.toNumber(), 6);
    expect(recordsCount(boosted)).toBe(recordsCount(plain));
    expect(nextRecordProgress(boosted)).toBeCloseTo(nextRecordProgress(plain), 9);
    expect(earnedReputation(boosted)).toBe(earnedReputation(plain));
  });

  it("the Daily Boost stacked with a world-event buff and ship momentum is divided out too", () => {
    const plain = run(lab(), 20);
    let s = grantDailyBoost(lab());
    s = { ...s, modifiers: [...s.modifiers, computeBuff("ev_boom_computeMult", 1.8, 60), computeBuff("momentum_computeMult", 1.4, 60)] };
    const boosted = run(s, 20);
    expect(boosted.stats.peakComputePerSec.toNumber()).toBeCloseTo(plain.stats.peakComputePerSec.toNumber(), 6);
    expect(recordsCount(boosted)).toBe(recordsCount(plain));
  });

  it("honest play records its live rate exactly, and a debuff still counts as it always has", () => {
    const s = run(lab(), 5);
    expect(s.stats.peakComputePerSec.eq(derive(lab()).computePerSec)).toBe(true);
    const hurt = { ...lab(), modifiers: [{ ...computeBuff("ev_outage_computeMult", 0.5, 60), tone: "bad" as const }] };
    const after = run(hurt, 5);
    expect(after.stats.peakComputePerSec.eq(derive(hurt).computePerSec)).toBe(true);
  });

  it("a record already earned is kept: the peak never goes down", () => {
    const s = lab();
    s.stats.peakComputePerSec = Big.of(1e15); // earned earlier (even with a boost, before this change)
    const held = recordsCount(s);
    const after = run({ ...s, modifiers: [computeBuff("daily_computeMult", 2, 60)] }, 10);
    expect(after.stats.peakComputePerSec.eq(Big.of(1e15))).toBe(true);
    expect(recordsCount(after)).toBe(held);
  });
});
