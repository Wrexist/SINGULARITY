import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

// Open the slot picker for the SERVER tier's accelerator (the panel's only useState),
// and render it inline: server rendering has no document.body to portal into.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: <T,>(_init: T) => [{ tier: 1, slot: "accelerator" } as T, () => {}] as const };
});
vi.mock("./Portal", () => ({ Portal: ({ children }: { children: ReactNode }) => children }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RigBayPanel } from "./RigBayPanel";
import { createInitialState } from "../engine/state";
import { buyComponent, equipComponent, fuseComponents, grantEarnedComponents, componentDef, freeCopies } from "../engine/components";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The slot picker's price on a part it cannot sell you (bug hunt r4, guard parity).
 * Every player earns the Founders' Edition Card at the first Ship, and it fits one rack
 * tier at a time. Fitted on the consumer racks, it sat in the server tier's picker as a
 * greyed-out "$0" — a free part you can't take — while the real block was that your one
 * copy is in use. A part fused ahead of its catalog reveal read the same way: an ASIC on
 * a 10-rack lab showed "$70,000" greyed out to a player holding millions. Neither can be
 * bought at any price, so neither may be quoted one.
 */

const render = (game: GameState) =>
  renderToStaticMarkup(createElement(RigBayPanel, { game, onBuy: () => {}, onEquip: () => {}, onFuse: () => {} }));

/** The picker row for a part: its whole markup and the action text on its button. */
function row(html: string, name: string): { go: string; disabled: boolean } | null {
  // The picker's rows only (the bay above it names fitted parts too); markup escapes "'".
  const r = html.split('<div class="rig-row">').slice(1).find((x) => x.includes(name.replace(/'/g, "&#x27;")));
  if (!r) return null;
  const btn = /<button class="rig-option[^"]*"([^>]*)>/.exec(r);
  const go = /<span class="rig-option-go[^"]*">([^<]*)</.exec(r);
  return { go: go?.[1] ?? "", disabled: !!btn && /disabled/.test(btn[1]!) };
}

function lab(): GameState {
  const s = createInitialState();
  s.prestige.ships = 1;
  s.upgrades = { rack_basic: 4, rack_server: 3 };
  s.resources = { ...s.resources, money: Big.of(1e7) };
  return s;
}

describe("a part fitted elsewhere is not priced in another tier's picker", () => {
  it("the Founders' Edition Card, fitted on the consumer racks", () => {
    let s: GameState = { ...lab(), contracts: { completed: ["ship_it"] } };
    s = grantEarnedComponents(s);
    s = equipComponent(s, 0, "accelerator", "trophy_founders");
    expect(freeCopies(s, "trophy_founders")).toBe(0);
    const r = row(render(s), componentDef("trophy_founders")!.name);
    expect(r).not.toBeNull();
    expect(r!.disabled).toBe(true);
    expect(r!.go).not.toMatch(/\$/);
    expect(r!.go).toMatch(/in use/i);
  });

  it("an ASIC fused before the fleet stocks it", () => {
    let s = lab();
    s.upgrades = { rack_basic: 4, rack_server: 3, rack_tpu: 3 };
    for (const tier of [0, 1, 2]) s = equipComponent(buyComponent(s, "acc_hopperoo"), tier, "accelerator", "acc_hopperoo");
    for (const tier of [0, 1, 2]) s = equipComponent(s, tier, "accelerator", null);
    s = fuseComponents(s, "acc_hopperoo");
    s = equipComponent(s, 0, "accelerator", "acc_asic");
    expect(freeCopies(s, "acc_asic")).toBe(0);
    const r = row(render(s), componentDef("acc_asic")!.name);
    expect(r).not.toBeNull();
    expect(r!.disabled).toBe(true);
    expect(r!.go).not.toMatch(/\$/);
    expect(r!.go).toMatch(/in use/i);
  });

  it("still quotes the price of a part on sale that you can't afford yet", () => {
    let s = lab();
    s = equipComponent(buyComponent(s, "acc_refurb"), 0, "accelerator", "acc_refurb");
    s = { ...s, resources: { ...s.resources, money: Big.ZERO } };
    const r = row(render(s), componentDef("acc_refurb")!.name);
    expect(r).not.toBeNull();
    expect(r!.disabled).toBe(true);
    expect(r!.go).toMatch(/\$/);
  });
});
