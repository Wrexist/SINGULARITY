import { describe, it, expect } from "vitest";
import {
  componentsBalance, SLOTS_BY_TIER, componentDef, freshComponents, componentsUnlocked,
  visibleCatalog, canBuyComponent, buyComponent, equipComponent, equippedCount,
  tierComputeMult, tierPowerMult, loadoutDataPerSec, tierLoadoutFill,
  grantEarnedComponents, carryEarnedComponents, earnedDefs, canFuse, fuseComponents, freeCopies, tierSetMatched,
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
      if (d.earnedBy) expect(d.cost).toBe(0); // trophies are earned, never priced
      else expect(d.cost).toBeGreaterThan(0);
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
    // A big fleet sees every PURCHASABLE part; trophies stay gated on their milestones.
    const purchasable = componentsBalance.catalog.filter((d) => !d.earnedBy).length;
    const rich = richLab();
    rich.upgrades = { rack_basic: 40, rack_server: 20, rack_tpu: 12 }; // past the deepest reveal
    expect(visibleCatalog(rich).length).toBe(purchasable);
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

describe("Rig Bay — trophy hardware (C2)", () => {
  it("every trophy's source id points at a real contract/achievement (guard)", () => {
    // A typo'd source would make a trophy silently unobtainable forever.
    for (const def of earnedDefs()) {
      expect(def.earnedBy).toBeTruthy();
      expect(def.cost).toBe(0);
      expect(def.fusesInto).toBeUndefined(); // trophies never fuse away
    }
  });

  it("grants a trophy once its milestone completes, idempotently", () => {
    const s = richLab();
    expect(grantEarnedComponents(s)).toBe(s); // nothing earned → same ref
    s.contracts.completed = ["ship_it"];
    const granted = grantEarnedComponents(s);
    expect(granted.components.owned.trophy_founders).toBe(1);
    expect(grantEarnedComponents(granted)).toBe(granted); // second pass no-op
  });

  it("trophies are never buyable, but equip like any part once granted", () => {
    let s = richLab();
    s.contracts.completed = ["ship_it"];
    expect(canBuyComponent(s, "trophy_founders")).toBe(false);
    s = grantEarnedComponents(s);
    s = equipComponent(s, 2, "accelerator", "trophy_founders");
    expect(s.components.loadout[2]!.accelerator).toBe("trophy_founders");
  });

  it("survives prestige while bought parts do not", () => {
    let s = richLab();
    s.contracts.completed = ["ship_it"];
    s = grantEarnedComponents(s);
    s = buyComponent(s, "acc_refurb");
    s.research = ["inference_api"];
    const shipped = prestige(s);
    expect(shipped.components.owned.trophy_founders).toBe(1);
    expect(shipped.components.owned.acc_refurb).toBeUndefined();
    expect(carryEarnedComponents(s).owned).toEqual({ trophy_founders: 1 });
  });
});

describe("Rig Bay — matched rig (C4)", () => {
  it("a full same-grade loadout earns the set bonus; a mixed one does not", () => {
    let s = richLab();
    // TPU pod (tier 2): all three slots, all standard grade → matched.
    s = buyComponent(s, "acc_refurb");
    s = buyComponent(s, "cool_boxfans");
    s = buyComponent(s, "net_cat5");
    s = equipComponent(s, 2, "accelerator", "acc_refurb");
    s = equipComponent(s, 2, "cooling", "cool_boxfans");
    expect(tierSetMatched(s, 2)).toBe(false); // one slot still empty
    s = equipComponent(s, 2, "interconnect", "net_cat5");
    expect(tierSetMatched(s, 2)).toBe(true);
    // The bonus is EFFICIENCY, not income: the matched tier draws less power,
    // compute is untouched (a compute-side bonus compounded ~10min off the curve).
    const cool = componentDef("cool_boxfans")!.value;
    expect(tierPowerMult(s, 2)).toBeCloseTo(cool * componentsBalance.setBonusPowerMult);
    expect(tierComputeMult(s, 2)).toBeCloseTo(componentDef("acc_refurb")!.value);
    // Swap one part to a higher grade → set breaks, bonus drops.
    s = buyComponent(s, "cool_immersion");
    s = equipComponent(s, 2, "cooling", "cool_immersion");
    expect(tierSetMatched(s, 2)).toBe(false);
    expect(tierPowerMult(s, 2)).toBeCloseTo(componentDef("cool_immersion")!.value);
  });

  it("a single-slot tier never matches — one part isn't a set", () => {
    // A trivial match on the basic fleet acted as a hidden global buff
    // (sim-caught: ~10 minutes off the curve). Sets need ≥2 slots.
    let s = buyComponent(richLab(), "acc_refurb");
    s = equipComponent(s, 0, "accelerator", "acc_refurb");
    expect(tierSetMatched(s, 0)).toBe(false);
    expect(tierComputeMult(s, 0)).toBeCloseTo(componentDef("acc_refurb")!.value);
  });
});

describe("Rig Bay — fusion (C3)", () => {
  it("fusion ladders are valid: same class, ascending value, real targets", () => {
    for (const def of componentsBalance.catalog) {
      if (!def.fusesInto) continue;
      const next = componentDef(def.fusesInto)!;
      expect(next).toBeTruthy();
      expect(next.class).toBe(def.class);
      if (def.class === "cooling") expect(next.value).toBeLessThan(def.value);
      else expect(next.value).toBeGreaterThan(def.value);
    }
  });

  it("fuses N free copies into one of the next rung", () => {
    let s = richLab();
    for (let i = 0; i < componentsBalance.fuseCount; i++) s = buyComponent(s, "acc_refurb");
    expect(canFuse(s, "acc_refurb")).toBe(true);
    s = fuseComponents(s, "acc_refurb");
    expect(s.components.owned.acc_refurb).toBeUndefined();
    expect(s.components.owned.acc_blower).toBe(1);
  });

  it("never consumes slotted copies (fusion needs FREE copies)", () => {
    let s = richLab();
    for (let i = 0; i < componentsBalance.fuseCount; i++) s = buyComponent(s, "acc_refurb");
    s = equipComponent(s, 0, "accelerator", "acc_refurb");
    expect(freeCopies(s, "acc_refurb")).toBe(componentsBalance.fuseCount - 1);
    expect(canFuse(s, "acc_refurb")).toBe(false);
    expect(fuseComponents(s, "acc_refurb")).toBe(s);
  });
});
