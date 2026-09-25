import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { applyWorldEventChoice } from "./actions";
import { applyNegotiationChoice } from "./negotiation";
import { committedSide, declareStance, doctrineBalance } from "./doctrine";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * Alignment is a sum of two-decimal shifts compared against a ±0.4 threshold (bug
 * hunt r2, events #3). In binary floating point 0.4 + 0.3 − 0.3 is
 * 0.39999999999999997, so a lab that declared Acceleration (alignment exactly 0.4)
 * and then took one accelerationist and one cautious pick of the same size — a net
 * move of zero — fell off its stance: the faction event pool closed, the Doctrine
 * perks locked, the stance chip read "Center" and a Safety ship lost its Reputation.
 */

/** A lab past the Doctrine reveal with a declared stance, research started. */
function declared(stance: "doomer" | "accel"): GameState {
  let s = createInitialState();
  s.prestige.ships = doctrineBalance.revealAtShips;
  s = declareStance(s, stance);
  return { ...s, research: ["backprop"] };
}

describe("alignment round trips land where they started", () => {
  it("Acceleration, then +0.3 and −0.3, is still Acceleration", () => {
    let s = declared("accel");
    s = applyWorldEventChoice(s, "faction_redteam", 1).state; // Ship and patch later: +0.3
    s = applyWorldEventChoice(s, "faction_redteam", 0).state; // Delay & fix it: −0.3
    expect(s.alignment).toBe(doctrineBalance.threshold);
    expect(committedSide(s)).toBe("accel");
  });

  it("Safety, then −0.3 and +0.3, is still Safety", () => {
    let s = declared("doomer");
    s = applyWorldEventChoice(s, "choice_safety_review", 0).state; // Slow down: −0.3
    s = applyWorldEventChoice(s, "choice_safety_review", 1).state; // Full speed ahead: +0.3
    expect(s.alignment).toBe(-doctrineBalance.threshold);
    expect(committedSide(s)).toBe("doomer");
  });

  it("a round trip lands back on the declared point — which alone is not a Safety ship", () => {
    // A bare Safety declaration (exactly −0.4) earns no safety-ship Rep: that bonus
    // is for choices that push PAST the stance (see prestige.ts). The round trip must
    // land exactly there, not a float hair either side of it.
    let s = declared("doomer");
    s = applyWorldEventChoice(s, "choice_eu_act", 0).state; // Comply fully: −0.3
    s = applyWorldEventChoice(s, "choice_eu_act", 1).state; // Move it offshore: +0.3
    expect(s.alignment).toBe(-0.4);
    const ready = (g: typeof s) => ({ ...g, research: [...g.research, balance.prestige.capabilityResearch], lifetimeMoney: Big.of(1e9) });
    expect(prestige(ready(s)).stats.safetyShips).toBe(s.stats.safetyShips);
    // One more cautious choice past the stance, and it is.
    const past = applyWorldEventChoice(s, "choice_eu_act", 0).state; // −0.3 → −0.7
    expect(prestige(ready(past)).stats.safetyShips).toBe(s.stats.safetyShips + 1);
  });

  it("the regulator's lobby and defy shifts round-trip too", () => {
    let s = declared("accel");
    s = { ...s, suspicion: 60 };
    s = applyWorldEventChoice(s, "choice_scaling_bet", 1).state; // Send it: +0.32
    s = applyWorldEventChoice(s, "choice_scaling_bet", 0).state; // Hold the line: −0.28
    s = applyNegotiationChoice(s, 1); // Lobby quietly: −0.15
    s = applyNegotiationChoice(s, 2); // Defy: +0.2
    s = applyWorldEventChoice(s, "choice_opensource", 1).state; // Keep it closed: −0.34
    s = applyWorldEventChoice(s, "choice_opensource", 0).state; // Open-source it: +0.34
    expect(s.alignment).toBe(0.49); // 0.4 + 0.32 − 0.28 − 0.15 + 0.2 − 0.34 + 0.34, no float dust
  });

  it("a save that already drifted gets its stance back on load", () => {
    const s = { ...declared("accel"), alignment: 0.39999999999999997 };
    expect(committedSide(s)).toBe(null); // the drifted value, as saved before the fix
    const loaded = deserialize(serialize(s));
    expect(loaded.alignment).toBe(0.4);
    expect(committedSide(loaded)).toBe("accel");
    // Still clamped, and ordinary values load untouched.
    expect(deserialize(serialize({ ...s, alignment: 7 })).alignment).toBe(1);
    expect(deserialize(serialize({ ...s, alignment: -0.25 })).alignment).toBe(-0.25);
  });
});
