import { describe, it, expect } from "vitest";
import { hallCapacity, totalRacks, floorFull } from "./hall";
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

  it("blocks buying a rack when the floor is full, even with money to spare", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e12);
    s.upgrades = { rack_basic: baseCap }; // floor exactly full
    expect(floorFull(s)).toBe(true);
    expect(canBuyUpgrade(s, "rack_basic")).toBe(false);
    expect(canBuyUpgrade(s, "rack_server")).toBe(false);
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

  it("does not gate non-rack upgrades by floor space", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e12);
    s.upgrades = { rack_basic: baseCap }; // floor full
    expect(canBuyUpgrade(s, "overclock")).toBe(true);
  });
});
