import { describe, it, expect } from "vitest";
import {
  computeLayout, expansionMarkers, rackHitAreas, pointInPoly,
  dayPhase, nightFactor, starField, lightningFlash, DAY_CYCLE_MS,
  agentSpots,
} from "./hallRenderer";
import { buildHallModel } from "./hallModel";
import { createInitialState } from "../engine/state";
import { rackInfo } from "../engine/rackInfo";
import { Big } from "../engine/math/Big";
import type { ActiveModifier } from "../engine/types";

describe("hall layout + markers (pure geometry)", () => {
  it("point-in-polygon works for a simple square", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPoly(5, 5, sq)).toBe(true);
    expect(pointInPoly(15, 5, sq)).toBe(false);
  });

  it("the layout fits the floor within the card as it grows", () => {
    const small = computeLayout(6, 5, 0, 0, 390, 230);
    const big = computeLayout(16, 14, -4, -4, 390, 230);
    // Bigger floor → smaller tiles so it still fits the same card.
    expect(big.tileW).toBeLessThan(small.tileW);
    expect(big.tileW).toBeGreaterThan(0);
  });

  it("produces a marker for each open side, with non-degenerate quads", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e9);
    const markers = expansionMarkers(buildHallModel(s), 390, 230);
    expect(markers).toHaveLength(2); // only the two open (wall-free) sides
    for (const m of markers) {
      expect(m.quad).toHaveLength(4);
      // The centroid lies inside its own quad.
      expect(pointInPoly(m.centroid.x, m.centroid.y, m.quad)).toBe(true);
    }
  });

  it("rackHitAreas: one tappable diamond per drawn rack, hit-testable at its centroid (R2.1)", () => {
    const s = createInitialState();
    s.upgrades.rack_basic = 3;
    s.upgrades.rack_server = 2;
    const model = buildHallModel(s);
    const hits = rackHitAreas(model, 390, 230);
    expect(hits).toHaveLength(model.racks.length);
    expect(model.racks.length).toBe(5);
    // Each rack's centroid hits its own quad and no rack's tier is out of range.
    for (const h of hits) {
      expect(pointInPoly(h.centroid.x, h.centroid.y, h.quad)).toBe(true);
      expect(h.tier).toBeGreaterThanOrEqual(0);
      expect(h.tier).toBeLessThanOrEqual(2);
    }
    // The hit tiers mirror the model's rack tiers in draw order.
    expect(hits.map((h) => h.tier)).toEqual(model.racks.map((r) => r.tier));
  });

  it("an empty hall has no tappable racks", () => {
    const hits = rackHitAreas(buildHallModel(createInitialState()), 390, 230);
    expect(hits).toHaveLength(0);
  });
});

describe("rackInfo (tappable-rack read model)", () => {
  it("reports name, owned count, and Compute contribution for a tier", () => {
    const s = createInitialState();
    s.upgrades.rack_basic = 4;
    const info = rackInfo(s, 0)!;
    expect(info.id).toBe("rack_basic");
    expect(info.owned).toBe(4);
    expect(info.computeEach).toBeGreaterThan(0);
    expect(info.computeTotal).toBe(info.computeEach * 4);
  });

  it("returns null for an out-of-range tier", () => {
    expect(rackInfo(createInitialState(), 9)).toBeNull();
  });
});

describe("living hall — day/night cycle (pure helpers)", () => {
  it("dayPhase wraps over the cycle and is deterministic", () => {
    expect(dayPhase(0)).toBe(0);
    expect(dayPhase(DAY_CYCLE_MS)).toBeCloseTo(0, 10);
    expect(dayPhase(DAY_CYCLE_MS / 2)).toBeCloseTo(0.5, 10);
    // Deterministic: same input, same output.
    expect(dayPhase(123456)).toBe(dayPhase(123456));
    // In range and monotonically rising within one cycle.
    let prev = dayPhase(1000);
    for (let t = 2000; t <= DAY_CYCLE_MS; t += 9973) {
      const p = dayPhase(t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });

  it("nightFactor is 0 at noon, 1 at midnight, transitional at dusk/dawn", () => {
    expect(nightFactor(dayPhase(0))).toBe(0); // phase 0 = noon
    expect(nightFactor(dayPhase(DAY_CYCLE_MS / 2))).toBe(1); // midnight
    const dusk = nightFactor(dayPhase(DAY_CYCLE_MS * 0.25));
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    // Dawn mirrors dusk.
    expect(nightFactor(dayPhase(DAY_CYCLE_MS * 0.75))).toBeCloseTo(dusk, 5);
    // Bounded.
    for (let p = 0; p < 1; p += 0.037) {
      const nf = nightFactor(p);
      expect(nf).toBeGreaterThanOrEqual(0);
      expect(nf).toBeLessThanOrEqual(1);
    }
  });

  it("starField is deterministic, bounded, and hangs in the upper sky", () => {
    const a = starField(390, 230, 40, 7);
    const b = starField(390, 230, 40, 7);
    expect(a).toEqual(b); // same seed → identical field
    expect(a).toHaveLength(40);
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(390);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(230 * 0.32); // upper-sky band only
      expect(s.r).toBeGreaterThan(0);
    }
    // A different seed moves at least some stars.
    const c = starField(390, 230, 40, 8);
    expect(c.some((s, i) => s.x !== a[i]!.x || s.y !== a[i]!.y)).toBe(true);
  });

  it("lightningFlash strobes briefly then stays dark for the period", () => {
    expect(lightningFlash(5000)).toBe(0); // deep in the quiet window
    expect(lightningFlash(9000 + 5000)).toBe(0); // every period
    let sawBright = false;
    for (let t = 0; t < 400; t += 10) {
      const v = lightningFlash(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > 0.5) sawBright = true;
    }
    expect(sawBright).toBe(true); // there IS a flash near t=0
    expect(lightningFlash(310)).toBe(0); // …and it ends quickly
  });
});

describe("living hall — agents react (pure positions)", () => {
  const staffed = () => {
    const s = createInitialState();
    s.upgrades.rack_basic = 4;
    s.employees = [
      { id: "a", name: "Ada", roleId: "staff_engineer", level: 1, trait: null, assignedProductId: null, training: null },
      { id: "b", name: "Bo", roleId: "staff_ops", level: 1, trait: null, assignedProductId: null, training: null },
      { id: "c", name: "Cy", roleId: "staff_researcher", level: 2, trait: null, assignedProductId: null, training: null },
      { id: "d", name: "Dee", roleId: "staff_growth", level: 1, trait: null, assignedProductId: null, training: null },
    ];
    return s;
  };
  const badMod = (id: string): ActiveModifier => ({
    id, target: "computeMult", factor: 0.6, remainingSec: 30, label: "Compute ×0.6", tone: "bad",
  });

  it("roamers drift toward a smoking incident rack (position, not motion)", () => {
    const calmModel = buildHallModel(staffed());
    const calm = agentSpots(calmModel, 390, 230, 4000, true);
    const alarmedState = staffed();
    alarmedState.modifiers = [badMod("evt_x")];
    const alarmedModel = buildHallModel(alarmedState);
    const alarmed = agentSpots(alarmedModel, 390, 230, 4000, true);
    // The incident lands on a deterministic rack; every roamer should be no farther
    // from that rack's tile centre than in the calm run (same clock, motion off).
    const incRack = alarmedModel.incidents[0]!.rackIndex;
    const target = rackHitAreas(alarmedModel, 390, 230)[incRack]!.centroid;
    const dist = (spots: typeof calm) =>
      spots.reduce((sum, sp) => sum + Math.hypot(sp.x - target.x, sp.y - target.y), 0);
    expect(dist(alarmed)).toBeLessThan(dist(calm));
  });

  it("a ready-to-claim lab makes staff bounce harder (anticipation hop)", () => {
    const idle = agentSpots(buildHallModel(staffed()), 390, 230, 1000, false);
    const readyState = staffed();
    readyState.run.readyToClaim = true;
    const excited = agentSpots(buildHallModel(readyState), 390, 230, 1000, false);
    const maxBob = (spots: typeof idle) => Math.max(...spots.map((sp) => Math.abs(sp.bob)));
    expect(maxBob(excited)).toBeGreaterThan(maxBob(idle));
    // Reduced motion flattens both to stillness.
    const still = agentSpots(buildHallModel(readyState), 390, 230, 1000, true);
    expect(Math.max(...still.map((sp) => Math.abs(sp.bob)))).toBe(0);
  });
});
