import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { applyOffline, sanitizeOfflineRate, extendSummary, MAX_OFFLINE_RATE } from "./offline";
import {
  applyAutomation, toggleAutomation, automationUnlocked, automationUnlockedAny, automationEnabled, shipsNeeded, automationList,
} from "./automation";
import { automation as A } from "./balance/automation";
import { serialize } from "./save";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * Pro perks in the pure engine. Pro is passed IN (never read from storage or the
 * clock here) and every parameter defaults off, so the balance sim — which calls
 * tick(state, ms) and never takes the offline path — cannot see any of it.
 */

const H = 3_600_000;

/** A small producing lab (earns over a window, cheap to tick). */
function lab(): GameState {
  const s = createInitialState();
  s.resources.compute = Big.of(1e4);
  s.upgrades = { rack_basic: 12 };
  return s;
}

const same = (a: GameState, b: GameState) => expect(serialize(a)).toBe(serialize(b));

describe("applyOffline rate (Pro ×2 offline)", () => {
  it("simulates the capped real window at the rate", () => {
    const s = lab();
    const { state } = applyOffline(s, 1 * H, 8, 2);
    same(state, tick(s, 2 * H));
  });

  it("caps REAL time first, then applies the rate (never rate × uncapped)", () => {
    const s = lab();
    const { state, summary } = applyOffline(s, 3 * H, 2, 2); // 3h away, 2h cap, ×2
    same(state, tick(s, 4 * H));
    expect(summary.elapsedMs).toBe(3 * H); // real time away
    expect(summary.appliedMs).toBe(2 * H); // real time credited
    expect(summary.capped).toBe(true);
    expect(summary.rate).toBe(2);
  });

  it("×2 earns more than ×1 over the same real window", () => {
    const s = lab();
    const one = applyOffline(s, 1 * H, 8).summary.gained.compute;
    const two = applyOffline(s, 1 * H, 8, 2).summary.gained.compute;
    expect(two.gt(one)).toBe(true);
  });

  it("defaults to ×1 with no rate field — the pre-Pro behaviour, byte for byte", () => {
    const s = lab();
    const { state, summary } = applyOffline(s, 1 * H, 8);
    same(state, tick(s, 1 * H));
    expect(summary.rate).toBeUndefined();
    same(applyOffline(s, 1 * H, 8, 1).state, state);
  });

  it("is pure: the input state is untouched", () => {
    const s = lab();
    const before = serialize(s);
    applyOffline(s, 1 * H, 8, 2, true);
    expect(serialize(s)).toBe(before);
  });

  it("sanitizes a hostile rate", () => {
    expect(sanitizeOfflineRate(NaN)).toBe(1);
    expect(sanitizeOfflineRate(-2)).toBe(1);
    expect(sanitizeOfflineRate(0)).toBe(1);
    expect(sanitizeOfflineRate(Infinity)).toBe(1);
    expect(sanitizeOfflineRate(1e9)).toBe(MAX_OFFLINE_RATE);
    expect(sanitizeOfflineRate(2)).toBe(2);
  });

  it("a folded recap keeps the rate it ran at", () => {
    const s = lab();
    const a = applyOffline(s, 1 * H, 8, 2).summary;
    const b = applyOffline(s, 1 * H, 8).summary;
    expect(extendSummary(a, b).rate).toBe(2);
    expect(extendSummary(b, b).rate).toBeUndefined();
  });
});

describe("autopilots one Ship sooner with Pro", () => {
  const shipped = (n: number) => {
    const s = createInitialState();
    s.prestige.ships = n;
    s.lifetimeMoney = Big.of(1000); // "Earn your first $100" is met
    return s;
  };

  it("every autopilot and the panel reveal unlock one Ship earlier, never below 0", () => {
    for (const def of automationList()) {
      const early = shipped(def.unlockShips - 1);
      expect(automationUnlocked(early, def.id)).toBe(false);
      expect(automationUnlocked(early, def.id, true)).toBe(true);
    }
    expect(automationUnlockedAny(shipped(A.revealAtShips - 1))).toBe(false);
    expect(automationUnlockedAny(shipped(A.revealAtShips - 1), true)).toBe(true);
    expect(shipsNeeded(0, true)).toBe(0);
    expect(shipsNeeded(5, true)).toBe(5 - A.proShipsEarlier);
    expect(shipsNeeded(5)).toBe(5);
  });

  it("a Pro-only unlock can be switched on, and actually RUNS", () => {
    let s = shipped(1); // auto_objectives needs 2 (1 with Pro)
    expect(toggleAutomation(s, "auto_objectives")).toBe(s); // locked without Pro
    s = toggleAutomation(s, "auto_objectives", true);
    expect(automationEnabled(s, "auto_objectives", true)).toBe(true);
    expect(applyAutomation(s, true).objectives.completed.length).toBeGreaterThan(0);
  });

  it("losing Pro just stops the autopilot (no crash, switch kept for later)", () => {
    const on = { ...shipped(1), automation: { auto_objectives: true } };
    expect(automationEnabled(on, "auto_objectives")).toBe(false);
    expect(applyAutomation(on)).toBe(on); // same-ref no-op
    expect(on.automation.auto_objectives).toBe(true);
    expect(applyAutomation(on, true).objectives.completed.length).toBeGreaterThan(0); // Pro back → runs
  });

  it("tick passes Pro to the autopilots between catch-up steps; the sim's tick never does", () => {
    const on = { ...shipped(1), automation: { auto_objectives: true } };
    const withPro = tick(on, 20 * 60_000, true);
    const simPath = tick(on, 20 * 60_000);
    expect(withPro.objectives.completed.length).toBeGreaterThan(0);
    expect(simPath.objectives.completed.length).toBe(0);
    same(simPath, tick(on, 20 * 60_000, false));
  });

  it("an offline catch-up with Pro runs a Pro-only autopilot; without Pro it doesn't", () => {
    const on = { ...shipped(1), automation: { auto_objectives: true } };
    expect(applyOffline(on, 1 * H, 24, 2, true).state.objectives.completed.length).toBeGreaterThan(0);
    expect(applyOffline(on, 1 * H, 8).state.objectives.completed.length).toBe(0);
  });
});
