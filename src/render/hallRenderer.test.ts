import { describe, it, expect } from "vitest";
import { computeLayout, expansionMarkers, rackHitAreas, pointInPoly } from "./hallRenderer";
import { buildHallModel } from "./hallModel";
import { createInitialState } from "../engine/state";
import { rackInfo } from "../engine/rackInfo";
import { Big } from "../engine/math/Big";

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
