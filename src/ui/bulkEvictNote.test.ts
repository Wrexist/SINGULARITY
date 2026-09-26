import { describe, it, expect, vi } from "vitest";

// The Build panel's only useState is the buy quantity (×1 / ×10 / Max). Hold it at the
// value under test so the server render shows what a ×10 tap would do.
const h = vi.hoisted(() => ({ qty: 10 as unknown }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: <T,>(_init: T) => [h.qty as T, () => {}] as const };
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UpgradePanel } from "./UpgradePanel";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { planBulkUpgrade, buyUpgradeBulk } from "../engine/actions";
import { hallCapacity, totalRacks } from "../engine/hall";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Bulk rack buys on a nearly full floor (bug hunt r3). A rack bought onto a full floor
 * replaces a lower-tier one in place. The Server Rack card only said so when the floor
 * was ALREADY full: with one free slot, a ×10 tap filled that slot and then quietly
 * replaced nine Consumer racks, while the card read "$… ×10" with no note, as if ten
 * racks were being added.
 */

/** One free slot, the rest Consumer racks, and money for plenty of Server racks. */
function oneSlotLeft(): GameState {
  const s = createInitialState();
  s.upgrades = { ...s.upgrades, rack_basic: hallCapacity(s) - 1 };
  s.resources = { ...s.resources, money: Big.of(1e9) };
  return s;
}

const render = (game: GameState) =>
  renderToStaticMarkup(createElement(UpgradePanel, { game, derived: derive(game), onBuy: () => {}, onFoundWing: () => {} }));

/** The card-note of the Server Rack card, or null. */
function serverNote(html: string): string | null {
  const card = html.split("<button").find((c) => c.includes("Server"));
  return card ? (/<span class="card-note">(.*?)<\/span>/.exec(card)?.[1] ?? null) : null;
}

describe("a ×10 rack batch that runs past the last free slot says what it replaces", () => {
  it("plans the evictions the batch will make", () => {
    const s = oneSlotLeft();
    const plan = planBulkUpgrade(s, "rack_server", 10);
    expect(plan.count).toBe(10);
    expect(plan.evicts).toBe(9);
    const after = buyUpgradeBulk(s, "rack_server", 10);
    expect(totalRacks(after)).toBe(totalRacks(s) + 1); // one slot added, nine replaced
    expect(after.upgrades.rack_basic).toBe(s.upgrades.rack_basic! - 9);
  });

  it("puts the count on the Server Rack card", () => {
    h.qty = 10;
    expect(serverNote(render(oneSlotLeft()))).toBe("↑ replaces 9 lower-tier racks");
  });

  it("stays quiet when the batch fits the free floor, and keeps the single-buy note", () => {
    h.qty = 10;
    const roomy = createInitialState();
    roomy.upgrades = { ...roomy.upgrades, rack_basic: 3 };
    roomy.resources = { ...roomy.resources, money: Big.of(1e9) };
    expect(planBulkUpgrade(roomy, "rack_server", 10).evicts).toBe(0);
    expect(serverNote(render(roomy))).toBeNull();
    h.qty = 1;
    const full = oneSlotLeft();
    full.upgrades = { ...full.upgrades, rack_basic: full.upgrades.rack_basic! + 1 };
    expect(serverNote(render(full))).toBe("↑ replaces a lower-tier rack");
  });
});
