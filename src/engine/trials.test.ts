import { describe, it, expect } from "vitest";
import {
  trialsBalance, trialsUnlocked, canStartTrial, startTrial, abandonTrial, completeActiveTrial, trialMods,
  trialDefs, trialLadders, ladderRung, ladderProgress, TRIAL_IDS,
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
    expect(ratio).toBeCloseTo(ABLATION.handicap!.factor, 5); // ×0.5 Compute
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

  it("a condition Trial (Solo Run) banks only when its rule holds at ship; else clears free", () => {
    // Solo Run has no production handicap — the constraint is an empty roster at ship.
    // (Set activeTrial directly: we're testing COMPLETION, not the start gate.)
    const shippable = { ...buildingRun(6), research: [CAPABILITY], lifetimeMoney: Big.of(1e6) };
    // Ship WITH staff → condition fails → cleared, NOT banked.
    const failed = prestige({ ...shippable, activeTrial: "trial_solo", employees: [{ id: "e1" } as any] });
    expect(failed.activeTrial).toBeNull();
    expect(failed.trialsDone).not.toContain("trial_solo");
    // Ship with an EMPTY roster → banked.
    const banked = prestige({ ...shippable, activeTrial: "trial_solo", employees: [] });
    expect(banked.trialsDone).toContain("trial_solo");
  });

  it("Running Hot banks only when Heat ≥ 60 at ship (depth batch)", () => {
    const shippable = { ...buildingRun(13), research: [CAPABILITY], lifetimeMoney: Big.of(1e6) };
    const cool = prestige({ ...shippable, activeTrial: "trial_hot", heat: 59 });
    expect(cool.trialsDone).not.toContain("trial_hot");
    const hot = prestige({ ...shippable, activeTrial: "trial_hot", heat: 60 });
    expect(hot.trialsDone).toContain("trial_hot");
  });

  it("Apolitician banks only while alignment stayed inside the faction band (depth batch)", () => {
    const shippable = { ...buildingRun(15), research: [CAPABILITY], lifetimeMoney: Big.of(1e6) };
    const committed = prestige({ ...shippable, activeTrial: "trial_neutral", alignment: -0.5 });
    expect(committed.trialsDone).not.toContain("trial_neutral");
    const neutral = prestige({ ...shippable, activeTrial: "trial_neutral", alignment: -0.39 });
    expect(neutral.trialsDone).toContain("trial_neutral");
    const accelSide = prestige({ ...shippable, activeTrial: "trial_neutral", alignment: 0.41 });
    expect(accelSide.trialsDone).not.toContain("trial_neutral");
  });

  it("the new Trials are start-gated on their deeper unlocks and curve-safe when untouched", () => {
    const hotDef = trialsBalance.list.find((t) => t.id === "trial_hot")!;
    const neutralDef = trialsBalance.list.find((t) => t.id === "trial_neutral")!;
    expect(hotDef.unlockShips).toBeGreaterThan(trialsBalance.list.find((t) => t.id === "trial_overclock")!.unlockShips);
    expect(neutralDef.unlockShips).toBeGreaterThan(hotDef.unlockShips);
    // Fresh run → neither can be started, and mods stay identity.
    expect(canStartTrial(createInitialState(), "trial_hot")).toBe(false);
    expect(trialMods(createInitialState())).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
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

/**
 * Trial Ladders (2026-08 depth pass). Each handicap Trial is now rung I of a ladder;
 * the rungs above it tighten the same discipline for a larger permanent reward. Rungs
 * are ordinary Trial ids, so they ride the existing `trialsDone: string[]` with no new
 * save surface — these tests pin that, and pin the ordering rule that makes a ladder a
 * ladder rather than seven more cards.
 */
describe("Trial Ladders", () => {
  const veteran = (ships: number, done: string[] = []) => {
    const s = createInitialState();
    return { ...s, prestige: { ...s.prestige, ships }, trialsDone: done };
  };

  it("gives every base Trial a ladder of its own, rung I", () => {
    for (const d of trialDefs()) {
      if (d.rung !== 1) continue;
      expect(d.ladder).toBe(d.id);
      expect(d.requires).toBeUndefined();
    }
  });

  it("ladders only the handicap Trials — a condition cannot be made tighter", () => {
    for (const d of trialDefs()) {
      if (d.rung === 1) continue;
      const base = trialDefs().find((b) => b.id === d.ladder)!;
      expect(base.handicap).toBeDefined();
      expect(d.condition).toBeUndefined();
    }
  });

  it("escalates: each rung starves harder and pays more than the one below", () => {
    for (const ladder of trialLadders()) {
      const rungs = trialDefs().filter((d) => d.ladder === ladder).sort((a, b) => a.rung - b.rung);
      for (let i = 1; i < rungs.length; i++) {
        const prev = rungs[i - 1]!, cur = rungs[i]!;
        expect(cur.rung).toBe(prev.rung + 1);
        expect(cur.handicap!.factor).toBeLessThan(prev.handicap!.factor);
        expect(cur.reward.value).toBeGreaterThan(prev.reward.value);
        expect(cur.unlockShips).toBeGreaterThan(prev.unlockShips);
        expect(cur.requires).toBe(prev.id);
        // Same lanes as the rung below — a ladder is one discipline, tightened.
        expect(cur.handicap!.lane).toBe(prev.handicap!.lane);
        expect(cur.reward.lane).toBe(prev.reward.lane);
      }
    }
  });

  it("mints unique ids, so `trialsDone` needs no new persisted field", () => {
    const ids = trialDefs().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(TRIAL_IDS.has(id)).toBe(true);
  });

  it("derives rung copy from the numbers it actually applies", () => {
    for (const d of trialDefs()) {
      if (d.rung === 1) continue; // hand-written copy
      expect(d.desc).toContain(`${Math.round(d.handicap!.factor * 100)}%`);
      expect(d.desc).toContain(`+${Math.round(d.reward.value * 100)}%`);
    }
  });

  it("refuses a rung until the one below is banked, however many ships you have", () => {
    const r2 = trialDefs().find((d) => d.rung === 2)!;
    // Ships far past the requirement, but rung I unbanked.
    expect(canStartTrial(veteran(999), r2.id)).toBe(false);
    expect(startTrial(veteran(999), r2.id).activeTrial).toBeNull();
    // Bank rung I and it opens.
    expect(canStartTrial(veteran(999, [r2.requires!]), r2.id)).toBe(true);
  });

  it("still enforces the ships gate on a rung whose prerequisite IS banked", () => {
    const r2 = trialDefs().find((d) => d.rung === 2)!;
    expect(canStartTrial(veteran(r2.unlockShips - 1, [r2.requires!]), r2.id)).toBe(false);
    expect(canStartTrial(veteran(r2.unlockShips, [r2.requires!]), r2.id)).toBe(true);
  });

  it("offers one rung at a time, and nothing once a ladder is fully banked", () => {
    const ladder = trialLadders().find((l) => trialDefs().filter((d) => d.ladder === l).length > 1)!;
    const rungs = trialDefs().filter((d) => d.ladder === ladder).sort((a, b) => a.rung - b.rung);
    expect(ladderRung(veteran(999), ladder)?.id).toBe(rungs[0]!.id);
    expect(ladderRung(veteran(999, [rungs[0]!.id]), ladder)?.id).toBe(rungs[1]!.id);
    expect(ladderRung(veteran(999, rungs.map((r) => r.id)), ladder)).toBeNull();
  });

  it("reports ladder progress for the rung marker", () => {
    const ladder = trialLadders().find((l) => trialDefs().filter((d) => d.ladder === l).length > 1)!;
    const rungs = trialDefs().filter((d) => d.ladder === ladder);
    expect(ladderProgress(veteran(1), ladder)).toEqual({ done: 0, total: rungs.length });
    expect(ladderProgress(veteran(1, [rungs[0]!.id]), ladder)).toEqual({ done: 1, total: rungs.length });
  });

  it("banks a rung's reward through trialMods, stacking with the rung below", () => {
    const r2 = trialDefs().find((d) => d.rung === 2)!;
    const r1 = trialDefs().find((d) => d.id === r2.requires)!;
    const lane = `${r2.reward.lane}Mult` as "computeMult" | "dataMult" | "moneyMult";
    const both = trialMods(veteran(999, [r1.id, r2.id]));
    expect(both[lane]).toBeCloseTo((1 + r1.reward.value) * (1 + r2.reward.value), 9);
  });

  it("applies a rung's harder handicap while it runs", () => {
    const r2 = trialDefs().find((d) => d.rung === 2)!;
    const s = { ...veteran(999, [r2.requires!]), activeTrial: r2.id };
    const lane = `${r2.handicap!.lane}Mult` as "computeMult" | "dataMult" | "moneyMult";
    // The handicap and the banked rung-I reward are both in there; isolate as a ratio.
    const ratio = trialMods(s)[lane] / trialMods(veteran(999, [r2.requires!]))[lane];
    expect(ratio).toBeCloseTo(r2.handicap!.factor, 9);
  });

  it("round-trips a banked ladder through save/load with no version bump", () => {
    const r2 = trialDefs().find((d) => d.rung === 2)!;
    const s = veteran(30, [r2.requires!, r2.id]);
    const back = deserialize(serialize(s));
    expect(back.trialsDone).toEqual([r2.requires!, r2.id]);
    expect(trialMods(back)).toEqual(trialMods(s));
  });

  it("is curve-safe: a sim state banks nothing and every rung is identity", () => {
    const sim = createInitialState();
    expect(sim.trialsDone).toEqual([]);
    expect(sim.activeTrial).toBeNull();
    expect(trialMods(sim)).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
    // And no rung is even offerable without banking the rung below, which requires
    // opting into a Trial — something the deploy-only sim never does.
    for (const d of trialDefs()) {
      if (d.rung > 1) expect(canStartTrial({ ...sim, prestige: { ...sim.prestige, ships: 999 } }, d.id)).toBe(false);
    }
  });
});
