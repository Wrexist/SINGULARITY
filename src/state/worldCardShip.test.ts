import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { prestige } from "../engine/prestige";
import { tick } from "../engine/tick";
import { negotiationDue, NEGOTIATION_ID } from "../engine/negotiation";
import { applyWorldEvent } from "../engine/actions";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * A world-event decision card is about the lab that drew it. It waits while a sheet is
 * open — and the give-away Ship's confirm IS a sheet — so a card raised in the seconds
 * that confirm was up rode over the Ship and was answered on the fresh $0 lab.
 *
 * For Chen's meeting that reopened the hole the truce carry closed: "Settle: pay the fine
 * (−20% cash)" cost 20% of ~$0 for −30 suspicion. The card must not cross the Ship, and a
 * lab that ships with Chen at the door gets the same floor of grace as one that ships
 * mid-truce, so he does not walk straight back in on the fresh run's first tick either.
 */
const N = balance.regulator.negotiation;

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

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.99); // no ambient events: only Chen
  useGame.setState({ game: shadyReadyToShip(), offline: null, notice: null, event: null, worldEvent: null, savingFor: null });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("a pending decision card does not cross a Ship", () => {
  it("Chen's meeting raised behind the Ship confirm is not answered on the fresh $0 lab", () => {
    useGame.getState().advance(100);
    expect(useGame.getState().worldEvent?.id).toBe(NEGOTIATION_ID);

    useGame.getState().doPrestige("open_source");
    const shipped = useGame.getState();
    expect(shipped.game.prestige.ships).toBe(6);
    expect(shipped.worldEvent).toBeNull();

    // Nor is he back at the door a tick later with the till empty.
    for (let i = 0; i < 10; i++) useGame.getState().advance(100);
    expect(useGame.getState().worldEvent).toBeNull();
    expect(useGame.getState().game.suspicion).toBeGreaterThanOrEqual(N.at); // the memory carried
  });

  it("an ambient decision drawn by the old lab is dropped at the Ship", () => {
    const decision = balance.worldEvents.list.find((e) => (e.choices?.length ?? 0) > 0)!;
    const { event } = applyWorldEvent(useGame.getState().game, decision.id);
    useGame.setState({ game: { ...useGame.getState().game, suspicion: 0 }, worldEvent: { key: 999, ...event } });
    useGame.getState().doPrestige("deploy");
    expect(useGame.getState().worldEvent).toBeNull();
  });
});

describe("shipping with Chen at the door carries the truce floor", () => {
  it("the fresh lab gets the same grace as a lab that shipped mid-truce", () => {
    const due = shadyReadyToShip();
    expect(negotiationDue(due)).toBe(true);
    const fresh = prestige(due, "deploy");
    const truce = fresh.modifiers.find((m) => m.id === "regulator_truce");
    expect(truce?.remainingSec).toBe(N.shipTruceFloorSec);
    expect(truce?.factor).toBe(1);
    let s = fresh;
    for (let t = 0; t < N.shipTruceFloorSec - 1; t++) { expect(negotiationDue(s)).toBe(false); s = tick(s, 1000); }
  });

  it("a clean lab still ships with nothing carried", () => {
    expect(prestige({ ...shadyReadyToShip(), suspicion: 0 }, "deploy").modifiers).toEqual([]);
    expect(prestige({ ...shadyReadyToShip(), suspicion: N.at - 1 }, "deploy").modifiers).toEqual([]);
  });
});
