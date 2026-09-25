import { describe, it, expect } from "vitest";
import { balance } from "./balance/config";
import { derive, totalMorale, officeMorale } from "./derive";
import { teamMorale } from "./employees";
import { createInitialState } from "./state";
import type { Employee } from "./types";

/**
 * Mentor morale stacking (bug hunt E-staff). Each Mentor adds a flat +teamMorale to the
 * morale multiplier that scales EVERY specialist's output, and the Compute/Data/Money
 * lanes multiply those contributions together — so with no ceiling, hiring a wall of
 * cheap Mentors (free re-rolls, flat signing bonus, payroll capped at half of income)
 * turned the per-lane diminishing returns into runaway growth: 100 Mentor Researchers
 * next to 10 Engineers pushed morale to ~7 and the Data lane past ×5,000. The Mentor
 * share is now capped by balance data (`staff.maxTeamMorale`).
 */
const person = (i: number, roleId: string, trait: string | null): Employee => ({
  id: `emp-${i}`, name: `P${i}`, roleId, level: 1, trait, assignedProductId: null, training: null,
});
const engineers = Array.from({ length: 10 }, (_, i) => person(i, "staff_engineer", null));
const mentors = (n: number) => Array.from({ length: n }, (_, i) => person(100 + i, "staff_researcher", "mentor"));

describe("Mentor morale ceiling", () => {
  const cap = balance.staff.maxTeamMorale;
  const per = balance.staff.traits.find((t) => t.id === "mentor")!.teamMorale!;

  it("is a sane, documented balance value that a few Mentors can actually reach", () => {
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(1);
    // Room for a handful of Mentors (not a single one), so the trait still pays.
    expect(cap / per).toBeGreaterThanOrEqual(3);
  });

  it("each Mentor still counts in full below the ceiling", () => {
    expect(teamMorale(mentors(1))).toBeCloseTo(per, 10);
    expect(teamMorale(mentors(2))).toBeCloseTo(2 * per, 10);
  });

  it("stacking Mentors past the ceiling adds nothing more", () => {
    expect(teamMorale(mentors(100))).toBeCloseTo(cap, 10);
    expect(teamMorale(mentors(512))).toBeCloseTo(cap, 10);
    const s = { ...createInitialState(), employees: [...engineers, ...mentors(100)] };
    expect(totalMorale(s)).toBeCloseTo(officeMorale(s) + cap, 10);
  });

  it("100 Mentors buy no more lane output than just enough Mentors to hit the ceiling", () => {
    const base = createInitialState();
    const enough = Math.ceil(cap / per - 1e-9);
    const atCap = derive({ ...base, employees: [...engineers, ...mentors(enough)] });
    const stacked = derive({ ...base, employees: [...engineers, ...mentors(100)] });
    // The Engineers' Compute lane only sees morale — it must not grow past the ceiling.
    expect(stacked.computeMult.toNumber()).toBeCloseTo(atCap.computeMult.toNumber(), 9);
    // The Data lane still grows with the extra Researchers themselves (diminishing),
    // but no longer explodes: bounded well below the old ×5,000.
    expect(stacked.dataMult.toNumber()).toBeLessThan(50);
  });
});
