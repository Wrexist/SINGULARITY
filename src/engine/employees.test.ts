import { describe, it, expect } from "vitest";
import {
  employeeEffectMult, employeePayroll, levelEffectMult,
  canTrain, startTraining, advanceTraining, trainDurationSec,
  assignEmployee, fireEmployee, addEmployee, teamMorale, computeStaffEffects,
} from "./employees";
import { createInitialState } from "./state";
import { Big } from "./math/Big";
import type { Employee } from "./types";

const emp = (over: Partial<Employee> = {}): Employee => ({
  id: "emp-1", name: "Ada Lovelace", roleId: "staff_growth", level: 1, trait: null,
  assignedProductId: null, training: null, ...over,
});

function withMoney(n = 1e7) {
  const s = createInitialState();
  s.resources.money = Big.of(n);
  return s;
}

describe("employees — output + payroll", () => {
  it("level and trait scale output", () => {
    expect(levelEffectMult(1)).toBe(1);
    expect(levelEffectMult(3)).toBeGreaterThan(levelEffectMult(1));
    expect(employeeEffectMult(emp({ level: 3 }))).toBeGreaterThan(employeeEffectMult(emp({ level: 1 })));
    expect(employeeEffectMult(emp({ trait: "tenx" }))).toBeGreaterThan(employeeEffectMult(emp({ trait: null })));
  });

  it("payroll scales with level and trait (Frugal is cheaper, Prima Donna pricier)", () => {
    const base = employeePayroll(emp());
    expect(employeePayroll(emp({ level: 3 }))).toBeGreaterThan(base);
    expect(employeePayroll(emp({ trait: "frugal" }))).toBeLessThan(base);
    expect(employeePayroll(emp({ trait: "prima_donna" }))).toBeGreaterThan(base);
  });
});

describe("employees — training (timed)", () => {
  it("starts training (pays Money), then completes into a level-up", () => {
    let s = addEmployee(withMoney(), emp());
    expect(canTrain(s, "emp-1")).toBe(true);
    const before = s.resources.money;
    s = startTraining(s, "emp-1");
    expect(s.employees[0]!.training).not.toBeNull();
    expect(s.resources.money.lt(before)).toBe(true);
    expect(canTrain(s, "emp-1")).toBe(false); // already training

    const dur = s.employees[0]!.training!.totalSec;
    const res = advanceTraining(s.employees, dur + 1);
    expect(res.employees[0]!.level).toBe(2);
    expect(res.employees[0]!.training).toBeNull();
    expect(res.completed).toHaveLength(1);
  });

  it("won't train past max level or when broke", () => {
    expect(canTrain(addEmployee(withMoney(), emp({ level: 4 })), "emp-1")).toBe(false);
    const poor = createInitialState();
    expect(canTrain(addEmployee(poor, emp()), "emp-1")).toBe(false);
  });

  it("training duration grows with level", () => {
    expect(trainDurationSec(2)).toBeGreaterThan(trainDurationSec(1));
  });
});

describe("employees — roster transitions", () => {
  it("assign sets the product; invalid product benches; fire removes", () => {
    let s = addEmployee(createInitialState(), emp());
    s = { ...s, products: { ...s.products, active: [{ id: "prod-1", name: "X", type: "general", version: 1, quality: 1, priceMult: 1, marketingPerSec: 0, mau: 0, paid: 0, buzzSec: 0, upgrade: null, features: [], enterprise: false, enterprisePrice: 1 }] } };
    s = assignEmployee(s, "emp-1", "prod-1");
    expect(s.employees[0]!.assignedProductId).toBe("prod-1");
    s = assignEmployee(s, "emp-1", "ghost"); // not a real product → bench
    expect(s.employees[0]!.assignedProductId).toBeNull();
    expect(fireEmployee(s, "emp-1").employees).toHaveLength(0);
  });
});

describe("employees — aggregation", () => {
  it("a focused product-employee buffs their product more than when benched", () => {
    const benched = [emp({ id: "g", roleId: "staff_growth", assignedProductId: null })];
    const focused = [emp({ id: "g", roleId: "staff_growth", assignedProductId: "prod-1" })];
    const a = computeStaffEffects(benched, ["prod-1"], 1, 2).productModsById["prod-1"]!.acq;
    const b = computeStaffEffects(focused, ["prod-1"], 1, 2).productModsById["prod-1"]!.acq;
    expect(b).toBeGreaterThan(a);
  });

  it("infra employees raise lane multipliers and everyone adds payroll", () => {
    const fx = computeStaffEffects([emp({ roleId: "staff_engineer" })], [], 1, 2);
    expect(fx.computeMultF).toBeGreaterThan(1);
    expect(fx.payroll).toBeGreaterThan(0);
  });

  it("Mentor trait contributes team morale", () => {
    expect(teamMorale([emp({ trait: "mentor" })])).toBeGreaterThan(0);
    expect(teamMorale([emp({ trait: null })])).toBe(0);
  });
});
