import { describe, it, expect } from "vitest";
import { tick } from "./tick";
import { prestige } from "./prestige";
import { serialize, deserialize, migrate } from "./save";
import { createInitialState, SAVE_VERSION } from "./state";
import { addEmployee } from "./employees";
import { Big } from "./math/Big";
import { balance } from "./balance/config";

function earning() {
  // A state that actually earns money each tick (passive money research + compute).
  const s = createInitialState();
  s.resources.compute = Big.of(1e6);
  s.upgrades = { rack_basic: 20 };
  s.research = [balance.prestige.capabilityResearch]; // also makes prestige eligible
  return s;
}

describe("lifetime stats", () => {
  it("starts zeroed and accrues playtime + peak compute, never decreasing", () => {
    const s = createInitialState();
    expect(s.stats.totalShips).toBe(0);
    expect(s.stats.playtimeSec).toBe(0);
    const a = tick(s, 1000);
    expect(a.stats.playtimeSec).toBeCloseTo(1, 3);
    expect(a.stats.peakComputePerSec.gte(s.stats.peakComputePerSec)).toBe(true);
    const b = tick(a, 1000);
    expect(b.stats.playtimeSec).toBeGreaterThan(a.stats.playtimeSec);
    expect(b.stats.peakComputePerSec.gte(a.stats.peakComputePerSec)).toBe(true);
  });

  it("peak compute is monotonic even if the rate later drops", () => {
    let s = earning();
    s = tick(s, 1000);
    const peak = s.stats.peakComputePerSec;
    // Remove the racks → compute rate falls, but the recorded peak must hold.
    s = { ...s, upgrades: {} };
    s = tick(s, 1000);
    expect(s.stats.peakComputePerSec.eq(peak)).toBe(true);
  });

  it("a ship bumps totalShips + totalLegacy and the stats survive the reset", () => {
    let s = earning();
    s.lifetimeMoney = Big.of(1e9); // enough to grant legacy weights
    s = tick(s, 1000);
    const before = s.stats;
    const shipped = prestige(s);
    expect(shipped.stats.totalShips).toBe(before.totalShips + 1);
    expect(shipped.stats.totalLegacy.gt(before.totalLegacy)).toBe(true);
    expect(shipped.stats.playtimeSec).toBe(before.playtimeSec); // carried, not reset
  });

  it("hiring bumps employeesHired", () => {
    const s = createInitialState();
    const hired = addEmployee(s, { id: "e1", name: "Ada Lovelace", roleId: "staff_engineer", level: 1, trait: null, assignedProductId: null, training: null });
    expect(hired.stats.employeesHired).toBe(1);
  });

  it("round-trips through save and backfills a v8 save (v8 → v9)", () => {
    let s = earning();
    s.lifetimeMoney = Big.of(5000);
    s = tick(s, 2000);
    const restored = deserialize(serialize(s));
    expect(restored.stats.playtimeSec).toBeCloseTo(s.stats.playtimeSec, 3);
    expect(restored.stats.totalMoney.eq(s.stats.totalMoney)).toBe(true);

    // A v8 save (no stats block) backfills from ships/legacy/money.
    const v8 = {
      version: 8,
      resources: { compute: "1", data: "1", money: "1" },
      upgrades: {}, research: ["a", "b"],
      run: { active: false, progress: 0, readyToClaim: false },
      prestige: { legacyWeights: "42", ships: 3 },
      lifetimeMoney: "12345", heat: 0, modifiers: [], alignment: 0, computeFocus: 1,
      products: { active: [], drafts: [], frontier: 1, sold: 0, milestones: [] },
      employees: [],
    };
    const migrated = migrate(v8) as any;
    expect(migrated.version).toBe(SAVE_VERSION);
    const loaded = deserialize(JSON.stringify(v8));
    expect(loaded.stats.totalShips).toBe(3);
    expect(loaded.stats.totalLegacy.eq(Big.of(42))).toBe(true);
    expect(loaded.stats.totalMoney.eq(Big.of(12345))).toBe(true);
    expect(loaded.stats.peakResearchCount).toBe(2);
  });
});
