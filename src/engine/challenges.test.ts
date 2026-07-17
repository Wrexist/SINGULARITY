import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import {
  fundChallenge, challengeMods, challengesUnlocked, visibleChallenges, canFundChallenge, challengeView,
  chooseFork, pendingForkChallenge,
  megaprojectUnlocked, megaprojectCost, megaprojectMult, fundMegaproject,
} from "./challenges";
import { challenges as C } from "./balance/challenges";
import { balance } from "./balance/config";
import { serialize, deserialize } from "./save";
import { prestige } from "./prestige";
import { derive } from "./derive";
import { Big } from "./math/Big";

const first = C.list[0]!; // fusion_dc

/** A deep-endgame state with enough banked resources to fund the first challenge outright. */
function rich(ships = 40) {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.resources.compute = Big.of(1e14);
  s.resources.data = Big.of(1e14);
  s.resources.money = Big.of(1e14);
  return s;
}

describe("Grand Challenges", () => {
  it("stays hidden until the reveal ship count, then reveals in staggered waves", () => {
    expect(challengesUnlocked(createInitialState())).toBe(false);
    expect(challengesUnlocked(rich(C.revealAtShips))).toBe(true);
    expect(visibleChallenges(rich(C.revealAtShips)).length).toBeLessThan(C.list.length);
    expect(visibleChallenges(rich(9999)).length).toBe(C.list.length);
  });

  it("funding spends resources, advances the bar, and completes when fully funded", () => {
    const s = rich();
    const before = s.resources.compute;
    const { state, justCompleted } = fundChallenge(s, first.id);
    expect(justCompleted).toBe(true); // rich state funds it in one dump
    expect(state.resources.compute.lt(before)).toBe(true);
    expect(state.challenges.completed).toContain(first.id);
    expect(challengeView(state, first.id)!.complete).toBe(true);
    expect(challengeView(state, first.id)!.progress).toBe(1);
  });

  it("justCompleted fires exactly once; a completed challenge is a no-op", () => {
    const a = fundChallenge(rich(), first.id);
    expect(a.justCompleted).toBe(true);
    const b = fundChallenge(a.state, first.id);
    expect(b.justCompleted).toBe(false);
    expect(b.state).toBe(a.state); // same reference — nothing changed
    expect(canFundChallenge(a.state, first.id)).toBe(false);
  });

  it("partial funding spends what it can without completing", () => {
    const s = createInitialState();
    s.prestige.ships = 40;
    s.resources.compute = Big.of(1e6); // far below the first challenge's costs
    s.resources.data = Big.of(1e6);
    s.resources.money = Big.of(1e6);
    const { state, justCompleted } = fundChallenge(s, first.id);
    expect(justCompleted).toBe(false);
    expect(state.challenges.completed).not.toContain(first.id);
    expect(state.resources.compute.eq(Big.ZERO)).toBe(true); // poured it all in
    expect(challengeView(state, first.id)!.funded.compute.eq(Big.of(1e6))).toBe(true);
  });

  it("a completed reward folds into derive; identity with none completed (curve-safe)", () => {
    const s = rich();
    const base = derive(s).computeMult;
    // fusion_dc is FORKED: completing it grants nothing until an arm is chosen…
    const done = fundChallenge(s, first.id).state;
    expect(derive(done).computeMult.eq(base)).toBe(true); // dormant, awaiting the choice
    // …then the picked arm's reward folds in (Grid Independence = +35% Compute).
    const picked = chooseFork(done, first.id, "grid_independence");
    expect(derive(picked).computeMult.gt(base)).toBe(true);
    const m = challengeMods(createInitialState());
    expect(m.compute.eq(Big.ONE) && m.data.eq(Big.ONE) && m.money.eq(Big.ONE)).toBe(true);
  });

  it("forks: a completed moonshot grants its CHOSEN arm; the choice is final; sanitizer guards it", () => {
    const s = rich();
    const done = fundChallenge(s, first.id).state; // fusion_dc, forked
    expect(pendingForkChallenge(done, first.id)).toBe(true);
    // Pick the money arm; the compute arm is no longer available (choice is final).
    const sold = chooseFork(done, first.id, "sell_surplus");
    expect(sold.challenges.forks[first.id]).toBe("sell_surplus");
    expect(pendingForkChallenge(sold, first.id)).toBe(false);
    expect(chooseFork(sold, first.id, "grid_independence")).toBe(sold); // no re-pick
    expect(challengeMods(sold).money.gt(Big.ONE)).toBe(true);
    expect(challengeMods(sold).compute.eq(Big.ONE)).toBe(true);
    // Round-trips; and a crafted fork for an UNCOMPLETED challenge is dropped.
    expect(deserialize(serialize(sold)).challenges.forks[first.id]).toBe("sell_surplus");
    const crafted = JSON.parse(serialize(createInitialState()));
    crafted.challenges = { funded: {}, completed: [], forks: { [first.id]: "sell_surplus" } };
    expect(deserialize(JSON.stringify(crafted)).challenges.forks[first.id]).toBeUndefined();
  });

  it("progress survives prestige and a save round-trip", () => {
    const s = rich();
    s.research = [balance.prestige.capabilityResearch]; // prestige-eligible
    const done = fundChallenge(s, first.id).state;
    expect(prestige(done, "deploy").challenges.completed).toContain(first.id);
    expect(deserialize(serialize(done)).challenges.completed).toContain(first.id);
  });

  it("anti-cheat: a completed id with no funding grants nothing", () => {
    const raw = JSON.parse(serialize(createInitialState()));
    raw.challenges = { funded: {}, completed: [first.id] };
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.challenges.completed).not.toContain(first.id);
    expect(challengeMods(loaded).compute.eq(Big.ONE)).toBe(true);
  });

  it("anti-cheat: funding is clamped to cost (over-funding all three = legitimately complete)", () => {
    const raw = JSON.parse(serialize(createInitialState()));
    raw.challenges = { funded: { [first.id]: { compute: "1e40", data: "1e40", money: "1e40" } }, completed: [] };
    const v = challengeView(deserialize(JSON.stringify(raw)), first.id)!;
    expect(v.funded.compute.lte(v.cost.compute)).toBe(true);
    expect(v.funded.compute.eq(v.cost.compute)).toBe(true); // clamped exactly to cost
    expect(v.complete).toBe(true); // paid the full price → complete is honest
  });
});

describe("Megaprojects II (repeatable post-challenge loop)", () => {
  /** A deep-endgame state with EVERY challenge complete and huge banked resources. */
  function allDone() {
    const s = rich(60);
    s.challenges = { funded: {}, completed: C.list.map((c) => c.id), forks: {} };
    s.resources = { compute: Big.of(1e16), data: Big.of(1e16), money: Big.of(1e16) };
    return s;
  }

  it("stays locked until EVERY challenge is complete; identity while locked (curve-safe)", () => {
    expect(megaprojectUnlocked(createInitialState())).toBe(false);
    expect(megaprojectMult(createInitialState()).eq(Big.ONE)).toBe(true);
    const oneShort = rich(60);
    oneShort.challenges = { funded: {}, completed: C.list.slice(0, -1).map((c) => c.id), forks: {} };
    expect(megaprojectUnlocked(oneShort)).toBe(false);
    expect(megaprojectUnlocked(allDone())).toBe(true);
  });

  it("funding a full cycle bumps the level, resets funding, and escalates the next cost", () => {
    const s = allDone();
    expect(s.megaprojects.level).toBe(0);
    const c0 = megaprojectCost(0);
    const { state, justCompleted } = fundMegaproject(s);
    expect(justCompleted).toBe(true);
    expect(state.megaprojects.level).toBe(1);
    expect(state.megaprojects.funded.compute.eq(Big.ZERO)).toBe(true); // reset for next cycle
    expect(megaprojectCost(1).compute.gt(c0.compute)).toBe(true); // next cycle costs more
  });

  it("the all-lane bonus is BOUNDED (converging geometric sum) and rides challengeMods", () => {
    const s = allDone();
    const lvl1 = fundMegaproject(s).state;
    expect(megaprojectMult(lvl1).gt(Big.ONE)).toBe(true);
    // challengeMods carries it into derive on every lane.
    expect(challengeMods(lvl1).compute.gte(megaprojectMult(lvl1))).toBe(true);
    // Even at an absurd level the bonus can't run away (bounded by baseMag/(1−decay)).
    const capped = { ...s, megaprojects: { ...s.megaprojects, level: 100000 } };
    expect(megaprojectMult(capped).lt(Big.of(2))).toBe(true); // 1 + 0.05/0.15 ≈ 1.33
  });

  it("persists across prestige and round-trips; a crafted save clamps level + funding", () => {
    let s = allDone();
    s.research = [balance.prestige.capabilityResearch];
    s = fundMegaproject(s).state; // level 1
    expect(prestige(s).megaprojects.level).toBe(1); // survives the ship
    expect(deserialize(serialize(s)).megaprojects.level).toBe(1);
    const crafted = JSON.parse(serialize(s));
    crafted.megaprojects = { level: -5, funded: { compute: "1e99", data: "1e99", money: "1e99" } };
    const fixed = deserialize(JSON.stringify(crafted));
    expect(fixed.megaprojects.level).toBe(0); // negative clamped
    expect(fixed.megaprojects.funded.compute.lte(megaprojectCost(0).compute)).toBe(true); // clamped to cost
  });
});
