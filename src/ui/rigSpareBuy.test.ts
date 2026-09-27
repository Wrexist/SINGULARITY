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
import { buyComponent, canFuse, componentDef, fuseCountFor, freeCopies } from "../engine/components";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Fusion must be reachable in real play (round 9 review). Round 8 raised each rung's
 * fusion count (Refurb 5, Blower 7, Hopperoo 8, ...) so fusion stays a fair trade-in.
 * But the slot picker only ever bought a copy when none was free, and fitted it at once,
 * so a player could never hold more spares than the class has slots (3 accelerators):
 * the Fuse button never appeared for any part. The picker now offers "Buy a spare" on
 * a part whose fusion result the fleet has revealed, counting toward the rung's need.
 */

const REFURB = componentDef("acc_refurb")!;
const BLOWER = componentDef("acc_blower")!;

/** A 12-rack lab (the Blower is revealed) with Refurbs fitted on all three tiers. */
function fittedLab(): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 4, rack_server: 4, rack_tpu: 4 };
  s.resources = { ...s.resources, money: Big.of(1e7) };
  s.components = {
    owned: { acc_refurb: 3 },
    loadout: [{ accelerator: "acc_refurb" }, { accelerator: "acc_refurb" }, { accelerator: "acc_refurb" }],
  };
  return s;
}

const refurbRow = (s: GameState): string | undefined =>
  renderToStaticMarkup(createElement(RigBayPanel, { game: s, onBuy: () => {}, onEquip: () => {}, onFuse: () => {} }))
    .split('<div class="rig-row">')
    .slice(1) // the picker's part rows; the head above them names the fitted parts too
    .find((r) => r.includes(`rig-option-name"> ${REFURB.name} <em`));

describe("Rig Bay spares can be bought toward a fusion", () => {
  it("offers a spare with the rung's progress once the result is revealed", () => {
    const s = fittedLab();
    expect(freeCopies(s, REFURB.id)).toBe(0);
    const row = refurbRow(s);
    expect(row).toBeDefined();
    expect(row).toContain("Buy a spare");
    expect(row).toContain(`0/${fuseCountFor(REFURB.id)}`);
  });

  it("buying spares from the picker reaches the fusion", () => {
    let s = fittedLab();
    for (let i = 0; i < fuseCountFor(REFURB.id); i++) s = buyComponent(s, REFURB.id);
    expect(canFuse(s, REFURB.id)).toBe(true);
    const row = refurbRow(s)!;
    expect(row).toContain(`1× ${BLOWER.name}`);
    expect(row).not.toContain("Buy a spare");
  });

  it("offers no spare on a part the player doesn't own yet (its own button buys it)", () => {
    const s = fittedLab();
    const html = renderToStaticMarkup(createElement(RigBayPanel, { game: s, onBuy: () => {}, onEquip: () => {}, onFuse: () => {} }));
    const blowerRow = html.split('<div class="rig-row">').slice(1).find((r) => r.includes(`rig-option-name"> ${BLOWER.name} <em`));
    expect(blowerRow).toBeDefined();
    expect(blowerRow).not.toContain("Buy a spare");
  });

  it("offers no spare while the fusion result is still hidden", () => {
    const s = fittedLab();
    s.upgrades = { rack_basic: 2, rack_server: 1, rack_tpu: 1 }; // 4 racks: Blower reveals at 6
    expect(refurbRow(s) ?? "").not.toContain("Buy a spare");
  });
});
