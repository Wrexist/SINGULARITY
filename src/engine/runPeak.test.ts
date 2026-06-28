import { describe, it, expect } from "vitest";
import { tick } from "./tick";
import { prestige } from "./prestige";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

/**
 * Generation-scoped peaks (R4.x review fix): the Generation Report must show THIS
 * run's high-water marks, not all-time career peaks. tick() accrues them monotonically
 * within a generation; prestige() snapshots them into lastShipReport then resets.
 */
describe("run-scoped peaks for the Generation Report", () => {
  it("tick accrues run peak compute and never drops it within a generation", () => {
    let s = createInitialState();
    s = tick(s, 1000);
    const afterOne = s.runPeakCompute;
    expect(afterOne.gt(Big.ZERO)).toBe(true); // base compute counts

    // Artificially raise the recorded peak, then tick again at the (lower) base rate:
    // the peak must hold, not fall back to the current rate.
    s = { ...s, runPeakCompute: Big.of(1e9) };
    s = tick(s, 1000);
    expect(s.runPeakCompute.gte(Big.of(1e9))).toBe(true);
  });

  it("prestige snapshots the run's peaks into lastShipReport, then resets them", () => {
    let s = createInitialState();
    s.research = [balance.prestige.capabilityResearch]; // ship-eligible
    s.lifetimeMoney = Big.of(1e9);
    s = { ...s, runPeakCompute: Big.of(12_345), runPeakMrr: 678 };

    const after = prestige(s, "deploy");
    // The report carries the just-finished run's peaks…
    expect(after.lastShipReport?.peakCompute.eq(Big.of(12_345))).toBe(true);
    expect(after.lastShipReport?.peakMrr).toBe(678);
    // …and the fresh run starts its own peaks from zero.
    expect(after.runPeakCompute.eq(Big.ZERO)).toBe(true);
    expect(after.runPeakMrr).toBe(0);
  });

  it("a fresh lab has no prior ship report", () => {
    expect(createInitialState().lastShipReport).toBeNull();
  });
});
