import { describe, it, expect } from "vitest";
import { spawnFromOnChange } from "./hallRenderer";
import { buildHallModel } from "./hallModel";
import { createInitialState } from "../engine/state";
import { wingCapacity } from "../engine/hall";
import type { GameState } from "../engine/types";

/**
 * The rack "power-on" spawn animation is the hall's answer to a purchase. HallCanvas
 * fired it whenever the drawn rack count rose, so flipping from a half-empty wing
 * back to a full one replayed the install animation (every rack scaling in with a
 * power-on flash) for hardware the lab had owned all along (bug hunt r2).
 */

function lab(racks: number, wings: number): GameState {
  const s = createInitialState();
  s.upgrades = { ...s.upgrades, rack_basic: racks };
  s.facilityWings = wings;
  return s;
}

/** Replays HallCanvas's per-rebuild bookkeeping over a sequence of views. */
function spawns(views: { game: GameState; wing: number }[]): (number | null)[] {
  const first = buildHallModel(views[0]!.game, views[0]!.wing);
  let last = { total: first.total, wing: first.wing };
  const out: (number | null)[] = [];
  for (const v of views.slice(1)) {
    const m = buildHallModel(v.game, v.wing);
    out.push(spawnFromOnChange(last, { total: m.total, wing: m.wing }));
    last = { total: m.total, wing: m.wing };
  }
  return out;
}

describe("the spawn animation marks new hardware, not a change of view", () => {
  it("switching wings (and back) never replays the install animation", () => {
    const perWing = wingCapacity(lab(0, 2));
    const g = lab(perWing + 5, 2); // wing A full, wing B holds 5
    expect(spawns([
      { game: g, wing: 0 },
      { game: g, wing: 1 }, // A (full) → B (5 racks)
      { game: g, wing: 0 }, // back to the full wing
      { game: g, wing: 2 }, // the empty wing C
      { game: g, wing: 1 },
    ])).toEqual([null, null, null, null]);
  });

  it("a rack bought into the wing on screen still spawns from the old count", () => {
    const perWing = wingCapacity(lab(0, 1));
    const before = lab(perWing + 5, 1);
    const after = lab(perWing + 7, 1);
    expect(spawns([{ game: before, wing: 1 }, { game: after, wing: 1 }])).toEqual([5]);
    // …and in a single-wing lab, exactly as before.
    expect(spawns([{ game: lab(3, 0), wing: 0 }, { game: lab(4, 0), wing: 0 }])).toEqual([3]);
    expect(spawns([{ game: lab(4, 0), wing: 0 }, { game: lab(2, 0), wing: 0 }])).toEqual([null]);
  });
});
