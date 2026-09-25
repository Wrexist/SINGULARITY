import { describe, it, expect } from "vitest";
import { applyWorldEvent, applyWorldEventChoice, isIncident, workProblem } from "./actions";
import { createInitialState } from "./state";
import { buildHallModel } from "../render/hallModel";
import { balance } from "./balance/config";
import type { WorldEvent } from "./balance/config";

/**
 * A faction choice that pays a BUFF must read as a buff (bug hunt r2, events #1).
 *
 * Several decision cards carry the event's "bad" tone — "Safety Team Demands a
 * Slowdown", "Red Team Finds Something", "The AI Act Lands", "A Whistleblower
 * Approaches", "The Eval Trips the Emergency Brake" — and the modifier a choice
 * minted inherited that tone. So "Full speed ahead (Compute ×1.8)" landed as a
 * burning-rack incident: the hall smoked, the modifier bar offered a "Setback"
 * chip, and tapping it ("work the problem") cut 12 s off the player's own buff.
 */

const EVENTS = balance.worldEvents.list as WorldEvent[];

describe("faction choice buffs are buffs", () => {
  it("a ×1.8 Compute pick on a 'bad' card is a good modifier, not an incident", () => {
    const s = createInitialState();
    const { state } = applyWorldEventChoice(s, "choice_safety_review", 1); // Full speed ahead
    const m = state.modifiers.find((x) => x.id === "choice_safety_review")!;
    expect(m.factor).toBeGreaterThan(1);
    expect(m.tone).toBe("good");
    expect(isIncident(m)).toBe(false);
  });

  it("working the problem never shortens a buff", () => {
    const s = createInitialState();
    const { state } = applyWorldEventChoice(s, "choice_emergency_brake", 1); // Override it (Compute ×2)
    expect(workProblem(state, "choice_emergency_brake")).toBe(state);
  });

  it("the hall never smokes over a buff", () => {
    const s = createInitialState();
    s.upgrades = { rack_basic: 6 };
    const { state } = applyWorldEventChoice(s, "faction_redteam", 1); // Ship and patch later (Compute ×1.8)
    expect(buildHallModel(state).incidents).toEqual([]);
  });

  it("every buff choice in the pool lands as good and every debuff as bad", () => {
    for (const e of EVENTS) {
      (e.choices ?? []).forEach((c, i) => {
        if (c.effect.kind !== "buff") return;
        const { state } = applyWorldEventChoice(createInitialState(), e.id, i);
        const m = state.modifiers.find((x) => x.id === e.id)!;
        expect(m.tone, `${e.id} #${i}`).toBe(c.effect.factor < 1 ? "bad" : "good");
      });
    }
  });

  it("a plain setback event is still an incident the player can work", () => {
    const { state } = applyWorldEvent(createInitialState(), "gpu_shortage"); // Compute ×0.6
    const m = state.modifiers[0]!;
    expect(m.tone).toBe("bad");
    expect(isIncident(m)).toBe(true);
    expect(workProblem(state, "gpu_shortage").modifiers[0]!.remainingSec).toBe(
      m.remainingSec - balance.worldEvents.workShaveSec,
    );
  });

  it("a buff saved with the old 'bad' tone is not workable after the update", () => {
    const s = createInitialState();
    s.modifiers = [{ id: "choice_eu_act", target: "computeMult", factor: 1.7, remainingSec: 30, label: "Compute ×1.7", tone: "bad" }];
    expect(isIncident(s.modifiers[0]!)).toBe(false);
    expect(workProblem(s, "choice_eu_act")).toBe(s);
  });
});
