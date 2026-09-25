import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { prestige, type ShipMode } from "./prestige";
import { tick } from "./tick";
import { grantDailyBoost, applyWorldEvent } from "./actions";
import { claimObjective, canClaimObjective } from "./objectives";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * A Ship used to delete every timed boost the player had CLAIMED (bug hunt r4,
 * journeys gens 3–8). prestige() rebuilt `modifiers` from the ship mode's momentum
 * and the regulator truce alone, so:
 *  - the Daily Boost ("+50% for 3 min", once a day) claimed and then followed by a Ship
 *    vanished with minutes left — the day's reward was simply gone, and the daily bar
 *    stays claimed until tomorrow;
 *  - an Objective's reward boost ("×2.5 Compute · 75s") went the same way.
 * Neither the Ship explainer nor the ship chooser lists boosts among what a Ship
 * resets. Both are claim-gated and temporary, and the balance sim never claims either,
 * so carrying them keeps the tuned curve byte-identical.
 */

/** A mid-game lab that can ship (the capability node is owned). */
function readyToShip(): GameState {
  const s = createInitialState();
  s.prestige.ships = 5;
  s.stats.totalShips = 5;
  s.research = balance.research.map((r) => r.id);
  s.lifetimeMoney = Big.of(1e9);
  s.stats.totalMoney = Big.of(1e9);
  s.resources.money = Big.of(5e8);
  s.upgrades = { ...s.upgrades, rack_basic: 5 };
  return s;
}

const left = (s: GameState, id: string) => s.modifiers.find((m) => m.id === id)?.remainingSec ?? 0;
const MODES = Object.keys(balance.prestige.shipModes) as ShipMode[];

describe("a Ship keeps the timed boosts the player claimed", () => {
  it("the Daily Boost carries into the fresh run with the time it had left", () => {
    let s = tick(grantDailyBoost(readyToShip()), 30_000); // claimed, then 30 s of play
    const had = left(s, "daily_computeMult");
    expect(had).toBeGreaterThan(100);
    for (const mode of MODES) {
      const fresh = prestige(s, mode);
      for (const lane of ["computeMult", "dataMult", "moneyMult"]) {
        expect(left(fresh, `daily_${lane}`), `${mode} ${lane}`).toBeCloseTo(had, 6);
      }
    }
    // ...and it keeps boosting the fresh lab until it runs out, like any buff.
    s = prestige(s, "deploy");
    const bare = { ...s, modifiers: s.modifiers.filter((m) => !m.id.startsWith("daily_")) };
    expect(tick(s, 1000).resources.compute.gt(tick(bare, 1000).resources.compute)).toBe(true);
  });

  it("an Objective's reward boost carries too", () => {
    const s = readyToShip();
    expect(canClaimObjective(s, "o_run1")).toBe(true);
    const claimed = claimObjective(s, "o_run1", "computeMult");
    const had = left(claimed, "obj_o_run1");
    expect(had).toBeGreaterThan(0);
    const fresh = prestige(claimed, "open_source");
    expect(left(fresh, "obj_o_run1")).toBeCloseTo(had, 6);
    // The claim itself stays recorded — nothing can be claimed twice.
    expect(fresh.objectives.completed).toContain("o_run1");
  });

  it("run-scoped news does not carry: a world event's timed effect ends with the run", () => {
    const def = balance.worldEvents.list.find((e) => !e.choices && e.effect && "durationSec" in e.effect);
    expect(def).toBeDefined();
    const s = applyWorldEvent(readyToShip(), def!.id).state;
    expect(left(s, def!.id)).toBeGreaterThan(0);
    expect(left(prestige(s, "deploy"), def!.id)).toBe(0);
  });

  it("a carried boost survives a save round-trip in the fresh run", () => {
    const fresh = prestige(grantDailyBoost(readyToShip()), "deploy");
    const loaded = deserialize(serialize(fresh));
    expect(left(loaded, "daily_moneyMult")).toBeCloseTo(left(fresh, "daily_moneyMult"), 6);
  });

  it("a lab with no claimed boost ships exactly as before", () => {
    const s = readyToShip();
    const fresh = prestige(s, "deploy");
    expect(fresh.modifiers).toEqual([]);
  });
});
