import { describe, it, expect } from "vitest";
import { rackHitAreas, rackAtPoint, rackTileOrder, computeLayout, pointInPoly } from "./hallRenderer";
import { buildHallModel, type HallModel } from "./hallModel";
import { createInitialState } from "../engine/state";
import type { ActiveModifier, GameState } from "../engine/types";

/**
 * Tapping a rack in the hall (bug hunt r2, render/shell). A rack stands one to two
 * tiles tall, but the tap target was only the floor diamond under it, so a tap on
 * the rack's top or upper faces landed on the tile BEHIND it: the wrong rack's card
 * opened, and tapping a smoking rack's warn light or smoke never worked the problem
 * (it opened the card of the rack behind, or worked THAT rack's incident instead).
 */

const W = 390, H = 230;

function labWith(racks: Partial<Record<"rack_basic" | "rack_server" | "rack_tpu", number>>, mods: ActiveModifier[] = []): GameState {
  const s = createInitialState();
  s.upgrades = { ...s.upgrades, ...racks };
  s.modifiers = mods;
  return s;
}

/** Screen geometry of rack `i` exactly as drawHallDynamic stands it. */
function rackGeom(model: HallModel, i: number) {
  const L = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);
  const t = rackTileOrder(model)[i]!;
  const c = L.iso(t.gx + 0.5, t.gy + 0.5);
  const r = model.racks[i]!;
  const ph = L.tileH * (1.1 + r.tier * 0.5) * (0.72 + 0.28 * r.density);
  return { c, ph, tileW: L.tileW, tile: t };
}

describe("hall rack taps land on the rack the player sees", () => {
  it("a tap on a rack's top face selects that rack, not the one standing behind it", () => {
    // One tier per floor, so every rack is the same height and no rack in front
    // genuinely covers the top face being tapped.
    for (const id of ["rack_basic", "rack_server", "rack_tpu"] as const) {
      const model = buildHallModel(labWith({ [id]: 30 }));
      const hits = rackHitAreas(model, W, H);
      const order = rackTileOrder(model);
      let checked = 0;
      for (let i = 0; i < model.racks.length; i++) {
        const { gx, gy } = order[i]!;
        // Only racks with another rack diagonally behind them (the tile the top face
        // overlaps) can be mis-hit; every one of them must still answer as itself.
        const behind = order.findIndex((t, j) => j < model.racks.length && t.gx === gx - 1 && t.gy === gy - 1);
        if (behind < 0) continue;
        const { c, ph, tileW } = rackGeom(model, i);
        const hh = (tileW / 4) * 0.64;
        expect(rackAtPoint(hits, c.x, c.y - ph)?.index).toBe(i); // centre of the top face
        expect(rackAtPoint(hits, c.x, c.y - ph + hh * 0.5)?.index).toBe(i); // its front corner
        checked++;
      }
      expect(checked).toBeGreaterThan(5);
    }
  });

  it("a tap on a smoking rack's warn light reaches THAT rack's incident", () => {
    // Pick an incident id that lands on a rack with a rack behind it.
    const base = labWith({ rack_basic: 30 });
    const order = rackTileOrder(buildHallModel(base));
    const bad = (id: string): ActiveModifier => ({ id, target: "computeMult", factor: 0.6, remainingSec: 30, label: "Compute ×0.6", tone: "bad" });
    let model: HallModel | null = null;
    for (let n = 0; n < 200 && !model; n++) {
      const m = buildHallModel(labWith({ rack_basic: 30 }, [bad(`evt_${n}`)]));
      const t = order[m.incidents[0]!.rackIndex]!;
      if (t.gx > 0 && t.gy > 0) model = m;
    }
    expect(model).not.toBeNull();
    const inc = model!.incidents[0]!;
    const { c, ph, tileW } = rackGeom(model!, inc.rackIndex);
    // drawIncident puts the warn blink at (x + tileW·0.2, top + 2) and the smoke over the top.
    const hits = rackHitAreas(model!, W, H);
    const tapped = rackAtPoint(hits, c.x + tileW * 0.2, c.y - ph + 2);
    expect(tapped?.index).toBe(inc.rackIndex);
    // HallCanvas works the incident whose rackIndex matches the tapped rack.
    expect(model!.incidents.find((x) => x.rackIndex === tapped!.index && !x.worked)?.id).toBe(inc.id);
  });

  it("still hits a rack by its floor tile, and misses bare floor", () => {
    const model = buildHallModel(labWith({ rack_basic: 3 }));
    const hits = rackHitAreas(model, W, H);
    for (const h of hits) expect(rackAtPoint(hits, h.centroid.x, h.centroid.y)?.index).toBe(h.index);
    // The far front corner of the floor has no rack on it (3 racks fill the back row).
    const L = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);
    const empty = L.iso(model.cols - 0.5, model.rows - 0.5);
    expect(rackAtPoint(hits, empty.x, empty.y)).toBeUndefined();
  });

  it("a front rack's body wins over the floor tile of the rack it hides", () => {
    const model = buildHallModel(labWith({ rack_basic: 30 }));
    const hits = rackHitAreas(model, W, H);
    const order = rackTileOrder(model);
    const front = order.findIndex((t) => t.gx === 2 && t.gy === 2);
    const back = order.findIndex((t) => t.gx === 1 && t.gy === 1);
    const { c, ph } = rackGeom(model, front);
    // This point is inside the BACK rack's floor diamond, but the front rack's body covers it.
    const p = { x: c.x, y: c.y - ph };
    expect(pointInPoly(p.x, p.y, hits[back]!.quad)).toBe(true);
    expect(rackAtPoint(hits, p.x, p.y)?.index).toBe(front);
  });
});
