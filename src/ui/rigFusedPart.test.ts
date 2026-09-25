import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

// Open the slot picker for the TPU tier's accelerator (the panel's only useState), and
// render the picker inline: server rendering has no document.body to portal into.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: <T,>(_init: T) => [{ tier: 2, slot: "accelerator" } as T, () => {}] as const };
});
vi.mock("./Portal", () => ({ Portal: ({ children }: { children: ReactNode }) => children }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RigBayPanel } from "./RigBayPanel";
import { createInitialState } from "../engine/state";
import {
  buyComponent, equipComponent, fuseComponents, canFuse, freeCopies, visibleCatalog, componentDef,
} from "../engine/components";
import { totalRacks } from "../engine/hall";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * A fused part must stay in the Rig Bay (bug hunt r3). Fusing three spare H400
 * "Hopperoo" cards makes one Liquid-Silicon ASIC, a part that is only put on sale at 16
 * racks. The slot picker listed only parts on sale at the current fleet size, so on a
 * 10–15 rack lab the ASIC the fusion just made appeared nowhere: three parts gone,
 * nothing to fit, until the lab grew past the reveal.
 */

const ASIC = componentDef("acc_asic")!;

/** A 10-rack lab that fitted a Hopperoo on every tier, took them all out, and fused. */
function fusedLab(): GameState {
  let s = createInitialState();
  s.upgrades = { rack_basic: 4, rack_server: 3, rack_tpu: 3 };
  s.resources = { ...s.resources, money: Big.of(1e6) };
  for (const tier of [0, 1, 2]) {
    s = buyComponent(s, "acc_hopperoo");
    s = equipComponent(s, tier, "accelerator", "acc_hopperoo");
  }
  for (const tier of [0, 1, 2]) s = equipComponent(s, tier, "accelerator", null);
  expect(freeCopies(s, "acc_hopperoo")).toBe(3);
  expect(canFuse(s, "acc_hopperoo")).toBe(true);
  return fuseComponents(s, "acc_hopperoo");
}

describe("a part made by fusion is listed before its catalog reveal", () => {
  it("owns the fused part on a lab below its reveal", () => {
    const s = fusedLab();
    expect(s.components.owned.acc_asic).toBe(1);
    expect(totalRacks(s)).toBeLessThan(ASIC.revealAtRacks);
    expect(visibleCatalog(s).map((d) => d.id)).toContain("acc_asic");
  });

  it("offers it in the slot picker, ready to fit", () => {
    const html = renderToStaticMarkup(createElement(RigBayPanel, { game: fusedLab(), onBuy: () => {}, onEquip: () => {}, onFuse: () => {} }));
    const row = html.split('<div class="rig-row">').find((r) => r.includes(ASIC.name));
    expect(row).toBeDefined();
    expect(row).toContain("Fit it");
  });

  it("still keeps unowned parts off sale until their reveal", () => {
    const s = fusedLab();
    expect(visibleCatalog(s).map((d) => d.id)).not.toContain("acc_wafer");
  });
});
