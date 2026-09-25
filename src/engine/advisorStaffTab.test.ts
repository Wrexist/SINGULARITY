import { describe, it, expect } from "vitest";
import { advisorItems, attentionCounts } from "./advisor";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { derive } from "./derive";
import { balance } from "./balance/config";
import { labReveal } from "./reveal";
import { Big } from "./math/Big";
import type { Employee, GameState } from "./types";

/**
 * The payroll warning after a Ship (bug hunt round 3). Staff stay with the company
 * across a Ship, and "Payroll is outrunning your income" used to point at a Team tab
 * the nav had hidden until the run's first research — a dead-end tap. The Team tab
 * now stays open across a Ship once it has opened (labReveal, same round), so the
 * invariant this pins is the general one: the chip points at the Team tab only when
 * the nav draws it.
 */
const staffTabShown = (s: GameState) => labReveal(s).staff;

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
  it("keeps the Team tab open across a Ship, so the payroll chip has somewhere to land", () => {
    const s = justShippedWithCrew();
    expect(s.employees.length).toBe(3);
    expect(derive(s).payrollPerSec.gt(0)).toBe(true);
    expect(staffTabShown(s)).toBe(true);
  });

  it("never sends a chip to the Team tab while the nav hides it", () => {
    // A generation-1 lab carrying staff before its first research (e.g. a crafted or
    // migrated save): the tab is hidden, so no chip and no badge may point at it.
    const early = createInitialState();
    early.employees = crew(3);
    const states = [early, justShippedWithCrew(), { ...justShippedWithCrew(), research: [balance.research[0]!.id] }];
    for (const s of states) {
      if (staffTabShown(s)) continue;
      for (const item of advisorItems(s)) expect(item.tab).not.toBe("employees");
      expect(attentionCounts(s).employees).toBe(0);
    }
    expect(staffTabShown(early)).toBe(false); // the hidden case really is exercised
  });
});
