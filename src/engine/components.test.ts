import { describe, it, expect } from "vitest";
import {
  componentsBalance, SLOTS_BY_TIER, componentDef, freshComponents, componentsUnlocked,
  visibleCatalog, canBuyComponent, buyComponent, equipComponent, equippedCount,
  tierComputeMult, tierPowerMult, loadoutDataPerSec, tierLoadoutFill,
} from "./components";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";

/** A lab far enough along that the Rig Bay and the whole catalog are visible. */
function richLab() {
  const s = createInitialState();
  s.upgrades = { rack_basic: 12, rack_server: 8, rack_tpu: 6 };
  s.resources.money = Big.of(1e9);
  return s;
}

describe("Rig Bay — catalog data", () => {
  it("has unique ids and every part matches a real slot class with a sane value", () => {
    const ids = componentsBalance.catalog.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of componentsBalance.catalog) {
      expect(["accelerator", "cooling", "interconnect"]).toContain(d.class);
      expect(d.cost).toBeGreaterThan(0);
      if (d.class === "accelerator") expect(d.value).toBeGreaterThan(1);
      if (d.class === "cooling") { expect(d.value).toBeGreaterThan(0); expect(d.value).toBeLessThan(1); }
      if (d.class === "interconnect") expect(d.value).toBeGreaterThan(0);
    }
  });

  it("reveals the bay and the catalog in waves by fleet size", () => {
    const s = createInitialState();
    expect(componentsUnlocked(s)).toBe(false);
    s.upgrades = { rack_basic: componentsBalance.revealAtRacks };
    expect(componentsUnlocked(s)).toBe(true);
    expect(visibleCatalog(s).length).toBeGreaterThan(0);
    expect(visibleCatalog(s).length).toBeLessThan(componentsBalance.catalog.length);
    expect(visibleCatalog(richLab()).length).toBe(componentsBalance.catalog.length);
  });
});

describe("Rig Bay — buy / equip", () => {
  it("buys a copy into the inventory and charges money", () => {
    const s = richLab();
    const def = componentDef("acc_refurb")!;
    const next = buyComponent(s, "acc_refurb");
    expect(next.components.owned.acc_refurb).toBe(1);
    expect(s.resources.money.sub(next.resources.money).toNumber()).toBeCloseTo(def.cost);
  });

  it("refuses to buy when unaffordable or not yet revealed", () => {
    const s = richLab();
    s.resources.money = Big.of(1);
    expect(canBuyComponent(s, "acc_refurb")).toBe(false);
    const early = createInitialState();
    early.upgrades = { rack_basic: componentsBalance.revealAtRacks };
    early.resources.money = Big.of(1e9);
    expect(canBuyComponent(early, "acc_wafer")).toBe(false); // deep part not revealed yet
  });

  it("equips only class-matching parts into class-typed slots", () => {
    let s = buyComponent(richLab(), "cool_boxfans");
    expect(equipComponent(s, 0, "accelerator", "cool_boxfans")).toBe(s); // wrong class → no-op
    s = equipComponent(s, 1, "cooling", "cool_boxfans");
    expect(s.components.loadout[1]!.cooling).toBe("cool_boxfans");
    // basic racks (tier 0) have no cooling slot at all.
    expect(SLOTS_BY_TIER[0]).toEqual(["accelerator"]);
    expect(equipComponent(s, 0, "cooling", "cool_boxfans")).toBe(s);
  });

  it("one physical copy fills one slot — a second tier needs a second copy", () => {
    let s = buyComponent(richLab(), "acc_refurb");
    s = equipComponent(s, 0, "accelerator", "acc_refurb");
    expect(equippedCount(s, "acc_refurb")).toBe(1);
    // The single copy is in use → equipping tier 1 is a no-op…
    expect(equipComponent(s, 1, "accelerator", "acc_refurb")).toBe(s);
    // …until a second copy is bought.
    s = buyComponent(s, "acc_refurb");
    s = equipComponent(s, 1, "accelerator", "acc_refurb");
    expect(equippedCount(s, "acc_refurb")).toBe(2);
  });

  it("unequips freely (parts are never destroyed) and tracks fill", () => {
    let s = buyComponent(richLab(), "acc_refurb");
    s = equipComponent(s, 0, "accelerator", "acc_refurb");
    expect(tierLoadoutFill(s, 0)).toBe(1);
    s = equipComponent(s, 0, "accelerator", null);
    expect(tierLoadoutFill(s, 0)).toBe(0);
    expect(s.components.owned.acc_refurb).toBe(1);
  });
});

describe("Rig Bay — derived effects", () => {
  it("an accelerator multiplies ONLY its tier's rack output", () => {
    const base = richLab();
    const before = derive(base).computePerSec;
    let s = buyComponent(base, "acc_hopperoo");
    s = equipComponent(s, 2, "accelerator", "acc_hopperoo");
    const after = derive(s).computePerSec;
    expect(after.gt(before)).toBe(true);
    expect(tierComputeMult(s, 2)).toBeCloseTo(componentDef("acc_hopperoo")!.value);
    expect(tierComputeMult(s, 0)).toBe(1); // other tiers untouched
  });

  it("cooling reduces the slotted tier's power draw", () => {
    let s = buyComponent(richLab(), "cool_boxfans");
    s = equipComponent(s, 1, "cooling", "cool_boxfans");
    expect(tierPowerMult(s, 1)).toBeCloseTo(componentDef("cool_boxfans")!.value);
    expect(tierPowerMult(s, 2)).toBe(1);
  });

  it("interconnects add flat Data/sec scaled by the tier's rack count", () => {
    let s = buyComponent(richLab(), "net_cat5");
    s = equipComponent(s, 2, "interconnect", "net_cat5");
    const perRack = componentDef("net_cat5")!.value;
    expect(loadoutDataPerSec(s)).toBeCloseTo(perRack * 6); // 6 TPU pods in richLab
  });
});

describe("Rig Bay — persistence & prestige", () => {
  it("round-trips inventory + loadout through save/load", () => {
    let s = buyComponent(richLab(), "acc_refurb");
    s = equipComponent(s, 0, "accelerator", "acc_refurb");
    const back = deserialize(serialize(s));
    expect(back.components.owned.acc_refurb).toBe(1);
    expect(back.components.loadout[0]!.accelerator).toBe("acc_refurb");
  });

  it("drops unknown ids and over-equipped copies on load (crafted saves)", () => {
    let s = buyComponent(richLab(), "acc_refurb");
    s = equipComponent(s, 0, "accelerator", "acc_refurb");
    const raw = JSON.parse(serialize(s));
    raw.components.owned.fake_gpu = 5;
    raw.components.loadout[1] = { accelerator: "acc_refurb" }; // 2 equips, 1 owned
    const back = deserialize(JSON.stringify(raw));
    expect(back.components.owned.fake_gpu).toBeUndefined();
    const equips = back.components.loadout.filter((l) => l.accelerator === "acc_refurb").length;
    expect(equips).toBe(1);
  });

  it("migrates a v16 save by adding an empty Rig Bay", () => {
    const raw = JSON.parse(serialize(createInitialState()));
    raw.version = 16;
    delete raw.components;
    const back = deserialize(JSON.stringify(raw));
    expect(back.components).toEqual(freshComponents());
  });

  it("resets on prestige like racks do (bought with in-run money)", () => {
    let s = buyComponent(richLab(), "acc_refurb");
    s = equipComponent(s, 0, "accelerator", "acc_refurb");
    // Meet the ship gate the cheap way for the test.
    s.research = ["inference_api"];
    const shipped = prestige(s);
    expect(shipped.components).toEqual(freshComponents());
  });
});
