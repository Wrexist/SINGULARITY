import { describe, it, expect, beforeEach } from "vitest";
import { buildScene3D, agentPose, chenPose, trainingWave, rackHeight3D, BAY_DEPTH } from "./layout3d";
import { hall3dEnabled, HALL3D_KEY } from "./flag";
import { buildHallModel, hallModelSig } from "../render/hallModel";
import { rackTileOrder } from "../render/hallRenderer";
import { createInitialState } from "../engine/state";
import type { GameState, Employee, ProductState } from "../engine/types";

/**
 * The 3D hall spike (WORLD_3D_PLAN.md) must be a faithful second view of the SAME
 * HallModel the 2D canvas paints: same racks on the same tiles (so a tap means the
 * same rack in both), deterministic poses (the visuals are a pure function of state +
 * clock), and nothing that can move the engine.
 */

const product = (id: string, mau: number): ProductState => ({
  id, type: "general", name: id, quality: 10, version: 2, mau, paid: mau / 20, priceMult: 1, marketingPerSec: 0,
  buzzSec: 0, features: [], enterprise: false, enterprisePrice: 1, channelMix: {}, ageSec: 1e6, upgrade: null,
});
const person = (id: string, assigned: string | null): Employee => ({
  id, name: id, roleId: "staff_engineer", level: 1, trait: null, assignedProductId: assigned, training: null,
});

function lab(over: Partial<GameState> = {}): GameState {
  const s = createInitialState();
  return { ...s, upgrades: { ...s.upgrades, rack_basic: 12, rack_server: 6, rack_tpu: 3 }, ...over };
}

describe("3D hall layout", () => {
  it("stands every drawn rack on the same tile, in the same order, as the 2D hall", () => {
    const m = buildHallModel(lab());
    const spec = buildScene3D(m);
    const tiles = rackTileOrder(m);
    expect(spec.racks).toHaveLength(m.racks.length);
    spec.racks.forEach((r, i) => {
      expect(r.index).toBe(i);
      expect(r.tier).toBe(m.racks[i]!.tier);
      expect(r.x).toBe(tiles[i]!.gx + 0.5);
      expect(r.z).toBe(tiles[i]!.gy + 0.5);
      expect(r.h).toBeGreaterThan(0);
    });
  });

  it("bigger tiers stand taller; a packed room stands taller still", () => {
    expect(rackHeight3D(2, 1)).toBeGreaterThan(rackHeight3D(1, 1));
    expect(rackHeight3D(1, 1)).toBeGreaterThan(rackHeight3D(0, 1));
    expect(rackHeight3D(0, 1)).toBeGreaterThan(rackHeight3D(0, 0.45));
  });

  it("puts the ops bay in front of the floor and keeps it inside the camera bounds", () => {
    const spec = buildScene3D(buildHallModel(lab()));
    expect(spec.bay.z0).toBe(spec.floor.z1);
    expect(spec.bay.z1 - spec.bay.z0).toBeCloseTo(BAY_DEPTH);
    expect(spec.bounds.z1).toBeGreaterThanOrEqual(spec.bay.z1);
    expect(spec.bounds.x1).toBeGreaterThanOrEqual(spec.floor.x1);
  });

  it("seats product-assigned staff at desks in their product's column; roamers get none", () => {
    const s = lab({
      products: { ...createInitialState().products, active: [product("p1", 5e6), product("p2", 1e6)] },
      employees: [person("a", "p1"), person("b", "p2"), person("c", null), person("d", "p1")],
    });
    const m = buildHallModel(s);
    const spec = buildScene3D(m);
    expect(spec.desks.map((d) => d.agent).sort()).toEqual([0, 1, 3]);
    const mid = (spec.floor.x0 + spec.floor.x1) / 2;
    for (const d of spec.desks) {
      const beam = m.agents[d.agent]!.beam!;
      // Column 0 sits left of centre, column 1 right of it.
      expect(beam === 0 ? d.x < mid : d.x > mid).toBe(true);
      expect(d.z).toBeGreaterThan(spec.bay.z0);
      expect(d.z).toBeLessThan(spec.bay.z1 + 1);
    }
    expect(spec.beams).toHaveLength(2);
  });

  it("only offers the expansion plots that can still be bought", () => {
    const s = lab();
    s.upgrades = { ...s.upgrades, rack_basic: 20 }; // half-full → the strips appear
    const m = buildHallModel(s);
    const spec = buildScene3D(m);
    expect(spec.plots.map((p) => p.id).sort()).toEqual(m.sides.filter((x) => !x.maxed).map((x) => x.id).sort());
    for (const p of spec.plots) {
      if (p.dir === "s") expect(p.rect.z0).toBeGreaterThanOrEqual(spec.bay.z1);
      else expect(p.rect.x0).toBeGreaterThanOrEqual(spec.floor.x1);
    }
  });

  it("poses are a pure function of (state, clock) and freeze under reduced motion", () => {
    const s = lab({
      products: { ...createInitialState().products, active: [product("p1", 5e6)] },
      employees: [person("a", "p1"), person("b", null)],
    });
    const m = buildHallModel(s);
    const spec = buildScene3D(m);
    expect(agentPose(spec, m, 1, 12345, false)).toEqual(agentPose(spec, m, 1, 12345, false));
    expect(agentPose(spec, m, 1, 1000, true)).toEqual(agentPose(spec, m, 1, 99999, true));
    expect(agentPose(spec, m, 0, 5000, false).seated).toBe(true);
    const walker = agentPose(spec, m, 1, 5000, false);
    expect(walker.seated).toBe(false);
    expect(walker.x).toBeGreaterThanOrEqual(spec.bay.x0);
    expect(walker.x).toBeLessThanOrEqual(spec.bay.x1);
  });

  it("the inspector only appears when scrutiny is named", () => {
    const m = buildHallModel(lab());
    expect(m.regulator).toBeNull();
    expect(chenPose(buildScene3D(m), m, 0, false)).toBeNull();
  });

  it("the training wave is dark when idle or under reduced motion, and bounded when live", () => {
    expect(trainingWave(3, 3, 1000, false, false)).toBe(0);
    expect(trainingWave(3, 3, 1000, true, true)).toBe(0);
    for (let t = 0; t < 6000; t += 250) {
      const w = trainingWave(3, 3, t, true, false);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic: the same model always yields the same spec", () => {
    const m = buildHallModel(lab());
    expect(buildScene3D(m)).toEqual(buildScene3D(m));
  });
});

describe("hallModelSig (shared by the 2D and 3D loops)", () => {
  it("moves when a manifesting upgrade is bought, and not on a no-op", () => {
    const s = lab();
    const a = hallModelSig(s, 0);
    expect(hallModelSig({ ...s }, 0)).toBe(a);
    expect(hallModelSig({ ...s, upgrades: { ...s.upgrades, overclock: 1 } }, 0)).not.toBe(a);
    expect(hallModelSig(s, 1)).not.toBe(a);
  });
});

describe("3D hall flag", () => {
  beforeEach(() => {
    try { localStorage.removeItem(HALL3D_KEY); } catch { /* no storage in this env */ }
  });

  it("is off by default — no player sees the spike", () => {
    expect(hall3dEnabled()).toBe(false);
  });
});
