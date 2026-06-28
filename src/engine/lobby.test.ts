import { describe, it, expect } from "vitest";
import { lobby, canLobby, lobbyCost } from "./actions";
import { balance } from "./balance/config";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

function hot(heat: number, money: number) {
  const s = createInitialState();
  s.heat = heat;
  s.resources.money = Big.of(money);
  return s;
}

describe("lobbying (Money → cool Heat)", () => {
  it("cost rises with current Heat", () => {
    expect(lobbyCost(hot(50, 0))).toBeGreaterThan(lobbyCost(hot(10, 0)));
  });

  it("cuts Heat by the configured fraction and charges Money", () => {
    const s = hot(60, 1e6);
    const cost = lobbyCost(s);
    const after = lobby(s);
    expect(after.heat).toBeCloseTo(60 * (1 - balance.heat.lobby.reductionFraction), 5);
    expect(s.resources.money.sub(after.resources.money).toNumber()).toBe(cost);
  });

  it("is a no-op when cold or broke", () => {
    expect(canLobby(hot(0, 1e6))).toBe(false);      // cold → nothing to cool
    expect(lobby(hot(0, 1e6)).heat).toBe(0);
    const broke = hot(80, 10);
    expect(canLobby(broke)).toBe(false);            // can't afford
    expect(lobby(broke)).toBe(broke);               // pure no-op
  });
});
