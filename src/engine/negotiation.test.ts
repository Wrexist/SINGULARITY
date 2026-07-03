import { describe, it, expect } from "vitest";
import { negotiationDue, negotiationOffer, applyNegotiationChoice, NEGOTIATION_ID } from "./negotiation";
import { balance } from "./balance/config";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

const N = balance.regulator.negotiation;

function hotLab(suspicion = N.at + 5) {
  const s = createInitialState();
  s.suspicion = suspicion;
  s.resources.money = Big.of(10_000);
  return s;
}

describe("regulator negotiation (deterministic choice card)", () => {
  it("is due only past the suspicion line, and never for a clean lab", () => {
    expect(negotiationDue(createInitialState())).toBe(false); // sim-safety: clean = never
    expect(negotiationDue(hotLab(N.at - 1))).toBe(false);
    expect(negotiationDue(hotLab())).toBe(true);
  });

  it("settling pays the fine and drops suspicion below the line (no instant refire)", () => {
    const s = hotLab();
    const next = applyNegotiationChoice(s, 0);
    expect(next.resources.money.toNumber()).toBeCloseTo(10_000 * (1 + N.settle.moneyPct), 5);
    expect(next.suspicion).toBe(s.suspicion + N.settle.suspicion);
    expect(negotiationDue(next)).toBe(false);
  });

  it("lobbying is cheaper, eases heat and tilts doomer", () => {
    const s = hotLab();
    s.heat = 40;
    const next = applyNegotiationChoice(s, 1);
    expect(next.resources.money.toNumber()).toBeCloseTo(10_000 * (1 + N.lobby.moneyPct), 5);
    expect(next.heat).toBe(40 + N.lobby.heat);
    expect(next.alignment).toBeCloseTo(N.lobby.alignment);
  });

  it("defiance keeps the money, buffs compute, escalates — and the truce gates a refire", () => {
    const s = hotLab();
    const next = applyNegotiationChoice(s, 2);
    expect(next.resources.money.eq(s.resources.money)).toBe(true);
    expect(next.suspicion).toBe(s.suspicion + N.defy.suspicion);
    expect(next.heat).toBe(N.defy.heat);
    expect(next.modifiers.some((m) => m.factor === N.defy.buffFactor && m.target === "computeMult")).toBe(true);
    // Suspicion is still over the line, but the truce marker holds Chen off…
    expect(negotiationDue(next)).toBe(false);
    // …until the paperwork clears, then the meeting happens again.
    const after = { ...next, modifiers: next.modifiers.filter((m) => m.id !== "regulator_truce") };
    expect(negotiationDue(after)).toBe(true);
  });

  it("truce markers are identity modifiers (factor 1) — the bar shows them, derive ignores them", () => {
    const next = applyNegotiationChoice(hotLab(), 0);
    const truce = next.modifiers.find((m) => m.id === "regulator_truce")!;
    expect(truce.factor).toBe(1);
  });

  it("offer card is choice-only (no dismiss path) and unknown choices no-op", () => {
    const s = hotLab();
    const offer = negotiationOffer(s);
    expect(offer.id).toBe(NEGOTIATION_ID);
    expect(offer.choices).toHaveLength(3);
    expect(applyNegotiationChoice(s, 99)).toBe(s);
  });
});
