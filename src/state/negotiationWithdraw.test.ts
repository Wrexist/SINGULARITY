import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { NEGOTIATION_ID } from "../engine/negotiation";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Chen's meeting card waits while a sheet is open. Lobbying (Heat panel) also buys
 * suspicion down by a quarter, so a lab at 60 suspicion could lobby to 45 while the card
 * waited — and the card still came up asking "Settle — pay the fine (−20% cash)" for a
 * case no longer open (reported in an earlier bug hunt; fixed r6). A card whose case closed is
 * withdrawn, and a pick on it charges nothing.
 */
const N = balance.regulator.negotiation;

function shadyLab(): GameState {
  const s = createInitialState();
  s.research = balance.research.slice(0, 12).map((r) => r.id);
  s.resources.money = Big.of(1e9);
  s.heat = 40;
  s.suspicion = 60;
  return s;
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.99); // no ambient events: only Chen
  useGame.setState({ game: shadyLab(), offline: null, notice: null, event: null, worldEvent: null, savingFor: null });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("a waiting Chen card whose case has closed", () => {
  it("is withdrawn once lobbying takes suspicion under the line", () => {
    useGame.getState().advance(100);
    expect(useGame.getState().worldEvent?.id).toBe(NEGOTIATION_ID);

    useGame.getState().doLobby();
    expect(useGame.getState().game.suspicion).toBeLessThan(N.at);

    useGame.getState().advance(100);
    expect(useGame.getState().worldEvent).toBeNull();
  });

  it("charges nothing when picked before the next tick", () => {
    useGame.getState().advance(100);
    useGame.getState().doLobby();
    const before = useGame.getState().game;
    useGame.getState().chooseWorldEvent(0); // Settle: −20% cash
    const after = useGame.getState();
    expect(after.worldEvent).toBeNull();
    expect(after.game.resources.money.eq(before.resources.money)).toBe(true);
    expect(after.game.suspicion).toBe(before.suspicion);
  });

  it("still stands while suspicion stays over the line", () => {
    useGame.getState().advance(100);
    useGame.getState().advance(100);
    expect(useGame.getState().worldEvent?.id).toBe(NEGOTIATION_ID);
    const cash = useGame.getState().game.resources.money;
    useGame.getState().chooseWorldEvent(0);
    expect(useGame.getState().game.resources.money.lt(cash)).toBe(true);
  });
});
