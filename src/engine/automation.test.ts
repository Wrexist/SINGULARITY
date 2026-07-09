import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { applyAutomation, toggleAutomation, automationUnlocked, automationEnabled } from "./automation";
import { objectiveBoard } from "./objectives";
import { serialize, deserialize } from "./save";
import { prestige } from "./prestige";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

/** A state at ship count `n` with objectives revealed + the first one already met. */
function shipped(n: number) {
  const s = createInitialState();
  s.prestige.ships = n;
  s.lifetimeMoney = Big.of(1000);
  return s;
}

describe("Automation", () => {
  it("gates each autopilot by ship count; toggling only works when unlocked", () => {
    const locked = shipped(1); // auto_objectives unlocks at 2
    expect(automationUnlocked(locked, "auto_objectives")).toBe(false);
    expect(toggleAutomation(locked, "auto_objectives")).toBe(locked); // no-op while locked

    const s = shipped(2);
    expect(automationUnlocked(s, "auto_objectives")).toBe(true);
    const on = toggleAutomation(s, "auto_objectives");
    expect(automationEnabled(on, "auto_objectives")).toBe(true);
    expect(automationEnabled(toggleAutomation(on, "auto_objectives"), "auto_objectives")).toBe(false); // flips off
  });

  it("does nothing by default — no toggles → applyAutomation is a same-ref no-op (curve-safe)", () => {
    const s = shipped(30);
    expect(applyAutomation(s)).toBe(s);
  });

  it("auto_objectives claims a met objective when enabled, and never runs while locked", () => {
    let s = shipped(2); // lifetimeMoney 1,000 → "Earn your first $100" is met
    expect(objectiveBoard(s)[0]!.ready).toBe(true);
    s = toggleAutomation(s, "auto_objectives");
    expect(applyAutomation(s).objectives.completed.length).toBeGreaterThan(0);

    // Toggled on but ship-locked → applyAutomation is still a no-op.
    const lockedOn = { ...shipped(1), automation: { auto_objectives: true } };
    expect(applyAutomation(lockedOn)).toBe(lockedOn);
  });

  it("toggles persist across prestige + a save round-trip; the sanitizer drops unknown ids", () => {
    let s = shipped(5);
    s = toggleAutomation(s, "auto_objectives");
    s.research = [balance.prestige.capabilityResearch];
    expect(prestige(s, "deploy").automation.auto_objectives).toBe(true);

    const raw = JSON.parse(serialize(s));
    raw.automation.bogus = true;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.automation.auto_objectives).toBe(true);
    expect(loaded.automation.bogus).toBeUndefined();
  });
});
