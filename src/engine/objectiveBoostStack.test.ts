import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { objectiveBoard, claimObjective } from "./objectives";
import { objectives as O, objectiveRewardOptions, type ObjectiveReward } from "./balance/objectives";
import { derive } from "./derive";
import { tick } from "./tick";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Objective boosts multiplied together (r4 bug hunt, journeys gens 3–8).
 *
 * Every Objective pays a short boost ("×2.5 Compute · 75s"), and every claim added its
 * own modifier, so claims that overlap MULTIPLIED. A player who let the board fill up
 * for a couple of generations (or who held claims on purpose) and then tapped through
 * the backlog — or switched on the Objective Autopilot, which claims three a tick —
 * stacked a dozen of them at once: ×2 × 2.2 × 2.5 × … ≈ ×10⁵ on a lane for a minute.
 * On a real generation-5 save that one burst took the next Ship from +87 Legacy Weights
 * to +108,000 — a permanent 1000× jump from a "temporary" reward. The browser run
 * shipped generations in 20 seconds.
 *
 * Now there is one Objective boost per lane, refreshed like every other re-granted buff:
 * a claim onto a lane that already runs one keeps the stronger factor and the longer
 * time left. A lone claim — and a claim after the lane's boost ran out — pays exactly
 * its card, and nothing ever shortens a boost that is running.
 */

/** A lab far enough along that a dozen-plus objectives are met at once. */
function backlog(): GameState {
  const s = createInitialState();
  s.prestige.ships = 5;
  s.stats.totalShips = 5;
  s.lifetimeMoney = Big.of(1e9);
  s.stats.totalMoney = Big.of(1e9);
  s.stats.peakComputePerSec = Big.of(1e7);
  s.stats.productsLaunched = 3;
  s.stats.employeesHired = 5;
  s.research = balance.research.slice(0, 8).map((r) => r.id);
  s.upgrades = { ...s.upgrades, rack_basic: 30 };
  s.resources.compute = Big.of(1e6);
  return s;
}

type Lane = ObjectiveReward["target"];
const LANES: Lane[] = ["computeMult", "dataMult", "moneyMult"];
const objMods = (s: GameState, lane: Lane) => s.modifiers.filter((m) => m.id.startsWith("obj_") && m.target === lane && m.remainingSec > 0);
const laneFactor = (s: GameState, lane: Lane) => objMods(s, lane).reduce((f, m) => f * m.factor, 1);
const laneSeconds = (s: GameState, lane: Lane) => objMods(s, lane).reduce((t, m) => Math.max(t, m.remainingSec), 0);
const STRONGEST = Math.max(...O.pool.map((o) => o.reward.factor));

/** Claim every met objective, as the board rotates, all in one go. Returns the claims. */
function claimBurst(s: GameState, lane?: Lane): { state: GameState; claimed: { target: Lane; durationSec: number }[] } {
  const claimed: { target: Lane; durationSec: number }[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const ready = objectiveBoard(s).filter((v) => v.ready);
    if (ready.length === 0) break;
    for (const v of ready) {
      // The steered lane when this card offers it, else the headline lane.
      const offered = objectiveRewardOptions(v.def.reward).some((o) => o.target === lane);
      const target = lane !== undefined && offered ? lane : v.def.reward.target;
      s = claimObjective(s, v.def.id, target);
      claimed.push({ target, durationSec: v.def.reward.durationSec });
    }
  }
  return { state: s, claimed };
}

describe("overlapping Objective boosts refresh instead of multiplying", () => {
  it("a burst of claims never lifts a lane past the strongest single reward", () => {
    const { state, claimed } = claimBurst(backlog());
    expect(claimed.length).toBeGreaterThanOrEqual(10); // the backlog is real
    for (const lane of LANES) expect(laneFactor(state, lane), lane).toBeLessThanOrEqual(STRONGEST + 1e-9);
    // …and what the economy actually applies agrees: the lane multiplier moves by at
    // most that one factor, not by the product of every claim.
    const base = derive(backlog());
    const boosted = derive(state);
    expect(boosted.computeMult.div(base.computeMult).toNumber()).toBeLessThanOrEqual(STRONGEST + 1e-9);
    expect(boosted.moneyMult.div(base.moneyMult).toNumber()).toBeLessThanOrEqual(STRONGEST + 1e-9);
  });

  it("a claim onto a boosted lane keeps the stronger factor and the longer time", () => {
    let s = backlog();
    const [a, b] = objectiveBoard(s).filter((v) => v.ready);
    // A lane both cards offer, so the second claim lands on the first one's boost.
    const lane = objectiveRewardOptions(a!.def.reward).map((o) => o.target)
      .find((t) => objectiveRewardOptions(b!.def.reward).some((o) => o.target === t))!;
    expect(lane).toBeDefined();
    s = claimObjective(s, a!.def.id, lane);
    s = tick(s, 20_000); // the first boost has run 20 s
    const left = laneSeconds(s, lane);
    expect(left).toBeCloseTo(a!.def.reward.durationSec - 20, 6);
    s = claimObjective(s, b!.def.id, lane);
    const mods = objMods(s, lane);
    expect(mods).toHaveLength(1); // one chip per lane
    expect(mods[0]!.factor).toBe(Math.max(a!.def.reward.factor, b!.def.reward.factor));
    expect(mods[0]!.remainingSec).toBeCloseTo(Math.max(left, b!.def.reward.durationSec), 6);
  });

  it("steering the whole burst onto one lane still yields one boost", () => {
    const { state } = claimBurst(backlog(), "computeMult");
    expect(laneFactor(state, "computeMult")).toBeLessThanOrEqual(STRONGEST + 1e-9);
    expect(objMods(state, "computeMult")).toHaveLength(1);
  });

  it("a claim onto a free lane, or after the last boost ran out, pays exactly its card", () => {
    let s = backlog();
    const first = objectiveBoard(s).find((v) => v.ready)!;
    s = claimObjective(s, first.def.id);
    const m = objMods(s, first.def.reward.target)[0]!;
    expect(m.factor).toBe(first.def.reward.factor);
    expect(m.remainingSec).toBe(first.def.reward.durationSec);
    // Let it expire, then claim the next one onto the same lane.
    s = tick(s, (first.def.reward.durationSec + 1) * 1000);
    expect(objMods(s, first.def.reward.target)).toHaveLength(0);
    const next = objectiveBoard(s).find((v) => v.ready)!;
    s = claimObjective(s, next.def.id);
    const n = objMods(s, next.def.reward.target)[0]!;
    expect(n.factor).toBe(next.def.reward.factor);
    expect(n.remainingSec).toBe(next.def.reward.durationSec);
  });
});
