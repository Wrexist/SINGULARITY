import { describe, it, expect } from "vitest";
import * as rig from "./components";
import { componentsBalance, componentDef, canFuse, fuseComponents, buyComponent, visibleCatalog } from "./components";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * Rig Bay fusion is fair (round 8, owner call). Fusion took three copies of any part
 * into one of the next rung, so 243 Refurb Mining Cards ($34K) climbed the ladder into
 * a Dyson-Adjacent Cluster listed at $2.8M (an 82x discount), and handed it over long
 * before its 32-rack reveal. Now:
 *  - a fusion result is never made before the fleet reveals it, and
 *  - the cheapest all-Money route to any part through fusion costs at least
 *    `minFuseValueShare` (50%) of its list price, the whole ladder included.
 */
const countFor = (id: string): number =>
  (rig as unknown as { fuseCountFor?: (id: string) => number }).fuseCountFor?.(id) ?? componentsBalance.fuseCount;

/** Cheapest Money to get one copy of a part: buy it, or fuse the rung below. */
function cheapest(id: string): number {
  const def = componentDef(id)!;
  let best = def.cost;
  for (const below of componentsBalance.catalog) {
    if (below.fusesInto === id) best = Math.min(best, countFor(below.id) * cheapest(below.id));
  }
  return best;
}

function lab(racks: number): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: Math.ceil(racks / 3), rack_server: Math.ceil(racks / 3), rack_tpu: racks - 2 * Math.ceil(racks / 3) };
  s.resources.money = Big.of(1e12);
  return s;
}

describe("Rig Bay fusion is fair", () => {
  it("every fusion route costs at least half the result's list price", () => {
    const share = (componentsBalance as { minFuseValueShare?: number }).minFuseValueShare ?? 0.5;
    expect(share).toBeGreaterThanOrEqual(0.5);
    for (const def of componentsBalance.catalog) {
      if (!def.fusesInto) continue;
      const target = componentDef(def.fusesInto)!;
      const viaFusion = countFor(def.id) * cheapest(def.id);
      expect(viaFusion / target.cost, `${def.id} -> ${target.id}`).toBeGreaterThanOrEqual(share);
    }
    // The reported path: Refurb Cards all the way up to a Dyson-Adjacent Cluster.
    expect(cheapest("acc_dyson")).toBeGreaterThanOrEqual(0.5 * componentDef("acc_dyson")!.cost);
  });

  it("always needs at least the base number of spares, and never more than buying would", () => {
    for (const def of componentsBalance.catalog) {
      if (!def.fusesInto) continue;
      expect(countFor(def.id)).toBeGreaterThanOrEqual(componentsBalance.fuseCount);
      // Spares at list price never cost more than one spare over the result's price.
      const parity = Math.ceil(componentDef(def.fusesInto)!.cost / def.cost);
      expect(countFor(def.id)).toBeLessThanOrEqual(Math.max(componentsBalance.fuseCount, parity));
    }
  });

  it("never makes a part before the fleet reveals it", () => {
    const asic = componentDef("acc_asic")!;
    const n = countFor("acc_hopperoo");
    const below = lab(asic.revealAtRacks - 1);
    below.components.owned = { acc_hopperoo: n };
    expect(canFuse(below, "acc_hopperoo")).toBe(false);
    expect(fuseComponents(below, "acc_hopperoo")).toBe(below);
    const at = lab(asic.revealAtRacks);
    at.components.owned = { acc_hopperoo: n };
    expect(canFuse(at, "acc_hopperoo")).toBe(true);
    expect(fuseComponents(at, "acc_hopperoo").components.owned.acc_asic).toBe(1);
    // Every rung, at one rack short of its target's reveal.
    for (const def of componentsBalance.catalog) {
      if (!def.fusesInto) continue;
      const t = componentDef(def.fusesInto)!;
      const s = lab(Math.max(3, t.revealAtRacks - 1));
      s.components.owned = { [def.id]: countFor(def.id) };
      expect(canFuse(s, def.id), `${def.id} at ${t.revealAtRacks - 1} racks`).toBe(false);
    }
  });

  it("243 Refurb Cards no longer climb into a Dyson-Adjacent Cluster", () => {
    let s = lab(40);
    const ladder = ["acc_refurb", "acc_blower", "acc_hopperoo", "acc_asic", "acc_wafer"];
    s.components.owned = { acc_refurb: 243 };
    for (const id of ladder) while (canFuse(s, id)) s = fuseComponents(s, id);
    expect(s.components.owned.acc_dyson ?? 0).toBe(0);
  });

  it("keeps a part a save already fused ahead of its reveal (filter, don't wipe)", () => {
    const s = lab(10);
    s.components.owned = { acc_asic: 1, acc_dyson: 1 };
    const back = deserialize(serialize(s))!;
    expect(back.components.owned.acc_asic).toBe(1);
    expect(back.components.owned.acc_dyson).toBe(1);
    expect(visibleCatalog(back).map((d) => d.id)).toEqual(expect.arrayContaining(["acc_asic", "acc_dyson"]));
    // Owned early, still not on sale early.
    expect(buyComponent(back, "acc_dyson")).toBe(back);
  });
});
