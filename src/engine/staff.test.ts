import { describe, it, expect } from "vitest";
import { hireStaff, canHireStaff, staffHireCost, staffHireDiscount } from "./actions";
import { derive } from "./derive";
import { tick } from "./tick";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const researcher = balance.staff.roles.find((r) => r.id === "staff_researcher")!;

describe("staff (Phase 2)", () => {
  it("hires when affordable: deducts money, increments count, raises next cost", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    expect(canHireStaff(s, "staff_researcher")).toBe(true);
    const next = hireStaff(s, "staff_researcher");
    expect(next.upgrades.staff_researcher).toBe(1);
    expect(next.resources.money.lt(1000)).toBe(true);
    expect(staffHireCost(researcher, 1).gt(staffHireCost(researcher, 0))).toBe(true);
  });

  it("is a no-op when unaffordable", () => {
    const s = createInitialState(); // no money
    expect(canHireStaff(s, "staff_researcher")).toBe(false);
    expect(hireStaff(s, "staff_researcher")).toBe(s);
  });

  it("multiplies its lane and accrues payroll in derive", () => {
    const base = createInitialState();
    const withStaff = createInitialState();
    withStaff.upgrades = { staff_researcher: 5 }; // +40% data, 10/s payroll
    expect(derive(withStaff).dataMult.gt(derive(base).dataMult)).toBe(true);
    expect(derive(withStaff).payrollPerSec.eq(5 * researcher.payroll)).toBe(true);
    expect(derive(base).payrollPerSec.eq(0)).toBe(true);
  });

  it("drains payroll from Money in tick, but not lifetimeMoney", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    s.upgrades = { staff_researcher: 5 }; // 10/s
    const next = tick(s, 10_000); // 10s → -100 money
    expect(next.resources.money.lt(1000)).toBe(true);
    expect(next.resources.money.gte(890)).toBe(true); // ~900 (no other money source)
    expect(next.lifetimeMoney.eq(0)).toBe(true); // payroll never touches lifetime earnings
  });

  it("product-team roles fold into productMods (ARPU up, Heat down)", () => {
    const s = createInitialState();
    s.upgrades = { staff_sales: 2, staff_pr: 2 };
    const d = derive(s);
    expect(d.productMods.arpu).toBeGreaterThan(1);   // Sales Execs raise ARPU
    expect(d.productMods.heat).toBeLessThan(1);       // PR & Legal cut Heat
  });

  it("Recruiters discount future hire costs", () => {
    const s = createInitialState();
    s.upgrades = { staff_recruiter: 3 };
    const disc = staffHireDiscount(s);
    expect(disc).toBeLessThan(1);
    expect(disc).toBeGreaterThanOrEqual(0.25); // floored
    // The discounted cost is strictly cheaper than the base.
    expect(staffHireCost(researcher, 0, disc).lt(staffHireCost(researcher, 0))).toBe(true);
  });

  it("payroll floors Money at zero (never negative)", () => {
    const s = createInitialState();
    s.resources.money = Big.of(30);
    s.upgrades = { staff_ops: 5 }; // 20/s payroll, far exceeds balance over 100s
    const next = tick(s, 100_000);
    expect(next.resources.money.gte(0)).toBe(true);
    expect(next.resources.money.eq(0)).toBe(true);
  });
});
