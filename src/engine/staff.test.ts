import { describe, it, expect } from "vitest";
import { derive } from "./derive";
import { tick } from "./tick";
import { computeStaffEffects } from "./employees";
import { createInitialState } from "./state";
import { Big } from "./math/Big";
import type { Employee } from "./types";

const person = (roleId: string, over: Partial<Employee> = {}): Employee => ({
  id: `e-${roleId}-${over.id ?? Math.round((over.level ?? 1) * 1000)}`, name: "Test Person",
  roleId, level: 1, trait: null, assignedProductId: null, training: null, ...over,
});

describe("staff (individual employees) — derive + payroll", () => {
  it("an infra employee multiplies its lane and accrues payroll", () => {
    const base = createInitialState();
    const withEng = { ...base, employees: [person("staff_engineer", { id: "1" })] };
    expect(derive(withEng).computePerSec.gt(derive(base).computePerSec)).toBe(true);
    expect(derive(withEng).payrollPerSec.gt(0)).toBe(true);
    expect(derive(base).payrollPerSec.eq(0)).toBe(true);
  });

  it("product employees fold into productMods (Sales → ARPU↑, PR → Heat↓)", () => {
    const s = { ...createInitialState(), employees: [person("staff_sales", { id: "1" }), person("staff_pr", { id: "2" })] };
    const d = derive(s);
    expect(d.productMods.arpu).toBeGreaterThan(1);
    expect(d.productMods.heat).toBeLessThan(1);
  });

  it("drains payroll from Money in tick, but not lifetimeMoney", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    s.employees = [person("staff_engineer", { id: "1" }), person("staff_engineer", { id: "2" }), person("staff_engineer", { id: "3" })];
    const next = tick(s, 10_000);
    expect(next.resources.money.lt(1000)).toBe(true);
    expect(next.lifetimeMoney.eq(0)).toBe(true); // payroll never touches lifetime earnings
  });

  it("payroll floors Money at zero (never negative)", () => {
    const s = createInitialState();
    s.resources.money = Big.of(30);
    s.employees = Array.from({ length: 6 }, (_, i) => person("staff_pr", { id: String(i) })); // pricey crew
    const next = tick(s, 100_000);
    expect(next.resources.money.gte(0)).toBe(true);
    expect(next.resources.money.eq(0)).toBe(true);
  });

  it("applies diminishing returns when stacking one lane (anti-zerg)", () => {
    const eng = (id: string) => person("staff_engineer", { id });
    const one = computeStaffEffects([eng("1")], [], 1, 2).computeMultF;
    const ten = computeStaffEffects(Array.from({ length: 10 }, (_, i) => eng(String(i))), [], 1, 2).computeMultF;
    expect(ten).toBeGreaterThan(one); // more people still help…
    expect(ten).toBeLessThan(1 + (one - 1) * 10); // …but sublinearly vs a linear stack
  });

  it("diminishes a stacked product lane too, so per-head output falls", () => {
    const gl = (id: string) => person("staff_growth", { id }); // benched → global acq buff
    const one = computeStaffEffects([gl("1")], ["p"], 1, 1).productModsById["p"]!.acq;
    const six = computeStaffEffects(Array.from({ length: 6 }, (_, i) => gl(String(i))), ["p"], 1, 1).productModsById["p"]!.acq;
    expect(six).toBeGreaterThan(one);
    expect((six - 1) / 6).toBeLessThan(one - 1); // per-head contribution diminishes
  });

  it("ranks diminishing returns per destination bucket (benched buff is independent of assigned staff)", () => {
    // One benched Growth Lead buffs every product globally. Adding Growth Leads
    // ASSIGNED to product "p" must NOT decay the benched person's global buff —
    // they feed a different (focus) bucket and are ranked separately.
    const benched = (id: string) => person("staff_growth", { id });
    const assigned = (id: string) => person("staff_growth", { id, assignedProductId: "p" });
    const aloneAcq = computeStaffEffects([benched("b")], ["p", "q"], 1, 2).productModsById["q"]!.acq;
    const withAssigned = computeStaffEffects(
      [benched("b"), assigned("a1"), assigned("a2"), assigned("a3")],
      ["p", "q"], 1, 2,
    ).productModsById["q"]!.acq; // product q has NO assignees → only the benched global buff
    expect(withAssigned).toBeCloseTo(aloneAcq, 10);
  });

  it("rewards seniority: one level-4 outproduces a same-size junior on its lane", () => {
    const senior = computeStaffEffects([person("staff_growth", { id: "s", level: 4 })], ["p"], 1, 1).productModsById["p"]!.acq;
    const junior = computeStaffEffects([person("staff_growth", { id: "j", level: 1 })], ["p"], 1, 1).productModsById["p"]!.acq;
    expect(senior - 1).toBeGreaterThan((junior - 1) * 2); // level 4 ≫ level 1 (no decay on a single head)
  });

  it("office morale perk boosts staff output; payroll perk trims the wage bill", () => {
    const baseS = { ...createInitialState(), employees: [person("staff_sales", { id: "1" })] };
    const morale = { ...baseS, upgrades: { perk_snacks: 1 } };
    expect(derive(morale).productMods.arpu).toBeGreaterThan(derive(baseS).productMods.arpu);
    const cheaper = { ...baseS, upgrades: { perk_remote: 1 } };
    expect(derive(cheaper).payrollPerSec.lt(derive(baseS).payrollPerSec)).toBe(true);
  });
});
