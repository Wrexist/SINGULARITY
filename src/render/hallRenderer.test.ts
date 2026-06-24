import { describe, it, expect } from "vitest";
import { computeLayout, expansionMarkers, pointInPoly } from "./hallRenderer";
import { buildHallModel } from "./hallModel";
import { createInitialState } from "../engine/state";
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
});
