import { describe, it, expect } from "vitest";
import { buildHallModel, hallDims } from "./hallModel";
import { createInitialState } from "../engine/state";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";

describe("hall view-model", () => {
  it("an empty lab has no racks and reads as era 0", () => {
    const m = buildHallModel(createInitialState());
    expect(m.total).toBe(0);
    expect(m.racks).toHaveLength(0);
    expect(m.era).toBe(0);
  });

  it("C2 — loadFrac reflects power draw vs capacity (drives the thermal overlay)", () => {
    const cold = buildHallModel(createInitialState());
    expect(cold.loadFrac).toBe(0); // no racks → no draw
    // Pile on racks with no extra power capacity → over-subscribed → loadFrac > 1.
    const hot = buildHallModel({ ...createInitialState(), upgrades: { rack_tpu: 40 } });
    expect(hot.loadFrac).toBeGreaterThan(1);
  });

  it("C2 — surfaces staff count, product beams, and alignment for manifestation", () => {
    const bare = buildHallModel(createInitialState());
    expect(bare.staff).toBe(0);
    expect(bare.beams).toEqual([]);
    expect(bare.alignment).toBe(0);

    const s = createInitialState();
    s.alignment = -0.6;
    s.employees = [
      { id: "a", name: "Ada", roleId: "staff_engineer", level: 1, trait: null, assignedProductId: null, training: null },
      { id: "b", name: "Bo", roleId: "staff_ops", level: 1, trait: null, assignedProductId: null, training: null },
    ];
    s.products = { ...s.products, active: [
      { id: "p1", type: "general", name: "X", quality: 10, version: 2, mau: 5_000_000, paid: 200_000, priceMult: 1, marketingPerSec: 1000, buzzSec: 0, features: [], enterprise: false, enterprisePrice: 1, channelMix: {}, ageSec: 1e6, upgrade: null },
      { id: "p2", type: "code", name: "Y", quality: 8, version: 1, mau: 200_000, paid: 4_000, priceMult: 1, marketingPerSec: 200, buzzSec: 0, features: [], enterprise: false, enterprisePrice: 1, channelMix: {}, ageSec: 1e6, upgrade: null },
    ] };
    const m = buildHallModel(s);
    expect(m.staff).toBe(2);
    expect(m.alignment).toBe(-0.6);
    expect(m.beams).toHaveLength(2);
    // The bigger earner normalises to a full-intensity beam; all beams are in (0,1].
    expect(Math.max(...m.beams)).toBeCloseTo(1, 6);
    expect(m.beams.every((b) => b > 0 && b <= 1)).toBe(true);
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

  it("caps drawn boxes at floor capacity (1000 GPUs ≠ 1000 boxes); a full room reads dense", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 9999 };
    const m = buildHallModel(s);
    const cap = balance.hall.baseCols * balance.hall.baseRows;
    expect(m.total).toBeLessThanOrEqual(cap);
    expect(m.racks.every((r) => r.density === 1)).toBe(true); // packed → max density
  });

  it("open-side expansions grow the room and let more racks fit (walls anchor the back)", () => {
    const base = createInitialState();
    const d0 = hallDims(base);
    expect(d0.cols).toBe(balance.hall.baseCols);
    expect(d0.rows).toBe(balance.hall.baseRows);
    expect(d0.gxMin).toBe(0);
    expect(d0.gyMin).toBe(0);

    const expanded = createInitialState();
    expanded.upgrades = { expand_e: 2, expand_s: 1 }; // +4 cols, +2 rows
    const d2 = hallDims(expanded);
    expect(d2.cols).toBe(balance.hall.baseCols + 4);
    expect(d2.rows).toBe(balance.hall.baseRows + 2);
    expect(d2.gxMin).toBe(0); // back stays anchored at the walls
    expect(d2.gyMin).toBe(0);

    const racks = { rack_basic: 200 };
    const small = buildHallModel({ ...base, upgrades: racks });
    const big = buildHallModel({ ...expanded, upgrades: { ...racks, expand_e: 2, expand_s: 1 } });
    expect(big.total).toBeGreaterThan(small.total);
  });

  it("exposes a buyable marker for each of the two open sides only", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e9);
    const m = buildHallModel(s);
    expect(m.sides.map((x) => x.dir).sort()).toEqual(["e", "s"]);
    expect(m.sides.every((x) => x.cost > 0)).toBe(true);
    expect(m.sides.every((x) => x.affordable)).toBe(true); // rich → all affordable
  });

  it("over capacity, keeps the tier mix visible (proportional, not all-of-one-tier)", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 300, rack_server: 200, rack_tpu: 100 }; // 600 owned >> capacity
    const m = buildHallModel(s);
    expect(m.racks.some((r) => r.tier === 0)).toBe(true);
    expect(m.racks.some((r) => r.tier === 1)).toBe(true);
    expect(m.racks.some((r) => r.tier === 2)).toBe(true);
  });

  it("re-skins the era as the lab progresses", () => {
    const s = createInitialState();
    s.research = ["backprop", "curated_data", "mixed_precision"];
    expect(buildHallModel(s).era).toBe(1);
    s.research = [...s.research, "inference_api"];
    expect(buildHallModel(s).era).toBe(2);
    const shipped = createInitialState();
    shipped.prestige.ships = 1;
    expect(buildHallModel(shipped).era).toBe(2);
  });

  it("manifests power/cooling gear as wall units (capped)", () => {
    const bare = createInitialState();
    expect(buildHallModel(bare).coolingUnits).toBe(0); // era 0, no power gear
    const cooled = createInitialState();
    cooled.upgrades = { psu_bay: 1, cooling_loop: 1 };
    expect(buildHallModel(cooled).coolingUnits).toBe(2); // one unit per purchase
    const overkill = createInitialState();
    overkill.upgrades = { psu_bay: 5, cooling_loop: 5, substation: 5 };
    expect(buildHallModel(overkill).coolingUnits).toBe(6); // C2: cap raised 3→6 so cooling visibly scales
  });

  it("passes the run state through for the work pulse", () => {
    const s = createInitialState();
    s.run = { active: true, progress: 0.5, readyToClaim: false };
    const m = buildHallModel(s);
    expect(m.active).toBe(true);
    expect(m.progress).toBe(0.5);
  });

  it("manifests overclock as a 0..1 heat intensity that scales with levels", () => {
    expect(buildHallModel(createInitialState()).overclock).toBe(0);
    const s = createInitialState();
    s.upgrades = { overclock: 5 };
    expect(buildHallModel(s).overclock).toBeCloseTo(0.5, 5);
    s.upgrades = { overclock: 50 }; // clamps at 1
    expect(buildHallModel(s).overclock).toBe(1);
  });

  it("shows an ops bot only once auto-train is owned", () => {
    expect(buildHallModel(createInitialState()).autoBot).toBe(false);
    const s = createInitialState();
    s.upgrades = { auto_train: 1 };
    expect(buildHallModel(s).autoBot).toBe(true);
  });
});
