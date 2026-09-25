import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { startTrial, canStartTrial, canQueueTrial, queueTrial, trialDefs, trialBonusProductSlots } from "./trials";
import { serialize, deserialize } from "./save";
import { buyResearch, buyResearchByHand } from "./actions";
import { chartersBalance, startWindowOpen } from "./charter";
import { declareStance } from "./doctrine";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { GameState } from "./types";

const U1 = trialDefs().find((d) => d.id === "trial_unplugged")!;
const U2 = trialDefs().find((d) => d.id === "trial_unplugged_r2")!;
const CAP = balance.prestige.capabilityResearch;
/** Every non-fork node except the capability one — "one node short of shipping". */
const ALL_BUT_CAP = balance.research.filter((r) => !r.exclusiveGroup && r.id !== CAP).map((r) => r.id);

function veteran(ships = U2.unlockShips): GameState {
  const s = createInitialState();
  s.prestige = { ships, legacyWeights: Big.of(1e6) };
  s.stats.totalShips = ships;
  s.lifetimeMoney = Big.of(1e12);
  return s;
}

describe("Trials start on a fresh run; mid-run they queue for the next (2026-09)", () => {
  it("closes the one-node-short exploit: no Trial can start once research exists", () => {
    const late = { ...veteran(), research: ALL_BUT_CAP };
    expect(canStartTrial(late, U1.id)).toBe(false);
    expect(startTrial(late, U1.id)).toBe(late);
    // …so buying the capability node and shipping banks nothing.
    const shipped = prestige({ ...late, research: [...ALL_BUT_CAP, CAP] }, "deploy");
    expect(shipped.trialsDone).not.toContain(U1.id);
    expect(trialBonusProductSlots(shipped)).toBe(0);
  });

  it("still starts at once on a fresh run", () => {
    const fresh = veteran();
    expect(canStartTrial(fresh, U1.id)).toBe(true);
    expect(startTrial(fresh, U1.id).activeTrial).toBe(U1.id);
  });

  it("queues mid-run, and the Ship starts it on the fresh lab", () => {
    const mid = { ...veteran(), research: ALL_BUT_CAP };
    expect(canQueueTrial(mid, U1.id)).toBe(true);
    const queued = queueTrial(mid, U1.id);
    expect(queued.queuedTrial).toBe(U1.id);
    expect(queued.activeTrial).toBeNull(); // nothing changes this run
    const shipped = prestige({ ...queued, research: [...ALL_BUT_CAP, CAP] }, "deploy");
    expect(shipped.activeTrial).toBe(U1.id);
    expect(shipped.queuedTrial).toBeNull();
    expect(shipped.research).toEqual([]);
    expect(shipped.trialsDone).not.toContain(U1.id); // it banks at the NEXT ship
  });

  it("a second tap clears the queue", () => {
    const q = queueTrial({ ...veteran(), research: ["backprop"] }, U1.id);
    expect(queueTrial(q, U1.id).queuedTrial).toBeNull();
    expect(queueTrial(q, null).queuedTrial).toBeNull();
  });

  it("chains a ladder: queue rung II while rung I runs, and the Ship banks I and starts II", () => {
    let s = startTrial(veteran(), U1.id);
    s = { ...s, research: ALL_BUT_CAP };
    expect(canQueueTrial(s, U2.id)).toBe(true);
    s = queueTrial(s, U2.id);
    const shipped = prestige({ ...s, research: [...ALL_BUT_CAP, CAP] }, "deploy");
    expect(shipped.trialsDone).toContain(U1.id);
    expect(shipped.activeTrial).toBe(U2.id);
  });

  it("drops a queue that can no longer start at the Ship (rung I failed to bank)", () => {
    // Rung II queued behind a running rung I whose condition… Unplugged has none,
    // so model the failure by abandoning rung I before the Ship.
    let s = startTrial(veteran(), U1.id);
    s = queueTrial({ ...s, research: ALL_BUT_CAP }, U2.id);
    s = { ...s, activeTrial: null };
    const shipped = prestige({ ...s, research: [...ALL_BUT_CAP, CAP] }, "deploy");
    expect(shipped.activeTrial).toBeNull();
    expect(shipped.queuedTrial).toBeNull();
  });

  it("refuses to queue a banked, locked or unknown Trial", () => {
    const s = { ...veteran(), research: ["backprop"] };
    expect(canQueueTrial({ ...s, trialsDone: [U1.id] }, U1.id)).toBe(false);
    expect(canQueueTrial({ ...s, prestige: { ...s.prestige, ships: U1.unlockShips - 1 } }, U1.id)).toBe(false);
    expect(canQueueTrial(s, "trial_nonsense")).toBe(false);
    expect(queueTrial(s, "trial_nonsense")).toBe(s);
  });

  it("persists the queue, filters a hostile one, and migrates v38 saves", () => {
    const q = queueTrial({ ...veteran(), research: ["backprop"] }, U1.id);
    expect(deserialize(serialize(q)).queuedTrial).toBe(U1.id);
    const raw = JSON.parse(serialize(q));
    raw.queuedTrial = "trial_fake";
    expect(deserialize(JSON.stringify(raw)).queuedTrial).toBeNull();
    const banked = JSON.parse(serialize({ ...q, trialsDone: [U1.id] }));
    expect(deserialize(JSON.stringify(banked)).queuedTrial).toBeNull();
    const old = JSON.parse(serialize(q));
    old.version = 38;
    delete old.queuedTrial;
    expect(deserialize(JSON.stringify(old)).queuedTrial).toBeNull();
  });
});

describe("safety ships need your own choices past the declared stance", () => {
  const readyShip = (alignment: number) => {
    const s = veteran(6);
    s.research = [...ALL_BUT_CAP, CAP];
    s.alignment = alignment;
    return s;
  };
  it("a bare Safety declaration (exactly −0.4) is not a safety ship", () => {
    const declared = declareStance(veteran(6), "doomer");
    expect(declared.alignment).toBe(-0.4);
    expect(prestige(readyShip(declared.alignment), "deploy").stats.safetyShips).toBe(0);
  });
  it("pushed further by faction choices, it is", () => {
    expect(prestige(readyShip(-0.7), "deploy").stats.safetyShips).toBe(1);
  });
});

describe("research bought by hand commits the run even inside the Director's grace", () => {
  function directorRun(): GameState {
    const s = createInitialState();
    s.prestige.ships = 8;
    s.stats.totalShips = 8;
    s.stats.playtimeSec = 5_000;
    s.reputation.perks = ["rep_compute1", "rep_autoresearch"];
    const shipped = prestige({ ...s, research: [CAP], lifetimeMoney: Big.of(1e12) }, "deploy");
    return { ...shipped, resources: { ...shipped.resources, compute: Big.of(1e9), data: Big.of(1e9) } };
  }
  it("a Director buy keeps the window open; a manual buy closes it", () => {
    const g = directorRun();
    expect(startWindowOpen(g)).toBe(true);
    const node = balance.research.find((r) => !r.requires?.length && !r.exclusiveGroup)!.id;
    const byDirector = buyResearch(g, node);
    expect(byDirector.research).toContain(node);
    expect(startWindowOpen(byDirector)).toBe(true); // the grace covers the Director
    const byHand = buyResearchByHand(g, node);
    expect(byHand.research).toContain(node);
    expect(startWindowOpen(byHand)).toBe(false);
    expect(byHand.charterLocked).toBe(true);
  });
  it("is plain buyResearch when the window is already closed or charters are locked away", () => {
    const g = { ...directorRun(), charterLocked: true };
    const node = balance.research.find((r) => !r.requires?.length && !r.exclusiveGroup)!.id;
    expect(buyResearchByHand(g, node)).toEqual(buyResearch(g, node));
    const fresh = createInitialState();
    expect(buyResearchByHand(fresh, node)).toBe(fresh); // unaffordable → same ref
    expect(chartersBalance.directorGraceSec).toBeGreaterThan(0);
  });
});
