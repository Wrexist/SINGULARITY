import { describe, it, expect, beforeEach } from "vitest";
import { buildScene3D, agentPose, chenPose, trainingWave, rackHeight3D, BAY_DEPTH, botPose, crowdPose, deliveryPose, DELIVERY_MS, segDist2 } from "./layout3d";
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

  it("fills a product's front desk row first, then the facing back row, with a planter between", () => {
    const people = Array.from({ length: 12 }, (_, i) => person(`p${i}`, "p1"));
    const m = buildHallModel(lab({ products: { ...createInitialState().products, active: [product("p1", 5e6)] }, employees: people }));
    const spec = buildScene3D(m);
    const front = spec.desks.filter((d) => d.side === 1);
    const back = spec.desks.filter((d) => d.side === -1);
    expect(front.length).toBeGreaterThan(0);
    expect(back.length).toBeGreaterThan(0);
    // Front-row desks sit nearer the camera than the back row; the planter runs between.
    const p = spec.planters[0]!;
    for (const d of front) expect(d.z).toBeGreaterThan(p.z1);
    for (const d of back) expect(d.z).toBeLessThan(p.z0);
    // Front-row sitters face the racks (back to camera); back-row sitters face the camera.
    expect(agentPose(spec, m, front[0]!.agent, 0, true).rotY).toBeCloseTo(Math.PI);
    expect(agentPose(spec, m, back[0]!.agent, 0, true).rotY).toBeCloseTo(0);
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

  it("walkers ease to a stop at each end and face the camera mid-turn", () => {
    const s = lab({ employees: [person("a", null)] });
    const m = buildHallModel(s);
    const spec = buildScene3D(m);
    const seed = ((0 * 2654435761) % 1000) / 1000;
    const period = 16000 + seed * 9000;
    // ph = 0.5 is the far end: stopped, mid-turn → facing +Z (rotY 0), no stride.
    const tEnd = (0.5 - seed + 1) * period;
    const end = agentPose(spec, m, 0, tEnd, false);
    expect(Math.abs(end.rotY)).toBeLessThan(0.05);
    expect(end.stride ?? 0).toBeLessThan(0.05);
    // ph = 0.25 is mid-walk toward +X: facing +X, full stride.
    const mid = agentPose(spec, m, 0, (0.25 - seed + 1) * period, false);
    expect(mid.rotY).toBeCloseTo(Math.PI / 2);
    expect(mid.stride).toBe(1);
  });

  it("seated staff only glance under motion, and never more than ~35°", () => {
    const s = lab({ products: { ...createInitialState().products, active: [product("p1", 5e6)] }, employees: [person("a", "p1")] });
    const m = buildHallModel(s);
    const spec = buildScene3D(m);
    let maxYaw = 0;
    for (let t = 0; t < 60000; t += 250) maxYaw = Math.max(maxYaw, Math.abs(agentPose(spec, m, 0, t, false).yaw));
    expect(maxYaw).toBeGreaterThan(0.1);
    expect(maxYaw).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(agentPose(spec, m, 0, 12345, true).yaw).toBe(0);
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

describe("3D hall life: ops bot, crowd, delivery", () => {
  it("the ops bot only exists with auto-train and racks, and parks under reduced motion", () => {
    const m = buildHallModel(lab());
    const spec = buildScene3D(m);
    expect(botPose(spec, { ...m, autoBot: false }, 1000, false)).toBeNull();
    const empty = buildHallModel(createInitialState());
    expect(botPose(buildScene3D(empty), { ...empty, autoBot: true }, 1000, false)).toBeNull();
    const a = botPose(spec, { ...m, autoBot: true }, 1000, true)!;
    expect(a).toEqual(botPose(spec, { ...m, autoBot: true }, 987654, true));
    expect(a.scan).toBe(0);
    expect(a.rack).toBe(-1);
  });

  it("patrols the front rack lane, scanning every front-row rack it stops at", () => {
    const m = { ...buildHallModel(lab()), autoBot: true };
    const spec = buildScene3D(m);
    const frontZ = Math.max(...spec.racks.map((r) => r.z));
    const front = new Set(spec.racks.flatMap((r, i) => (r.z === frontZ ? [i] : [])));
    const scanned = new Set<number>();
    let z: number | null = null;
    for (let t = 0; t < 120000; t += 100) {
      const p = botPose(spec, m, t, false)!;
      z ??= p.z;
      expect(p.z).toBe(z); // one lane
      expect(p.z).toBeGreaterThan(frontZ + 0.5);
      expect(p.x).toBeGreaterThanOrEqual(spec.floor.x0);
      expect(p.x).toBeLessThanOrEqual(spec.floor.x1);
      if (p.scan > 0) {
        expect(front.has(p.rack)).toBe(true);
        expect(p.x).toBeCloseTo(spec.racks[p.rack]!.x);
        expect(p.rotY).toBeCloseTo(Math.PI); // facing the racks
        scanned.add(p.rack);
      }
    }
    expect([...scanned].sort()).toEqual([...front].sort());
    expect(botPose(spec, m, 4321, false)).toEqual(botPose(spec, m, 4321, false));
  });

  it("onlookers stand just outside the open front, turned in toward the floor", () => {
    const spec = buildScene3D(buildHallModel(lab()));
    for (let k = 0; k < 6; k++) {
      const p = crowdPose(spec, k, 5000, false);
      expect(p.z).toBeGreaterThan(spec.bay.z1);
      expect(p.x).toBeGreaterThanOrEqual(spec.bay.x0);
      expect(p.x).toBeLessThanOrEqual(spec.bay.x1);
      expect(Math.cos(p.rotY)).toBeLessThan(0); // facing −Z, into the lab
      expect(p.cheer).toBe(k % 3 === 0 ? 1 : 0);
      expect(crowdPose(spec, k, 5000, true).lift).toBe(0);
    }
  });

  it("a delivery rolls in along the walkway, fades, and is gone after its window", () => {
    const spec = buildScene3D(buildHallModel(lab()));
    expect(deliveryPose(spec, -1)).toBeNull();
    expect(deliveryPose(spec, Number.NaN)).toBeNull();
    expect(deliveryPose(spec, Infinity)).toBeNull();
    expect(deliveryPose(spec, DELIVERY_MS)).toBeNull();
    let prevX = Infinity;
    for (let ms = 0; ms < DELIVERY_MS; ms += 50) {
      const p = deliveryPose(spec, ms)!;
      expect(p.x).toBeLessThanOrEqual(prevX);
      prevX = p.x;
      expect(p.alpha).toBeGreaterThanOrEqual(0);
      expect(p.alpha).toBeLessThanOrEqual(1);
      expect(p.z).toBeGreaterThan(spec.bay.z0);
      expect(p.z).toBeLessThan(spec.bay.z1);
      expect(p.x).toBeLessThanOrEqual(spec.bay.x1); // on the plinth the whole way
      expect(p.x).toBeGreaterThanOrEqual(spec.bay.x0);
    }
  });
});

describe("beam tap geometry", () => {
  it("measures a tap against the beam's column, clamped to its ends", () => {
    // A vertical column from (100, 300) up to (100, 100).
    expect(segDist2(110, 200, 100, 300, 100, 100)).toBeCloseTo(100); // 10 px beside it
    expect(segDist2(100, 80, 100, 300, 100, 100)).toBeCloseTo(400); // 20 px above the top
    expect(segDist2(100, 320, 100, 300, 100, 100)).toBeCloseTo(400); // 20 px below the foot
    expect(segDist2(3, 4, 0, 0, 0, 0)).toBeCloseTo(25); // a degenerate column is a point
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
