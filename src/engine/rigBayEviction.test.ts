import { describe, it, expect } from "vitest";
import { equipComponent, equippedCount, freeCopies, fuseComponents, canFuse, componentsBalance } from "./components";
import { buyUpgrade, buyUpgradeBulk } from "./actions";
import { hallCapacity, totalRacks } from "./hall";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/** A full floor of Consumer racks with plenty of money and a part fitted to the
 *  Consumer tier (the only tier the Rig Bay shows this early). */
function fullConsumerFloor(part: "acc_refurb" | "trophy_founders"): GameState {
  const s = createInitialState();
  const cap = hallCapacity(s);
  let g: GameState = {
    ...s,
    upgrades: { ...s.upgrades, rack_basic: cap },
    resources: { ...s.resources, money: Big.of(1e15), compute: Big.of(1e15), data: Big.of(1e15) },
    // The trophy is only legitimately owned once its milestone is done.
    contracts: { ...s.contracts, completed: part === "trophy_founders" ? ["ship_it"] : s.contracts.completed },
    components: { ...s.components, owned: { [part]: 1 } },
  };
  g = equipComponent(g, 0, "accelerator", part);
  expect(g.components.loadout[0]!.accelerator).toBe(part);
  return g;
}

/**
 * On a full floor a higher-tier rack upgrades in place by evicting a lower-tier one.
 * When that takes a tier's LAST rack, the Rig Bay stops showing the tier — so a part
 * still fitted there was stranded: invisible, un-removable, counted as "slotted" so it
 * could not be fitted elsewhere or fused, and the tier could not come back because the
 * floor was full. The part must come back to the inventory instead.
 */
describe("Rig Bay — a tier emptied by in-place rack upgrades", () => {
  for (const part of ["acc_refurb", "trophy_founders"] as const) {
    it(`returns a fitted ${part} to the inventory when the tier's last rack is replaced`, () => {
      const g = fullConsumerFloor(part);
      const after = buyUpgradeBulk(g, "rack_server", Infinity);
      expect(after.upgrades.rack_basic ?? 0).toBe(0);
      expect(totalRacks(after)).toBe(hallCapacity(after));
      // Nothing is slotted in the emptied tier any more; the copy is free again.
      expect(after.components.loadout[0]!.accelerator).toBeUndefined();
      expect(after.components.owned[part]).toBe(1); // never destroyed
      expect(equippedCount(after, part)).toBe(0);
      expect(freeCopies(after, part)).toBe(1);
      // ...so it can be fitted to a tier that still has racks.
      const refit = equipComponent(after, 1, "accelerator", part);
      expect(refit).not.toBe(after);
      expect(refit.components.loadout[1]!.accelerator).toBe(part);
      // And only once: no duplicated copy.
      expect(freeCopies(refit, part)).toBe(0);
      expect(equippedCount(refit, part)).toBe(1);
    });
  }

  it("keeps the part fitted while the tier still has a rack left", () => {
    const g = fullConsumerFloor("acc_refurb");
    const one = buyUpgrade(g, "rack_server");
    expect(one.upgrades.rack_basic).toBe((g.upgrades.rack_basic ?? 0) - 1);
    expect(one.components.loadout[0]!.accelerator).toBe("acc_refurb");
    expect(one.components).toBe(g.components); // untouched, same reference
  });

  it("frees a stranded spare so it can be fused again", () => {
    let g = fullConsumerFloor("acc_refurb");
    g = { ...g, components: { ...g.components, owned: { acc_refurb: componentsBalance.fuseCount } } };
    expect(canFuse(g, "acc_refurb")).toBe(false); // one of the copies is slotted
    const after = buyUpgradeBulk(g, "rack_server", Infinity);
    expect(canFuse(after, "acc_refurb")).toBe(true);
    const fused = fuseComponents(after, "acc_refurb");
    expect(fused.components.owned.acc_refurb ?? 0).toBe(0);
    expect(fused.components.owned.acc_blower).toBe(1);
  });

  it("releases a Server tier's parts when TPU pods replace its last rack", () => {
    const s = createInitialState();
    const cap = hallCapacity(s);
    let g: GameState = {
      ...s,
      upgrades: { ...s.upgrades, rack_server: cap },
      resources: { ...s.resources, money: Big.of(1e30) },
      components: { ...s.components, owned: { acc_refurb: 1, cool_boxfans: 1 } },
    };
    g = equipComponent(g, 1, "accelerator", "acc_refurb");
    g = equipComponent(g, 1, "cooling", "cool_boxfans");
    const after = buyUpgradeBulk(g, "rack_tpu", Infinity);
    expect(after.upgrades.rack_server ?? 0).toBe(0);
    expect(after.components.loadout[1]).toEqual({});
    expect(freeCopies(after, "acc_refurb")).toBe(1);
    expect(freeCopies(after, "cool_boxfans")).toBe(1);
  });

  it("does not touch the loadout of a rack buy that evicts nothing", () => {
    const s = createInitialState();
    let g: GameState = {
      ...s,
      upgrades: { ...s.upgrades, rack_basic: 4 },
      resources: { ...s.resources, money: Big.of(1e15) },
      components: { ...s.components, owned: { acc_refurb: 1 } },
    };
    g = equipComponent(g, 0, "accelerator", "acc_refurb");
    const next = buyUpgrade(g, "rack_server");
    expect(next.upgrades.rack_basic).toBe(4);
    expect(next.components).toBe(g.components);
  });

  it("won't fit a part to a tier that has no racks (clearing a slot is always allowed)", () => {
    const g = buyUpgradeBulk(fullConsumerFloor("acc_refurb"), "rack_server", Infinity);
    expect(g.upgrades.rack_basic ?? 0).toBe(0);
    expect(equipComponent(g, 0, "accelerator", "acc_refurb")).toBe(g);
    expect(equipComponent(g, 2, "accelerator", "acc_refurb")).toBe(g); // no TPU pods either
  });

  it("frees a part already stranded in a live save when it loads", () => {
    // A save written before the fix: the Consumer tier has no racks left but its
    // accelerator slot still holds the part (the Rig Bay can no longer show it).
    const g = fullConsumerFloor("trophy_founders");
    const stranded: GameState = { ...g, upgrades: { ...g.upgrades, rack_basic: 0, rack_server: hallCapacity(g) } };
    const back = deserialize(serialize(stranded));
    expect(back.components.owned.trophy_founders).toBe(1);
    expect(back.components.loadout[0]!.accelerator).toBeUndefined();
    expect(freeCopies(back, "trophy_founders")).toBe(1);
    // A tier that still has racks keeps its fitted parts through a load.
    const fitted = equipComponent({ ...back, components: back.components }, 1, "accelerator", "trophy_founders");
    const again = deserialize(serialize(fitted));
    expect(again.components.loadout[1]!.accelerator).toBe("trophy_founders");
  });
});
