import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { objectiveBoard, canClaimObjective } from "./objectives";
import { objectives as O } from "./balance/objectives";
import { prestige } from "./prestige";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * "Earn $X lifetime" objectives (bug hunt round 3). They read the RUN's earnings
 * (`lifetimeMoney`, the Legacy-Weights base that a Ship zeroes), so every Ship threw
 * the bar back to $0, and the deep rungs ($10B, $1T) asked for more money than a
 * shipping lab ever earns in one generation: they parked on the board for good and
 * took two of its three slots with them. The cards say "lifetime" — the all-time
 * figure the achievements and contracts with the same wording read.
 */
function onlyOnBoard(id: string): GameState {
  const s = createInitialState();
  s.objectives = { completed: O.pool.filter((o) => o.id !== id).map((o) => o.id) };
  return s;
}
const view = (s: GameState, id: string) => objectiveBoard(s).find((v) => v.def.id === id)!;

describe("'Earn $X lifetime' objectives measure all-time earnings", () => {
  it("keeps its progress through a Ship", () => {
    const s = onlyOnBoard("o_money4"); // Earn $1,000,000 lifetime
    s.research = [balance.prestige.capabilityResearch];
    s.lifetimeMoney = Big.of(900_000);
    s.stats.totalMoney = Big.of(900_000);
    expect(view(s, "o_money4").value).toBe(900_000);

    const next = prestige(s, "deploy");
    // The first $200K of the new generation (all-time earnings climb with it).
    next.lifetimeMoney = Big.of(200_000);
    next.stats.totalMoney = next.stats.totalMoney.add(200_000);

    expect(view(next, "o_money4").value).toBe(1_100_000);
    expect(view(next, "o_money4").ready).toBe(true);
    expect(canClaimObjective(next, "o_money4")).toBe(true);
  });

  it("the $1T rung is reachable by a veteran whose runs each earn far less", () => {
    const s = onlyOnBoard("o_money7"); // Earn $1,000,000,000,000 lifetime
    s.prestige.ships = 40;
    s.lifetimeMoney = Big.of(5e7); // one fast late-game generation
    s.stats.totalMoney = Big.of(2e12); // a career
    expect(view(s, "o_money7").ready).toBe(true);
  });

  it("a fresh lab still starts from its first dollar", () => {
    const s = createInitialState();
    s.lifetimeMoney = Big.of(150);
    s.stats.totalMoney = Big.of(150);
    expect(view(s, "o_run1").value).toBe(150);
    expect(view(s, "o_run1").ready).toBe(true); // Earn your first $100
  });
});
