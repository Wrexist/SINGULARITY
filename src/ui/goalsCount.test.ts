import { describe, it, expect } from "vitest";
import { goalsCounts, goalsClaimable } from "./goalsCount";
import { createInitialState } from "../engine/state";
import { contractBoard } from "../engine/contracts";
import { objectivesUnlocked, claimableObjectives } from "../engine/objectives";
import { Big } from "../engine/math/Big";

/**
 * The GOALS badge is the whole point of the destination: one honest answer to
 * "is anything waiting on me?", replacing seven boards in four places. The
 * 2026-08 audit recorded exactly how this goes wrong — a badge that is true too
 * often (the old always-affordable Reputation/Endowment advisor items) teaches
 * players that badges mean nothing everywhere. These pin that it stays honest.
 */
describe("GOALS badge counts", () => {
  it("is silent on a brand-new lab", () => {
    expect(goalsClaimable(createInitialState())).toBe(0);
  });

  it("counts a contract the moment it is actually ready", () => {
    const s = createInitialState();
    s.stats.peakComputePerSec = Big.of(1e6); // satisfies the early compute contracts
    const ready = contractBoard(s).filter((c) => c.ready).length;
    expect(ready).toBeGreaterThan(0);
    expect(goalsCounts(s).contracts).toBe(ready);
    expect(goalsClaimable(s)).toBeGreaterThanOrEqual(ready);
  });

  it("never counts a sponsor the contracts board would not render", () => {
    // ContractsPanel shows the sponsor ONLY once the contract board is clear. A
    // badge promising a row the player then cannot find is the worst kind.
    const s = createInitialState();
    s.sponsor = { id: "sponsor_1", title: "Test Sponsor", desc: "Do a thing", metric: "peakCompute", target: 1, rep: 6, claimed: false, day: 1 } as never;
    const board = contractBoard(s);
    if (board.length > 0) {
      const withoutSponsor = board.filter((c) => c.ready).length;
      expect(goalsCounts(s).contracts).toBe(withoutSponsor);
    }
  });

  it("agrees with the objectives board about what is claimable", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e9);
    s.lifetimeMoney = Big.of(1e9);
    if (objectivesUnlocked(s)) {
      expect(goalsCounts(s).objectives).toBe(claimableObjectives(s));
    }
  });

  it("does not light up for things that are merely fundable or affordable", () => {
    // Grand Challenge pours and Trials are open-ended sinks: counting them would
    // pin the badge on forever, which is the failure mode the audit documented.
    const s = createInitialState();
    s.prestige.ships = 40; // deep enough that challenges and trials are unlocked
    s.resources.compute = Big.of(1e30);
    s.resources.data = Big.of(1e30);
    s.resources.money = Big.of(1e30);
    const c = goalsCounts(s);
    // Nothing is CLAIMABLE here — no fork decision pending, no doctrine earned —
    // however rich the lab is.
    expect(c.forkPending).toBe(false);
    expect(c.long).toBe(0);
  });

  it("splits claimables across the horizon the player will find them on", () => {
    const s = createInitialState();
    s.stats.peakComputePerSec = Big.of(1e6);
    const c = goalsCounts(s);
    expect(c.claimable).toBe(c.now + c.long);
    expect(c.now).toBe(c.objectives + c.contracts);
  });

  it("reports collection tallies that match the save", () => {
    const s = createInitialState();
    s.achievements = ["compute_1k", "compute_1m"];
    s.products.milestones = ["first_launch"];
    const c = goalsCounts(s);
    expect(c.ach.earned).toBe(2);
    expect(c.ach.total).toBeGreaterThan(2);
    expect(c.ms.earned).toBe(1);
    expect(c.ms.total).toBeGreaterThan(1);
  });
});
