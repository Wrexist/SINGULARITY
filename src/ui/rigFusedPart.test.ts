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
import { canFuse, fuseCountFor, visibleCatalog, componentDef } from "../engine/components";
import { totalRacks } from "../engine/hall";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * A fused part must stay in the Rig Bay (bug hunt r3). Fusing three spare H400
 * "Hopperoo" cards used to make one Liquid-Silicon ASIC, a part that is only put on
 * sale at 16 racks. The slot picker listed only parts on sale at the current fleet
 * size, so on a 10–15 rack lab the ASIC the fusion just made appeared nowhere: three
 * parts gone, nothing to fit, until the lab grew past the reveal.
 *
 * Round 8: fusion now waits for the result's reveal, but saves that fused a part early
 * keep it (filter, don't wipe) — so the part must still be listed and fittable.
 */

const ASIC = componentDef("acc_asic")!;

/** A 10-rack lab whose save fused an ASIC before the fairness rule (no spares left). */
function fusedLab(): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 4, rack_server: 3, rack_tpu: 3 };
  s.resources = { ...s.resources, money: Big.of(1e6) };
  s.components = { ...s.components, owned: { acc_asic: 1 } };
  return s;
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

  it("can no longer fuse one there: fusion waits for the reveal", () => {
    const s = fusedLab();
    s.components = { ...s.components, owned: { acc_hopperoo: fuseCountFor("acc_hopperoo") } };
    expect(canFuse(s, "acc_hopperoo")).toBe(false);
  });

  it("still keeps unowned parts off sale until their reveal", () => {
    const s = fusedLab();
    expect(visibleCatalog(s).map((d) => d.id)).not.toContain("acc_wafer");
  });
});
