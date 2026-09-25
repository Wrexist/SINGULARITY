import { describe, it, expect } from "vitest";
import { advisorItems, attentionCounts } from "./advisor";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { derive } from "./derive";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { Employee, GameState } from "./types";

/**
 * The payroll warning after a Ship (bug hunt round 3). Staff stay with the company
 * across a Ship, but the Team tab only opens again with the run's first research
 * (App's `showStaff`). In between, "Payroll is outrunning your income" was the
 * advisor chip — pointing at a tab that is not in the nav. Tapping it set the tab to
 * one that does not render, so the Lab showed with no nav item lit, and the Team
 * badge it counted had no button to sit on.
 */
const staffTabShown = (s: GameState) => balance.staff.enabled && s.research.length >= balance.staff.revealAtResearch;

const crew = (n: number): Employee[] => Array.from({ length: n }, (_, i) => ({
  id: `emp-${i + 1}`, name: "A B", roleId: balance.staff.roles[0]!.id, level: 1, trait: null, assignedProductId: null, training: null,
}));

function justShippedWithCrew(): GameState {
  const s = createInitialState();
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e8);
  s.employees = crew(3);
  // "Sell" leaves no draft behind, so nothing outranks the payroll item.
  return prestige(s, "sell");
}

describe("advisor after a Ship with staff on the payroll", () => {
  it("never sends the chip to the Team tab while the nav hides it", () => {
    const s = justShippedWithCrew();
    expect(s.employees.length).toBe(3);
    expect(staffTabShown(s)).toBe(false);
    expect(derive(s).payrollPerSec.gt(0)).toBe(true);
    for (const item of advisorItems(s)) expect(item.tab).not.toBe("employees");
    expect(attentionCounts(s).employees).toBe(0);
  });

  it("raises the payroll warning again once the Team tab is back", () => {
    const s = justShippedWithCrew();
    s.research = [balance.research[0]!.id];
    expect(staffTabShown(s)).toBe(true);
    expect(advisorItems(s).some((i) => i.tab === "employees" && i.text.startsWith("Payroll"))).toBe(true);
  });
});
