import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { powerStats } from "./power";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { balance } from "./balance/config";

/**
 * PHASE 2 power/heat. The math is pure; we flip the `enabled` flag explicitly per
 * test and always restore it so flag state never leaks between tests.
 */
/** Configured kW gain of a power-capacity upgrade (so tests follow rebalances). */
function capPerLevel(id: string): number {
  const u = balance.upgrades.find((x) => x.id === id);
  return u && u.effect.kind === "powerCapacity" ? u.effect.perLevel : 0;
}
const draw = balance.power.drawPerRackKw;
const baseCap = balance.power.baseCapacityKw;

describe("power & heat (Phase 2)", () => {
  let original: boolean;
  beforeEach(() => { original = balance.power.enabled; });
  afterEach(() => { balance.power.enabled = original; });

  it("computes draw from rack tiers and reads no throttle within budget", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 4 }; // 4 * 0.5kW = 2kW, under the 50kW base
    const p = powerStats(s);
    expect(p.drawKw).toBeCloseTo(4 * balance.power.drawPerRackKw[0]!, 6);
    expect(p.capacityKw).toBe(balance.power.baseCapacityKw);
    expect(p.thermalFactor).toBe(1);
    expect(p.throttled).toBe(false);
  });

  it("power-capacity upgrades raise the budget", () => {
    const s = createInitialState();
    s.upgrades = { psu_bay: 2, cooling_loop: 1 };
    const p = powerStats(s);
    expect(p.capacityKw).toBe(baseCap + 2 * capPerLevel("psu_bay") + capPerLevel("cooling_loop"));
  });

  it("throttles when draw exceeds capacity, clamped at the floor", () => {
    const s = createInitialState();
    s.upgrades = { rack_tpu: 100 }; // 800kW >> 50kW
    const p = powerStats(s);
    expect(p.throttled).toBe(true);
    expect(p.thermalFactor).toBe(balance.power.throttleFloor);
  });

  it("thermalFactor equals capacity/draw in the soft-throttle band", () => {
    const s = createInitialState();
    s.upgrades = { rack_server: 30 }; // draw just over the base budget
    expect(powerStats(s).thermalFactor).toBeCloseTo(baseCap / (30 * draw[1]!), 6);
  });

  it("buying power capacity clears a throttle", () => {
    const s = createInitialState();
    s.upgrades = { rack_server: 30 }; // 60kW, throttled at 50kW base
    expect(powerStats(s).throttled).toBe(true);
    s.upgrades = { rack_server: 30, psu_bay: 1 }; // +40 → 90kW capacity > 60kW draw
    expect(powerStats(s).throttled).toBe(false);
    expect(powerStats(s).thermalFactor).toBe(1);
  });

  it("derive applies the throttle when enabled and not when disabled", () => {
    const s = createInitialState();
    s.upgrades = { rack_tpu: 100 };
    balance.power.enabled = false;
    const full = derive(s).computePerSec;
    balance.power.enabled = true;
    const throttled = derive(s).computePerSec;
    expect(throttled.lt(full)).toBe(true);
    expect(throttled.eq(full.mul(balance.power.throttleFloor))).toBe(true);
  });
});
