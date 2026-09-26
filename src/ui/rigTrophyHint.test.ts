import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";

// Open the slot picker for the Consumer tier's accelerator (the panel's only useState),
// and render the picker inline: server rendering has no document.body to portal into.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: <T,>(_init: T) => [{ tier: 0, slot: "accelerator" } as T, () => {}] as const };
});
vi.mock("./Portal", () => ({ Portal: ({ children }: { children: ReactNode }) => children }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RigBayPanel } from "./RigBayPanel";
import { createInitialState } from "../engine/state";
import { earnedDefs, earnedSourceComplete, grantEarnedComponents } from "../engine/components";
import { claimContract, contractsBalance } from "../engine/contracts";
import type { GameState } from "../engine/types";

/**
 * The Rig Bay's locked trophy rows say how to earn the part (r4 bug hunt, journeys gens
 * 3–8). The Founders' Edition Card read "Trophy hardware — Ship your first model. EARN
 * IT" on a lab that had shipped five models: the part is paid by CLAIMING the "Ship It"
 * contract, which sits further down the Contracts ladder than the first three rungs, so
 * a player who had not been claiming contracts was told to do something they had done
 * five times over. A contract-earned trophy now names the contract to claim.
 */

/** Generation 5, racks on the floor, not a single contract claimed. */
function unclaimedLab(): GameState {
  const s = createInitialState();
  s.prestige.ships = 5;
  s.stats.totalShips = 5;
  s.upgrades = { ...s.upgrades, rack_basic: 12 };
  return s;
}

const render = (game: GameState) =>
  renderToStaticMarkup(createElement(RigBayPanel, { game, onBuy: () => {}, onEquip: () => {}, onFuse: () => {} }))
    .replace(/&quot;/g, '"');

describe("a locked trophy says how it is earned", () => {
  it("the Founders' Edition row names the contract to claim, not a goal already met", () => {
    const html = render(unclaimedLab());
    expect(html).toContain("Founders");
    expect(html).toContain('Claim the "Ship It" contract');
    expect(html).not.toContain("Trophy hardware — Ship your first model.");
  });

  it("every contract-earned trophy names its contract; claiming it unlocks the part", () => {
    for (const def of earnedDefs().filter((d) => d.earnedBy!.kind === "contract")) {
      const title = contractsBalance.pool.find((c) => c.id === def.earnedBy!.id)?.title;
      expect(title, def.id).toBeDefined();
    }
    // Ship It is the ladder's fifth rung: claim the four before it, then it.
    let s = unclaimedLab();
    s.stats.peakComputePerSec = s.stats.peakComputePerSec.add(1e3);
    s.stats.totalMoney = s.stats.totalMoney.add(1e6);
    s.research = ["backprop"];
    for (const c of contractsBalance.pool) {
      if (c.id === "ship_it") break;
      s = { ...s, contracts: { completed: [...s.contracts.completed, c.id] } };
    }
    s = claimContract(s, "ship_it");
    const founders = earnedDefs().find((d) => d.id === "trophy_founders")!;
    expect(earnedSourceComplete(s, founders)).toBe(true);
    expect(grantEarnedComponents(s).components.owned.trophy_founders).toBe(1);
  });
});
