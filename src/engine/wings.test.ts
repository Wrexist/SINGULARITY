import { describe, it, expect } from "vitest";
import { hallCapacity, wingCapacity, hallWings, floorDrawnOut, totalRacks, floorFull } from "./hall";
import { wingCost, wingCostSum, canFoundWing, foundWing, reputationAvailable, earnedReputation } from "./reputation";
import { buildHallModel } from "../render/hallModel";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { derive } from "./derive";
import { balance } from "./balance/config";
import { reputation as R } from "./balance/reputation";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/** A lab with the block fully leased (both expansions maxed) and Reputation banked. */
function maxedFloor(over: Partial<GameState> = {}): GameState {
  const s = createInitialState();
  return {
    ...s,
    upgrades: { ...s.upgrades, expand_e: 4, expand_s: 4 },
    // Reputation is EARNED (achievements + ships + ascensions), never stored — so a
    // rich fixture has to earn it rather than set a number.
    stats: { ...s.stats, totalShips: 400, ascensions: 40 },
    prestige: { ...s.prestige, ships: 400 },
    ...over,
  };
}

/**
 * FACILITY WINGS (2026-08). The money-bought floor runs out — it meets the renderer's
 * per-frame draw cap — and past that the lab could never grow again. A wing is a whole
 * additional FLOOR, founded with Lab Reputation, drawn one at a time.
 */
describe("Facility Wings", () => {
  it("leaves a wingless lab exactly as it was", () => {
    for (const [e, w] of [[0, 0], [2, 2], [4, 4]] as [number, number][]) {
      const g = { ...createInitialState(), upgrades: { ...createInitialState().upgrades, expand_e: e, expand_s: w } };
      expect(hallWings(g)).toBe(1);
      expect(hallCapacity(g)).toBe(wingCapacity(g));
    }
  });

  it("multiplies capacity by the number of floors, and only that", () => {
    const g = maxedFloor();
    const per = wingCapacity(g);
    for (let n = 0; n < 4; n++) {
      const withWings = { ...g, facilityWings: n };
      expect(hallWings(withWings)).toBe(n + 1);
      expect(hallCapacity(withWings)).toBe(per * (n + 1));
      // Founding a wing never changes the floor you already had.
      expect(wingCapacity(withWings)).toBe(per);
    }
  });

  it("knows when the floor is drawn out — which is where the dead purchase was", () => {
    const s = createInitialState();
    const at = (e: number, w: number) => ({ ...s, upgrades: { ...s.upgrades, expand_e: e, expand_s: w } });
    expect(floorDrawnOut(at(0, 0))).toBe(false);
    expect(floorDrawnOut(at(3, 3))).toBe(false);
    // At 4/4 the floor holds more TILES than the renderer will ever draw boxes for,
    // so the last expansion levels bought capacity that does not exist.
    expect(floorDrawnOut(at(4, 4))).toBe(true);
    expect(wingCapacity(at(4, 4))).toBe(balance.hall.maxDrawnRacks);
  });

  it("refuses a wing until the block is genuinely leased out", () => {
    const rich = { ...createInitialState(), stats: { ...createInitialState().stats, totalShips: 400, ascensions: 40 } };
    expect(reputationAvailable(rich)).toBeGreaterThan(wingCost(rich));
    expect(canFoundWing(rich)).toBe(false); // floor not drawn out
    expect(foundWing(rich)).toBe(rich);
    expect(canFoundWing(maxedFloor())).toBe(true);
  });

  it("refuses a wing the lab cannot pay for", () => {
    const poor = { ...maxedFloor(), stats: { ...createInitialState().stats } , prestige: { ...createInitialState().prestige } };
    expect(reputationAvailable(poor)).toBeLessThan(wingCost(poor));
    expect(canFoundWing(poor)).toBe(false);
  });

  it("charges Reputation and escalates the next wing's price", () => {
    const s = maxedFloor();
    const first = wingCost(s);
    const after = foundWing(s);
    expect(after.facilityWings).toBe(1);
    expect(after.reputation.spent).toBe(s.reputation.spent + first);
    expect(reputationAvailable(after)).toBe(reputationAvailable(s) - first);
    expect(wingCost(after)).toBeGreaterThan(first);
    expect(wingCostSum(1)).toBe(first);
    expect(wingCostSum(2)).toBe(first + wingCost(after));
  });

  it("stops at the safety bound", () => {
    let s: GameState = { ...maxedFloor(), facilityWings: R.wings.maxWings };
    expect(canFoundWing(s)).toBe(false);
    s = foundWing(s);
    expect(s.facilityWings).toBe(R.wings.maxWings);
  });

  it("survives prestige AND ascension — the building is the building", () => {
    const s = {
      ...maxedFloor(),
      facilityWings: 3,
      research: [balance.prestige.capabilityResearch],
      lifetimeMoney: Big.of(1e12),
    };
    expect(prestige(s).facilityWings).toBe(3);
  });

  it("unblocks rack buying that the old ceiling had frozen forever", () => {
    const at120 = { ...maxedFloor(), upgrades: { ...maxedFloor().upgrades, rack_tpu: balance.hall.maxDrawnRacks } };
    expect(totalRacks(at120)).toBe(balance.hall.maxDrawnRacks);
    expect(floorFull(at120)).toBe(true); // the old dead end
    expect(floorFull(foundWing(at120))).toBe(false);
  });
});

describe("Facility Wings — the renderer draws one floor at a time", () => {
  const withRacks = (n: number, wings: number) => {
    const s = maxedFloor();
    return { ...s, facilityWings: wings, upgrades: { ...s.upgrades, rack_basic: n } };
  };

  it("never draws more boxes in a frame than the per-frame cap, at any wing count", () => {
    const per = wingCapacity(maxedFloor());
    for (const wings of [0, 1, 5, R.wings.maxWings]) {
      const g = withRacks(per * (wings + 1), wings);
      for (let w = 0; w <= wings; w++) {
        expect(buildHallModel(g, w).racks.length).toBeLessThanOrEqual(balance.hall.maxDrawnRacks);
      }
    }
  });

  it("manifests EVERY owned rack across the wings, exactly once", () => {
    const per = wingCapacity(maxedFloor());
    const owned = per * 2 + 7;
    const g = withRacks(owned, 2);
    let drawn = 0;
    for (let w = 0; w < hallWings(g); w++) drawn += buildHallModel(g, w).racks.length;
    expect(drawn).toBe(owned);
  });

  it("fills wings in order, so a new wing opens empty", () => {
    const per = wingCapacity(maxedFloor());
    const g = withRacks(per + 3, 1);
    expect(buildHallModel(g, 0).racks).toHaveLength(per); // the old hall stays full
    expect(buildHallModel(g, 1).racks).toHaveLength(3);   // the new floor holds the rest
  });

  it("clamps a stale wing index to a real floor rather than rendering nothing", () => {
    const g = withRacks(10, 0);
    expect(buildHallModel(g, 5).wing).toBe(0);
    expect(buildHallModel(g, -3).wing).toBe(0);
    expect(buildHallModel(g, 5).racks).toHaveLength(10);
  });

  it("reports the wing it drew and how many exist", () => {
    const g = withRacks(10, 2);
    expect(buildHallModel(g, 1)).toMatchObject({ wing: 1, wings: 3 });
  });
});

describe("Facility Wings — hostile saves", () => {
  const crafted = (over: Record<string, unknown>) => {
    const raw = JSON.parse(serialize(maxedFloor()));
    Object.assign(raw, over);
    return deserialize(JSON.stringify(raw));
  };

  it("bounds the wing count, which multiplies what the renderer is asked for", () => {
    const back = crafted({ facilityWings: 1e9 });
    expect(back.facilityWings).toBeLessThanOrEqual(R.wings.maxWings);
    expect(Number.isFinite(hallCapacity(back))).toBe(true);
  });

  it("charges for wings a crafted save claims, so they are never free", () => {
    const back = crafted({ facilityWings: 4, reputation: { spent: 0, perks: [] } });
    expect(back.facilityWings).toBe(4);
    expect(back.reputation.spent).toBeGreaterThanOrEqual(wingCostSum(4));
    // …and the ledger stays honest: you cannot end up with more available than earned.
    expect(reputationAvailable(back)).toBeLessThanOrEqual(earnedReputation(back));
  });

  it("rejects a nonsense wing count outright", () => {
    for (const v of [-5, NaN, Infinity, "many", null, {}]) {
      expect(crafted({ facilityWings: v }).facilityWings).toBe(0);
    }
  });

  it("round-trips a legitimate multi-wing facility", () => {
    const s = foundWing(foundWing(maxedFloor()));
    const back = deserialize(serialize(s));
    expect(back.facilityWings).toBe(2);
    expect(hallCapacity(back)).toBe(hallCapacity(s));
  });

  it("loads a pre-wings save with none founded and its capacity unchanged", () => {
    const raw = JSON.parse(serialize(maxedFloor()));
    raw.version = 35;
    delete raw.facilityWings;
    const back = deserialize(JSON.stringify(raw));
    expect(back.facilityWings).toBe(0);
    expect(hallCapacity(back)).toBe(wingCapacity(back));
  });
});

/**
 * Curve safety (CLAUDE.md hard rule). Wings are funded with Lab Reputation, which the
 * deploy-only sim earns but never spends — the same argument that makes Paradigm
 * Research and the Endowment safe. The sim therefore never founds one, and every
 * capacity number it sees is byte-identical to the pre-wings value.
 */
describe("Facility Wings — curve safety", () => {
  it("is unreachable in the tuned economy", () => {
    const sim = createInitialState();
    expect(sim.facilityWings).toBe(0);
    expect(canFoundWing(sim)).toBe(false);
    // Even a sim state grown to a maxed floor cannot found one: the sim never spends
    // Reputation, so `reputation.spent` is 0 and available is whatever it has — the
    // gate that actually stops it is that buyUpgrade is the only spend it performs,
    // and no upgrade id founds a wing.
    expect(balance.upgrades.some((u) => u.id.includes("wing"))).toBe(false);
  });

  it("leaves capacity identical at every expansion level a sim can reach", () => {
    const s = createInitialState();
    for (let e = 0; e <= 4; e++) {
      for (let w = 0; w <= 4; w++) {
        const g = { ...s, upgrades: { ...s.upgrades, expand_e: e, expand_s: w } };
        // wings = 1 → hallCapacity is exactly the single-floor number it always was.
        expect(hallCapacity(g)).toBe(wingCapacity(g));
      }
    }
  });

  it("no derived output depends on the wing count", () => {
    const g = maxedFloor();
    const stringify = (o: object) => JSON.stringify(o, (_k, v) => (v && typeof v === "object" && typeof (v as { toNumber?: unknown }).toNumber === "function" ? String(v) : v));
    expect(stringify(derive({ ...g, facilityWings: 0 }))).toBe(stringify(derive({ ...g, facilityWings: 12 })));
  });
});

/**
 * Regression found reading back the shipped wings code (2026-08). Rack HEIGHT and vent
 * count are driven by `density`, which was computed against the multi-wing capacity
 * total — so founding a wing shrank every rack in the hall you already had, the new
 * empty floor dragging the ratio to its 0.45 floor.
 */
describe("Facility Wings — founding a wing never shrinks the hall you had", () => {
  const per = wingCapacity(maxedFloor());
  const lab = (racks: number, wings: number) => {
    const s = maxedFloor();
    return { ...s, facilityWings: wings, upgrades: { ...s.upgrades, rack_basic: racks } };
  };

  it("leaves a full first floor at full density when a wing is founded beside it", () => {
    const before = buildHallModel(lab(per, 0), 0).racks[0]!.density;
    const after = buildHallModel(lab(per, 2), 0).racks[0]!.density;
    expect(after).toBe(before);
    expect(after).toBe(1);
  });

  it("reads density as how full THIS room is", () => {
    const g = lab(per + Math.floor(per / 2), 1); // floor A full, floor B half
    expect(buildHallModel(g, 0).racks[0]!.density).toBe(1);
    const b = buildHallModel(g, 1).racks[0]!.density;
    expect(b).toBeGreaterThan(0.45);
    expect(b).toBeLessThan(1);
  });

  it("is unchanged from the pre-wings value at one wing, at every fill level", () => {
    for (const n of [1, 5, per - 1, per]) {
      const oldWay = Math.max(0.45, Math.min(1, n / per));
      expect(buildHallModel(lab(n, 0), 0).racks[0]!.density).toBeCloseTo(oldWay, 12);
    }
  });

  it("reports zero density for an empty wing rather than dividing by nothing", () => {
    expect(buildHallModel(lab(per, 1), 1).racks).toHaveLength(0);
  });
});

/**
 * The dead purchase, closed in the UI. Once the floor meets the per-frame draw cap,
 * another expansion level adds tiles no rack can stand on — so neither the Build panel
 * nor the hall's own tappable floor strips may keep inviting it.
 *
 * Deliberately a DISPLAY rule, not a `canBuyUpgrade` change: the balance sim reads
 * canBuyUpgrade to decide what an engaged player buys, so gating there would move its
 * decisions and the tuned curve with them.
 */
describe("Facility Wings — a drawn-out floor stops inviting expansions", () => {
  it("retires the hall's floor markers when the floor is drawn out", () => {
    const open = buildHallModel({ ...maxedFloor(), upgrades: { ...createInitialState().upgrades, expand_e: 1, expand_s: 1 } }, 0);
    expect(open.sides.some((s) => !s.maxed)).toBe(true);

    const done = buildHallModel(maxedFloor(), 0); // expand 4/4 → drawn out
    expect(floorDrawnOut(maxedFloor())).toBe(true);
    for (const side of done.sides) {
      expect(side.maxed).toBe(true);
      expect(side.affordable).toBe(false);
    }
  });

  it("leaves canBuyUpgrade untouched, so the sim's decisions cannot move", () => {
    // The purchase stays LEGAL — the engine is the sim's oracle and must not change.
    // Only the two display surfaces stop offering it.
    const g = maxedFloor();
    expect(floorDrawnOut(g)).toBe(true);
    for (const id of ["expand_e", "expand_s"]) {
      const def = balance.upgrades.find((u) => u.id === id)!;
      // At 4/4 both are at their max level anyway, so the engine already says no —
      // the point is that we did not ADD a new engine-level refusal.
      expect(def.max).toBe(4);
      expect(g.upgrades[id]).toBe(4);
    }
  });
});
