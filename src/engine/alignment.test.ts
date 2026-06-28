import { describe, it, expect } from "vitest";
import { alignmentProductionMods, alignmentHeatMult } from "./alignment";
import { derive } from "./derive";
import { buyDataOffer } from "./actions";
import { balance } from "./balance/config";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

const at = (a: number) => {
  const s = createInitialState();
  s.alignment = a;
  return s;
};

describe("alignment — production tilt", () => {
  it("is identity at neutral (curve/sim untouched)", () => {
    const mods = alignmentProductionMods(at(0));
    expect(mods.computeMult).toBe(1);
    expect(mods.moneyMult).toBe(1);
    // derive at neutral must equal a fresh-state derive exactly.
    const neutral = derive(at(0));
    const fresh = derive(createInitialState());
    expect(neutral.computePerSec.toNumber()).toBe(fresh.computePerSec.toNumber());
    expect(neutral.runMoneyYield.toNumber()).toBe(fresh.runMoneyYield.toNumber());
  });

  it("accelerationist trades money for compute", () => {
    const base = derive(at(0));
    const accel = derive(at(1));
    expect(accel.computePerSec.toNumber()).toBeGreaterThan(base.computePerSec.toNumber());
    // run money yield carries moneyMult, which the accel penalty lowers.
    expect(accel.runMoneyYield.toNumber()).toBeLessThan(base.runMoneyYield.toNumber());
  });

  it("doomer trades compute for money", () => {
    const base = derive(at(0));
    const doom = derive(at(-1));
    expect(doom.computePerSec.toNumber()).toBeLessThan(base.computePerSec.toNumber());
    expect(doom.runMoneyYield.toNumber()).toBeGreaterThan(base.runMoneyYield.toNumber());
  });

  it("scales linearly and matches the configured endpoints", () => {
    const full = alignmentProductionMods(at(1));
    expect(full.computeMult).toBeCloseTo(1 + balance.alignment.accelComputeBonus, 6);
    expect(full.moneyMult).toBeCloseTo(1 - balance.alignment.accelMoneyPenalty, 6);
    const half = alignmentProductionMods(at(0.5));
    expect(half.computeMult).toBeCloseTo(1 + 0.5 * balance.alignment.accelComputeBonus, 6);
  });
});

describe("alignment — heat generation", () => {
  it("is 1 at neutral, hotter toward accel, cooler toward doomer", () => {
    expect(alignmentHeatMult(at(0))).toBe(1);
    expect(alignmentHeatMult(at(1))).toBeCloseTo(balance.alignment.heatGenAtAccel, 6);
    expect(alignmentHeatMult(at(-1))).toBeCloseTo(balance.alignment.heatGenAtDoomer, 6);
  });

  it("a shady buy adds more heat at accel than neutral than doomer", () => {
    // A shady (risk-bearing) offer with a fixed roll past the raid/poison bands
    // (clean haul) so heat is the only thing we're comparing.
    const shady = balance.dataMarket.find((o) => o.risk && (o.heat ?? 0) > 0);
    expect(shady).toBeTruthy();
    const id = shady!.id;
    const cleanRoll = 0.999; // beyond raid+poison → clean, heat still applied
    const money = Big.of(1e9);
    const heatGain = (a: number) => {
      const s = at(a);
      s.resources.money = money;
      return buyDataOffer(s, id, cleanRoll).state.heat;
    };
    const hAccel = heatGain(1);
    const hNeutral = heatGain(0);
    const hDoomer = heatGain(-1);
    expect(hAccel).toBeGreaterThan(hNeutral);
    expect(hNeutral).toBeGreaterThan(hDoomer);
  });
});
