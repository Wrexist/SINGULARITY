import { describe, it, expect } from "vitest";
import { hallCapacity, totalRacks, floorFull, hallRooms, hallRoomSplit } from "./hall";
import { canBuyUpgrade, buyUpgrade } from "./actions";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

describe("hall capacity (racks are gated by floor space)", () => {
  const baseCap = balance.hall.baseCols * balance.hall.baseRows;

  it("an empty floor reports base capacity and no racks", () => {
    const s = createInitialState();
    expect(hallCapacity(s)).toBe(baseCap);
    expect(totalRacks(s)).toBe(0);
    expect(floorFull(s)).toBe(false);
  });

  it("counts racks of every tier against one shared capacity", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 2, rack_server: 3, rack_tpu: 1 };
    expect(totalRacks(s)).toBe(6);
  });

  it("blocks buying the SAME tier when the floor is full (no lower tier to evict)", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e12);
    s.upgrades = { rack_basic: baseCap }; // floor exactly full of the lowest tier
    expect(floorFull(s)).toBe(true);
    expect(canBuyUpgrade(s, "rack_basic")).toBe(false); // can't evict an equal tier
    expect(buyUpgrade(s, "rack_basic")).toBe(s); // no-op
  });

  it("expanding the hall frees slots so racks can be bought again", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e12);
    s.upgrades = { rack_basic: baseCap, expand_e: 1 }; // +2 columns
    expect(hallCapacity(s)).toBe((balance.hall.baseCols + 2) * balance.hall.baseRows);
    expect(floorFull(s)).toBe(false);
    expect(canBuyUpgrade(s, "rack_basic")).toBe(true);
  });

  it("splits into multiple rooms only after the floor is expanded", () => {
    const base = createInitialState();
    expect(hallRooms(base)).toBe(1);
    expect(hallRoomSplit(base)).toEqual({ splitGx: null, splitGy: null });

    const wide = createInitialState();
    wide.upgrades = { expand_e: 1 }; // +2 cols → splits left/right
    expect(hallRooms(wide)).toBe(2);
    expect(hallRoomSplit(wide).splitGx).not.toBeNull();
    expect(hallRoomSplit(wide).splitGy).toBeNull();

    const facility = createInitialState();
    facility.upgrades = { expand_e: 2, expand_s: 2 }; // both → 2×2
    expect(hallRooms(facility)).toBe(4);
  });

  it("does not gate non-rack upgrades by floor space", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e12);
    s.upgrades = { rack_basic: baseCap }; // floor full
    expect(canBuyUpgrade(s, "overclock")).toBe(true);
  });

  it("on a full floor, a higher tier upgrades in place by evicting a lower one", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e12);
    s.upgrades = { rack_basic: baseCap }; // floor full of consumer racks
    expect(canBuyUpgrade(s, "rack_server")).toBe(true);
    const next = buyUpgrade(s, "rack_server");
    expect(next.upgrades.rack_server).toBe(1);
    expect(next.upgrades.rack_basic).toBe(baseCap - 1); // one consumer evicted
    expect(totalRacks(next)).toBe(baseCap); // net count unchanged — still full, not over
  });

  it("cannot replace when the floor is full of equal-or-higher tiers (must expand)", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e12);
    s.upgrades = { rack_tpu: baseCap }; // full of the top tier
    expect(canBuyUpgrade(s, "rack_server")).toBe(false); // nothing lower to evict
    expect(canBuyUpgrade(s, "rack_basic")).toBe(false);
    expect(buyUpgrade(s, "rack_server")).toBe(s); // no-op
  });
});
