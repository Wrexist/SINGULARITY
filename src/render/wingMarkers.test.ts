import { describe, it, expect } from "vitest";
import { buildHallModel } from "./hallModel";
import { createInitialState } from "../engine/state";
import { wingCapacity, hallCapacity } from "../engine/hall";
import { prestige } from "../engine/prestige";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The hall's tappable expansion strips appear once "the room" is half full (an empty
 * closet shouldn't wear price tags). The rule measured the whole FACILITY, so a lab
 * with Facility Wings — which survive a ship while the floor expansions reset — lost
 * the strips until half of every floor was racked: wing A packed solid and the room
 * no longer offering to grow (bug hunt r2, render/shell).
 */

function lab(racks: number, wings: number): GameState {
  const s = createInitialState();
  s.upgrades = { ...s.upgrades, rack_basic: racks };
  s.facilityWings = wings;
  s.resources.money = Big.of(1e9);
  return s;
}

describe("expansion strips follow the room, not the facility", () => {
  it("a lab's first floor still hides the strips until it is half full", () => {
    const perWing = wingCapacity(lab(0, 0));
    expect(buildHallModel(lab(Math.ceil(perWing / 2) - 1, 0)).sides).toEqual([]);
    expect(buildHallModel(lab(Math.ceil(perWing / 2), 0)).sides.map((s) => s.dir)).toEqual(["s", "e"]);
  });

  it("a multi-wing lab shows them once THIS floor is half full", () => {
    const s = lab(0, 4);
    const perWing = wingCapacity(s);
    expect(hallCapacity(s)).toBe(perWing * 5);
    // Wing A completely full, the floor never expanded this run.
    const full = buildHallModel(lab(perWing, 4));
    expect(full.racks).toHaveLength(perWing);
    expect(full.sides.map((m) => m.dir)).toEqual(["s", "e"]);
    expect(full.sides.every((m) => !m.maxed && m.affordable)).toBe(true);
    // And the empty-closet rule still holds on a fresh multi-wing run.
    expect(buildHallModel(lab(0, 4)).sides).toEqual([]);
  });

  it("the case arises after a ship: wings are kept, expansions are not", () => {
    const s = lab(0, 3);
    s.research = [balance.prestige.capabilityResearch];
    s.upgrades = { ...s.upgrades, expand_e: 2, expand_s: 2 };
    const next = prestige(s, "deploy");
    expect(next.facilityWings).toBe(3);
    expect(next.upgrades.expand_e ?? 0).toBe(0);
    const refilled = { ...next, upgrades: { ...next.upgrades, rack_basic: wingCapacity(next) } };
    expect(buildHallModel(refilled).sides).toHaveLength(2);
  });
});
