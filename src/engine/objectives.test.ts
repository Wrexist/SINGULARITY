import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { objectiveBoard, claimObjective, canClaimObjective, objectivesUnlocked, claimableObjectives } from "./objectives";
import { objectives as O, objectiveRewardOptions, nextLane } from "./balance/objectives";
import { serialize, deserialize } from "./save";
import { prestige } from "./prestige";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

/** A state just past the reveal gate — $1,000 lifetime also meets the first objective. */
function started() {
  const s = createInitialState();
  s.lifetimeMoney = Big.of(1000);
  return s;
}

describe("Lab Objectives", () => {
  it("hidden until the player earns, then shows the first few uncompleted", () => {
    expect(objectivesUnlocked(createInitialState())).toBe(false); // lifetimeMoney 0
    const s = started();
    expect(objectivesUnlocked(s)).toBe(true);
    expect(objectiveBoard(s).length).toBe(O.slots);
    expect(objectiveBoard(s)[0]!.def.id).toBe(O.pool[0]!.id);
  });

  it("an unmet objective can't be claimed; a met one on the board can", () => {
    const s = started(); // $1,000 lifetime → "Earn your first $100" is met
    expect(objectiveBoard(s)[0]!.ready).toBe(true);
    expect(canClaimObjective(s, O.pool[0]!.id)).toBe(true);
    expect(canClaimObjective(s, O.pool[20]!.id)).toBe(false); // far down the pool, not on the board
    expect(claimableObjectives(s)).toBeGreaterThanOrEqual(1);
  });

  it("claiming applies a temp boost, records completion, and rotates the board", () => {
    const s = started();
    const id = O.pool[0]!.id;
    const after = claimObjective(s, id);
    expect(after.objectives.completed).toContain(id);
    expect(after.modifiers.some((m) => m.id === `obj_${id}` && m.target === O.pool[0]!.reward.target)).toBe(true);
    expect(claimObjective(after, id)).toBe(after); // already claimed → same-ref no-op
    expect(objectiveBoard(after)[0]!.def.id).not.toBe(id); // next pool entry rotated in
  });

  it("offers two lanes of equal strength — the pick is placement, not power (curve-safe)", () => {
    const r = O.pool[0]!.reward;
    const opts = objectiveRewardOptions(r);
    expect(opts.length).toBe(2);
    expect(opts[0]!.target).toBe(r.target); // headline lane first
    expect(opts[1]!.target).toBe(nextLane(r.target)); // then the next lane in the cycle
    expect(opts[0]!.target).not.toBe(opts[1]!.target);
    // Identical factor + duration on both → choosing a lane can't inflate the reward.
    for (const o of opts) { expect(o.factor).toBe(r.factor); expect(o.durationSec).toBe(r.durationSec); }
  });

  it("claim steers the boost to the chosen lane; an unoffered lane falls back to the headline", () => {
    const s = started();
    const id = O.pool[0]!.id;
    const headline = O.pool[0]!.reward.target;
    const alt = nextLane(headline);
    // Picking the offered alternate lane lands the boost there.
    expect(claimObjective(s, id, alt).modifiers.some((m) => m.id === `obj_${id}` && m.target === alt)).toBe(true);
    // A lane the card never offered (the third one, or any tampered value) → headline lane.
    const offered = objectiveRewardOptions(O.pool[0]!.reward).map((o) => o.target);
    const unoffered = (["computeMult", "dataMult", "moneyMult"] as const).find((l) => !offered.includes(l))!;
    const mod = claimObjective(s, id, unoffered).modifiers.find((m) => m.id === `obj_${id}`)!;
    expect(mod.target).toBe(headline);
  });

  it("progress persists across prestige and a save round-trip", () => {
    const s = started();
    s.research = [balance.prestige.capabilityResearch]; // prestige-eligible
    const after = claimObjective(s, O.pool[0]!.id);
    expect(prestige(after, "deploy").objectives.completed).toContain(O.pool[0]!.id);
    expect(deserialize(serialize(after)).objectives.completed).toContain(O.pool[0]!.id);
  });

  it("sanitizer drops unknown and duplicate claimed ids", () => {
    const raw = JSON.parse(serialize(started()));
    raw.objectives = { completed: ["o_run1", "bogus_id", "o_run1"] };
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.objectives.completed).toContain("o_run1");
    expect(loaded.objectives.completed).not.toContain("bogus_id");
    expect(loaded.objectives.completed.filter((x) => x === "o_run1").length).toBe(1);
  });
});
