import { describe, it, expect } from "vitest";
import { prestige, legacyWeightsForMode } from "./prestige";
import { earnedReputation } from "./reputation";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const SPLASH = balance.prestige.shipModes.splash;

function shippable() {
  const s = createInitialState();
  s.research = [balance.prestige.capabilityResearch]; // meets the prestige gate
  s.lifetimeMoney = Big.of(1e12); // large base so the 0.9× legacy cut is visible
  s.resources.money = Big.of(1e6);
  return s;
}

describe("Splash ship — keep the draft, ride a launch wave", () => {
  it("unlocks in the Hyperscaler band (ship 6), not before", () => {
    expect(SPLASH.unlockShips).toBe(6);
  });

  it("keeps the flagship as a commercialisable draft", () => {
    const sp = prestige(shippable(), "splash");
    expect(sp.products.drafts).toHaveLength(1);
  });

  it("leaves a temporary launch-week buff on the next run (all three lanes)", () => {
    const sp = prestige(shippable(), "splash");
    const mom = sp.modifiers.filter((m) => m.id.startsWith("momentum_"));
    expect(mom).toHaveLength(3);
    expect(mom.every((m) => m.factor === SPLASH.momentum!.factor && m.remainingSec === SPLASH.momentum!.durationSec)).toBe(true);
    expect(new Set(mom.map((m) => m.target))).toEqual(new Set(["computeMult", "dataMult", "moneyMult"]));
  });

  it("banks fewer Legacy Weights than a straight deploy (the cost of the wave)", () => {
    const s = shippable();
    expect(legacyWeightsForMode(s, "splash").lt(legacyWeightsForMode(s, "deploy"))).toBe(true);
  });

  it("grants no Reputation of its own (uses only generic levers — no new stat)", () => {
    const s = shippable();
    // Identical reputation to deploy: splash bumps totalShips like any ship but adds
    // no open-source/safety credit, so it needs no reputation plumbing or save surface.
    expect(earnedReputation(prestige(s, "splash"))).toBe(earnedReputation(prestige(s, "deploy")));
  });
});
