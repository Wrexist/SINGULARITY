import { describe, it, expect, afterEach } from "vitest";
import { powerStats } from "./power";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { balance } from "./balance/config";

/**
 * PHASE 2 power/heat foundation. The system is flagged OFF by default — the most
 * important guarantee here is that the flag-off path leaves the live economy
 * untouched. The math is tested directly (pure), and the enabled path is checked
 * by temporarily flipping the flag.
 */
describe("power & heat (Phase 2 foundation)", () => {
  afterEach(() => {
    balance.power.enabled = false; // never leak the flag between tests
  });

  it("computes draw from rack tiers and reads no throttle within budget", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 4 }; // 4 * 0.5kW = 2kW, well under base capacity
    const p = powerStats(s);
    expect(p.drawKw).toBeCloseTo(4 * balance.power.drawPerRackKw[0]!, 6);
    expect(p.capacityKw).toBe(balance.power.baseCapacityKw);
    expect(p.thermalFactor).toBe(1);
    expect(p.throttled).toBe(false);
  });

  it("throttles when draw exceeds capacity, clamped at the floor", () => {
    const s = createInitialState();
    s.upgrades = { rack_tpu: 100 }; // 100 * 8kW = 800kW >> 50kW base
    const p = powerStats(s);
    expect(p.throttled).toBe(true);
    expect(p.thermalFactor).toBe(balance.power.throttleFloor); // capacity/draw < floor → floored
    expect(p.thermalFactor).toBeGreaterThanOrEqual(balance.power.throttleFloor);
  });

  it("thermalFactor equals capacity/draw in the soft-throttle band", () => {
    const s = createInitialState();
    // 30 servers * 2kW = 60kW vs 50kW base → 50/60 ≈ 0.833 (above the 0.25 floor)
    s.upgrades = { rack_server: 30 };
    const p = powerStats(s);
    expect(p.thermalFactor).toBeCloseTo(50 / 60, 6);
  });

  it("is a NO-OP in derive when disabled (default) — live economy unchanged", () => {
    const s = createInitialState();
    s.upgrades = { rack_tpu: 100 }; // would heavily throttle IF enabled
    const before = derive(s).computePerSec;
    expect(balance.power.enabled).toBe(false);
    // disabled → full compute, no throttle applied
    const flat = derive(s).computePerSec;
    expect(flat.eq(before)).toBe(true);
  });

  it("applies the throttle in derive when enabled", () => {
    const s = createInitialState();
    s.upgrades = { rack_tpu: 100 };
    const full = derive(s).computePerSec; // disabled
    balance.power.enabled = true;
    const throttled = derive(s).computePerSec;
    expect(throttled.lt(full)).toBe(true);
    expect(throttled.eq(full.mul(balance.power.throttleFloor))).toBe(true);
  });
});
