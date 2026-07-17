import { describe, it, expect } from "vitest";
import {
  trialsBalance, trialsUnlocked, canStartTrial, startTrial, abandonTrial, completeActiveTrial, trialMods,
} from "./trials";
import { derive } from "./derive";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const ABLATION = trialsBalance.list.find((t) => t.id === "trial_ablation")!;
const CAPABILITY = balance.prestige.capabilityResearch;

/** A building run past the ablation unlock, NOT yet shippable, with some racks. */
function buildingRun(ships = ABLATION.unlockShips) {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.upgrades = { rack_basic: 20 };
  return s;
}

describe("prestige trials", () => {
  it("is fully identity through the tuned game (curve-safe)", () => {
    const fresh = createInitialState();
    expect(trialsUnlocked(fresh)).toBe(false);
    expect(trialMods(fresh)).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
    // derive is byte-identical with the trial fold present but nothing active/done.
    const a = derive(fresh);
    const b = derive({ ...createInitialState() });
    expect(a.computePerSec.toNumber()).toBe(b.computePerSec.toNumber());
    expect(a.dataPerSec.toNumber()).toBe(b.dataPerSec.toNumber());
  });

  it("gates starting: unlock ships, not-already-done, one-at-a-time, and NOT shippable", () => {
    expect(canStartTrial(buildingRun(0), "trial_ablation")).toBe(false); // ships < unlock
    const ok = buildingRun();
    expect(canStartTrial(ok, "trial_ablation")).toBe(true);
    expect(canStartTrial(ok, "not_a_trial")).toBe(false);
    // Can't commit once a deployable exists (anti-cheese: must endure a full run).
    const shippable = { ...ok, research: [CAPABILITY] };
    expect(canStartTrial(shippable, "trial_ablation")).toBe(false);
    // One at a time; and a finished trial can't be re-run.
    expect(canStartTrial({ ...ok, activeTrial: "trial_lean" }, "trial_ablation")).toBe(false);
    expect(canStartTrial({ ...ok, trialsDone: ["trial_ablation"] }, "trial_ablation")).toBe(false);
  });

  it("the active handicap bites: Ablation halves Compute for the run", () => {
    const base = buildingRun();
    const under = startTrial(base, "trial_ablation");
    expect(under.activeTrial).toBe("trial_ablation");
    const ratio = derive(under).computePerSec.div(derive(base).computePerSec).toNumber();
    expect(ratio).toBeCloseTo(ABLATION.handicap.factor, 5); // ×0.5 Compute
  });

  it("shipping COMPLETES the active trial: banks the permanent reward, drops the handicap", () => {
    let s = startTrial(buildingRun(), "trial_ablation");
    s.research = [CAPABILITY]; // now shippable
    s.lifetimeMoney = Big.of(1e6);
    const shipped = prestige(s);
    expect(shipped.activeTrial).toBeNull();            // handicap gone on the fresh run
    expect(shipped.trialsDone).toContain("trial_ablation");
    // The reward now compounds forever: +10% Compute vs an identical run without it.
    const withReward = derive({ ...shipped, upgrades: { rack_basic: 20 } });
    const without = derive({ ...shipped, trialsDone: [], upgrades: { rack_basic: 20 } });
    expect(withReward.computePerSec.div(without.computePerSec).toNumber())
      .toBeCloseTo(1 + ABLATION.reward.value, 5);
  });

  it("abandon clears the active trial with no reward; completion is idempotent", () => {
    const s = startTrial(buildingRun(), "trial_ablation");
    const bailed = abandonTrial(s);
    expect(bailed.activeTrial).toBeNull();
    expect(bailed.trialsDone).toEqual([]);
    // completeActiveTrial twice doesn't double-bank.
    const once = completeActiveTrial(s);
    expect(completeActiveTrial(once).trialsDone).toEqual(["trial_ablation"]);
  });

  it("round-trips and sanitizes hostile saves (unknown active → null, unknown done dropped)", () => {
    let s = startTrial(buildingRun(), "trial_ablation");
    expect(deserialize(serialize(s)).activeTrial).toBe("trial_ablation");
    const crafted = JSON.parse(serialize(s));
    crafted.activeTrial = "bogus";
    crafted.trialsDone = ["trial_lean", "bogus", "trial_lean"]; // unknown + dup
    const fixed = deserialize(JSON.stringify(crafted));
    expect(fixed.activeTrial).toBeNull();
    expect(fixed.trialsDone).toEqual(["trial_lean"]); // known, deduped
    // Migrates a pre-trials (v24) save to empty trial state.
    const old = JSON.parse(serialize(s));
    delete old.activeTrial; delete old.trialsDone; old.version = 24;
    const migrated = deserialize(JSON.stringify(old));
    expect(migrated.activeTrial).toBeNull();
    expect(migrated.trialsDone).toEqual([]);
  });
});
