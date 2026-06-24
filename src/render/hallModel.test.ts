import { describe, it, expect } from "vitest";
import { buildHallModel } from "./hallModel";
import { createInitialState } from "../engine/state";

describe("hall view-model", () => {
  it("an empty lab has no racks and reads as era 0", () => {
    const m = buildHallModel(createInitialState());
    expect(m.total).toBe(0);
    expect(m.racks).toHaveLength(0);
    expect(m.era).toBe(0);
  });

  it("maps owned hardware to racks of the right tier (manifestation rule)", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 3, rack_server: 2, rack_tpu: 1 };
    const m = buildHallModel(s);
    expect(m.total).toBe(6);
    expect(m.racks.filter((r) => r.tier === 0)).toHaveLength(3);
    expect(m.racks.filter((r) => r.tier === 1)).toHaveLength(2);
    expect(m.racks.filter((r) => r.tier === 2)).toHaveLength(1);
  });

  it("caps drawn racks per tier (1000 GPUs ≠ 1000 boxes) but keeps density at 1", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 9999 };
    const m = buildHallModel(s);
    expect(m.total).toBeLessThanOrEqual(18); // rack_basic cap
    expect(m.racks.every((r) => r.density === 1)).toBe(true);
  });

  it("re-skins the era as the lab progresses", () => {
    const s = createInitialState();
    s.research = ["backprop", "curated_data"];
    expect(buildHallModel(s).era).toBe(1);
    s.research = [...s.research, "inference_api"];
    expect(buildHallModel(s).era).toBe(2);
    const shipped = createInitialState();
    shipped.prestige.ships = 1;
    expect(buildHallModel(shipped).era).toBe(2);
  });

  it("passes the run state through for the work pulse", () => {
    const s = createInitialState();
    s.run = { active: true, progress: 0.5, readyToClaim: false };
    const m = buildHallModel(s);
    expect(m.active).toBe(true);
    expect(m.progress).toBe(0.5);
  });
});
