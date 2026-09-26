import { describe, it, expect } from "vitest";
import { createInitialState } from "../engine/state";
import { prestige } from "../engine/prestige";
import { launchDraft, maxActiveProducts } from "../engine/products";
import { toggleAutomation } from "../engine/automation";
import { Big } from "../engine/math/Big";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";
import { draftLaunchable, shipLeftModelToLaunch } from "./shipLanding";

/**
 * After a Ship, App toasts "Your shipped model is ready — commercialise it free in
 * Products" and, when the celebration closes, lands on Products. It did both whenever
 * any draft sat on the shelf: after a give-away ship (no draft deposited), with a full
 * portfolio (the draft is parked, every card reads "Slots full"), and with the Launch
 * Autopilot about to launch the model itself. These are the predicates App now reads.
 */

/** A generation-5 lab that can ship, holding `live` products. */
function lab(live: number): GameState {
  let s = createInitialState();
  s.prestige.ships = 5;
  s.stats.totalShips = 5;
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e9);
  s.products.drafts = Array.from({ length: live }, (_, i) => ({ id: `draft-old-${i}`, quality: 5, ships: 1 }));
  for (let i = 0; i < live; i++) s = launchDraft(s, { draftId: `draft-old-${i}`, type: "general", name: `P${i}`, id: `prod-${i + 1}` });
  return s;
}

describe("what a Ship may promise about Products", () => {
  it("Deploy with a free slot: the model is ready and the landing shows it", () => {
    const fresh = prestige(lab(1), "deploy");
    expect(shipLeftModelToLaunch(fresh)).toBe(true);
    expect(draftLaunchable(fresh)).toBe(true);
  });

  it("Deploy with a full portfolio: the draft is parked, so no call to launch it", () => {
    const s = lab(maxActiveProducts(createInitialState()));
    const fresh = prestige(s, "deploy");
    expect(fresh.products.drafts).toHaveLength(1); // parked, not lost
    expect(shipLeftModelToLaunch(fresh)).toBe(false);
    expect(draftLaunchable(fresh)).toBe(false);
  });

  it("a give-away ship deposits nothing: no 'model ready' toast, even with an old draft parked", () => {
    const s = { ...lab(1), products: { ...lab(1).products, drafts: [{ id: "draft-3", quality: 9, ships: 3 }] } };
    for (const mode of ["open_source", "sell"] as const) {
      const fresh = prestige(s, mode);
      expect(shipLeftModelToLaunch(fresh), mode).toBe(false);
      // The old draft is still launchable, so landing on Products still has a point.
      expect(draftLaunchable(fresh), mode).toBe(true);
    }
    const bare = prestige(lab(1), "open_source");
    expect(shipLeftModelToLaunch(bare)).toBe(false);
    expect(draftLaunchable(bare)).toBe(false);
  });

  it("with the Launch Autopilot on, the player is not told to launch what it launches", () => {
    const fresh = prestige(toggleAutomation(lab(1), "auto_launch"), "deploy");
    expect(draftLaunchable(fresh)).toBe(true); // until the next tick launches it
    expect(shipLeftModelToLaunch(fresh)).toBe(false);
  });
});
