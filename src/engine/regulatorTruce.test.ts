import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { tick } from "./tick";
import { workProblem, isIncident } from "./actions";
import { applyNegotiationChoice, negotiationDue } from "./negotiation";
import { buildHallModel } from "../render/hallModel";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * The regulator truce (bug hunt: meta r1 #2, economy r1 #6).
 *
 * After any branch of Chen's negotiation a factor-1 "truce" marker holds him off
 * while the paperwork runs. Two bugs:
 *  - prestige() rebuilt `modifiers` from scratch, deleting the truce while suspicion
 *    (a long memory) carried over — so Chen was back on the FIRST tick of the fresh
 *    run, where "Settle: −20% cash" cost 20% of ~$0: a free −30 suspicion per ship.
 *  - the marker is tone "bad", so the hall drew it as a burning-rack incident and
 *    "Work the problem" shaved it — which only brought Chen back sooner.
 */

const N = balance.regulator.negotiation;
const FLOOR = N.shipTruceFloorSec;
const TRUCE = "regulator_truce";

/** A shady lab ready to ship, with Chen at the door. */
function shadyReadyToShip(): GameState {
  const s = createInitialState();
  s.prestige.ships = 5;
  s.stats.totalShips = 5;
  s.research = balance.research.map((r) => r.id);
  s.lifetimeMoney = Big.of(1e9);
  s.resources.money = Big.of(5e8);
  s.upgrades = { ...s.upgrades, rack_basic: 5 };
  s.suspicion = 60;
  return s;
}

const truceLeft = (s: GameState) => s.modifiers.find((m) => m.id === TRUCE)?.remainingSec ?? 0;

/** Seconds of play until Chen is due again (capped). */
function secondsUntilDue(g: GameState, cap = 600): number {
  let s = g;
  for (let t = 0; t < cap; t++) {
    if (negotiationDue(s)) return t;
    s = tick(s, 1000);
  }
  return cap;
}

describe("the regulator truce survives a ship", () => {
  it("Chen is not back on the first tick of the fresh run", () => {
    const defied = applyNegotiationChoice(shadyReadyToShip(), 2); // suspicion 68, 240 s truce
    expect(negotiationDue(defied)).toBe(false);
    const fresh = tick(prestige(defied, "deploy"), 100);
    expect(fresh.suspicion).toBeGreaterThanOrEqual(N.at); // the long memory carried…
    expect(negotiationDue(fresh)).toBe(false); // …and so did the paperwork
  });

  it("keeps the time the truce had left — shipping neither resets nor shortens Chen's clock", () => {
    const defied = applyNegotiationChoice(shadyReadyToShip(), 2);
    let s = defied;
    for (let t = 0; t < 30; t++) s = tick(s, 1000); // 30 s into the truce
    const left = truceLeft(s);
    expect(left).toBeGreaterThan(FLOOR);
    const fresh = prestige(s, "deploy");
    expect(truceLeft(fresh)).toBeCloseTo(left, 6);
    const due = secondsUntilDue(fresh);
    expect(due).toBeGreaterThanOrEqual(Math.floor(left));
    expect(due).toBeLessThanOrEqual(Math.ceil(left) + 1);
  });

  it("a truce about to expire still gives the new lab a floor before Chen returns", () => {
    const defied = applyNegotiationChoice(shadyReadyToShip(), 2);
    const nearlyOver = { ...defied, modifiers: defied.modifiers.map((m) => (m.id === TRUCE ? { ...m, remainingSec: 2 } : m)) };
    const fresh = prestige(nearlyOver, "deploy");
    expect(truceLeft(fresh)).toBe(FLOOR);
    expect(secondsUntilDue(fresh)).toBeGreaterThanOrEqual(FLOOR);
  });

  it("carries only the truce: other world-event effects still reset, momentum still applies", () => {
    const defied = applyNegotiationChoice(shadyReadyToShip(), 2); // + a compute rally buff
    expect(defied.modifiers.some((m) => m.id !== TRUCE)).toBe(true);
    const fresh = prestige(defied, "open_source");
    const ids = fresh.modifiers.map((m) => m.id);
    expect(ids).toContain(TRUCE);
    expect(ids.filter((id) => id.startsWith("momentum_"))).toHaveLength(3);
    expect(ids.some((id) => id.startsWith("regulator_negotiation"))).toBe(false);
  });

  it("a clean lab ships exactly as before (no truce, nothing carried)", () => {
    const clean = { ...shadyReadyToShip(), suspicion: 0 };
    expect(prestige(clean, "deploy").modifiers).toEqual([]);
  });
});

describe("the truce marker is a status, not an incident", () => {
  const settled = () => applyNegotiationChoice(shadyReadyToShip(), 0);
  it("is not an incident and cannot be 'worked' shorter", () => {
    const s = settled();
    const truce = s.modifiers.find((m) => m.id === TRUCE)!;
    expect(isIncident(truce)).toBe(false);
    expect(workProblem(s, TRUCE)).toBe(s); // same-ref no-op: Chen isn't hurried back
  });

  it("does not manifest as a burning rack in the hall", () => {
    const model = buildHallModel(settled());
    expect(model.racks.length).toBeGreaterThan(0); // there are racks it could have set alight
    expect(model.incidents.map((i) => i.id)).not.toContain(TRUCE);
  });

  it("a real setback is still workable", () => {
    const s = createInitialState();
    s.modifiers = [{ id: "gpu_shortage", target: "computeMult", factor: 0.6, remainingSec: 60, label: "GPU shortage", tone: "bad" }];
    expect(isIncident(s.modifiers[0]!)).toBe(true);
    expect(workProblem(s, "gpu_shortage")).not.toBe(s);
  });
});
