import { describe, it, expect } from "vitest";
import { derive } from "./derive";
import { tick } from "./tick";
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

  it("office morale perk boosts staff output; payroll perk trims the wage bill", () => {
    const baseS = { ...createInitialState(), employees: [person("staff_sales", { id: "1" })] };
    const morale = { ...baseS, upgrades: { perk_snacks: 1 } };
    expect(derive(morale).productMods.arpu).toBeGreaterThan(derive(baseS).productMods.arpu);
    const cheaper = { ...baseS, upgrades: { perk_remote: 1 } };
    expect(derive(cheaper).payrollPerSec.lt(derive(baseS).payrollPerSec)).toBe(true);
  });
});
