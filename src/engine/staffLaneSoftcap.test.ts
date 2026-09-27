import { describe, it, expect } from "vitest";
import { balance } from "./balance/config";
import { computeStaffEffects } from "./employees";
import type { Employee } from "./types";

/**
 * Staff lane softcap (round 8, owner call). The Compute/Data/Money lanes multiply each
 * specialist's contribution together, so the lane grew like a power of headcount: 512
 * L4 10x Engineers at full morale gave x42,125 Compute (x586 at base morale) while
 * payroll is capped at half of income. Above `staff.laneSoftcap.knee` a lane now grows
 * as knee * (m / knee)^exponent: big crews keep growing, with diminishing returns, and
 * every ordinary crew (measured below) is untouched.
 */
const roles = balance.staff.roles.map((r) => r.id);
const crew = (n: number, level: number, trait: string | null, roleId?: string): Employee[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`, name: `P${i}`, roleId: roleId ?? roles[i % roles.length]!, level, trait,
    assignedProductId: null, training: null,
  }));
const MAX_MORALE = 1 + 0.1 + 0.15 + 0.15 + balance.staff.maxTeamMorale; // every perk + Mentor cap
const fx = (emps: Employee[], morale: number) => computeStaffEffects(emps, [], morale, balance.staff.assignFocusMult);
const within1pct = (got: number, want: number) => expect(Math.abs(got / want - 1)).toBeLessThan(0.01);

describe("staff lane softcap", () => {
  it("is balance data with a knee above every ordinary crew", () => {
    const { knee, exponent } = balance.staff.laneSoftcap;
    expect(knee).toBeGreaterThanOrEqual(64);
    expect(exponent).toBeGreaterThan(0);
    expect(exponent).toBeLessThan(1);
  });

  it("leaves ordinary crews of 40-60 people unchanged (within 1%)", () => {
    // Uncapped values measured at 656ce9f.
    // A 60-person roster across every role, all L4 10x, every perk + Mentors.
    const mixed = fx(crew(60, 4, "tenx"), MAX_MORALE);
    within1pct(mixed.computeMultF, 5.09);
    within1pct(mixed.dataMultF, 20.77);
    within1pct(mixed.moneyMultF, 8.03);
    // A 60-person single-lane crew of trained L2 Steady Researchers at full morale.
    within1pct(fx(crew(60, 2, "steady", "staff_researcher"), MAX_MORALE).dataMultF, 21.17);
    // 60 L3 Workaholic Researchers with a couple of perks.
    within1pct(fx(crew(60, 3, "workaholic", "staff_researcher"), 1.3).dataMultF, 50.2);
    // 60 L4 10x on one lane at base morale.
    within1pct(fx(crew(60, 4, "tenx", "staff_engineer"), 1).computeMultF, 31.52);
    within1pct(fx(crew(60, 4, "tenx", "staff_researcher"), 1).dataMultF, 93.22);
  });

  it("softens huge single-lane crews but keeps them growing", () => {
    const eng = (n: number, morale: number) => fx(crew(n, 4, "tenx", "staff_engineer"), morale).computeMultF;
    // Before: 512 L4 10x Engineers = x586 (base morale), x42,125 (full morale).
    expect(eng(512, 1)).toBeLessThan(300);
    expect(eng(512, MAX_MORALE)).toBeLessThan(2_500);
    // Still monotone: every extra engineer adds something.
    for (const m of [1, MAX_MORALE]) {
      let prev = 0;
      for (const n of [10, 50, 100, 200, 300, 512]) {
        const v = eng(n, m);
        expect(v).toBeGreaterThan(prev);
        prev = v;
      }
    }
    // Researchers (the steepest lane) are softened too.
    expect(fx(crew(512, 4, "tenx", "staff_researcher"), MAX_MORALE).dataMultF).toBeLessThan(15_000);
  });

  it("is continuous at the knee and finite at the roster cap", () => {
    const { knee } = balance.staff.laneSoftcap;
    // Find the crew that first crosses the knee; the step across it stays small.
    let prev = fx(crew(1, 4, "tenx", "staff_engineer"), MAX_MORALE).computeMultF;
    for (let n = 2; n <= balance.staff.maxRoster; n++) {
      const v = fx(crew(n, 4, "tenx", "staff_engineer"), MAX_MORALE).computeMultF;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(prev);
      if (prev < knee && v >= knee) expect(v / prev).toBeLessThan(1.2);
      prev = v;
    }
  });
});
