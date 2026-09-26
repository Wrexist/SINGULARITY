import { describe, it, expect } from "vitest";
import { advisorItems } from "./advisor";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { Big } from "./math/Big";
import type { Employee, GameState } from "./types";

/**
 * "Payroll is outrunning your income" (bug hunt r3, staff). The warning measured income
 * as passive Money + product MRR only, but a first-generation lab earns ALL of its Money
 * from training runs: one $4/s Ops Lead — who RAISES Money — against ~$47/s of run
 * income put the warning (and a permanent Team badge) up, telling the player to fire
 * people who were paying for themselves.
 */
const WARN = "Payroll is outrunning your income — grow revenue or let someone go";
const person = (i: number, roleId: string): Employee => ({
  id: `emp-${i}`, name: "A B", roleId, level: 1, trait: null, assignedProductId: null, training: null,
});

/** A gen-1 style lab: auto-trained runs are the only income (no products, no passive). */
function runLab(staff: Employee[], focus = 1): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 20, rack_server: 10, auto_claim: 1, auto_train: 1 };
  s.research = ["backprop"];
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  s.computeFocus = focus;
  s.employees = staff;
  return s;
}
const warns = (s: GameState) => advisorItems(s, derive(s)).some((i) => i.text === WARN);

describe("payroll warning counts run income", () => {
  it("stays quiet when run income covers the wages many times over", () => {
    const s = runLab([person(1, "staff_ops")]);
    expect(derive(s).passiveMoneyPerSec.eq(0)).toBe(true); // runs are the whole income
    expect(warns(s)).toBe(false);
  });

  it("still warns when the wage bill really is bigger than everything the lab earns", () => {
    const s = runLab(Array.from({ length: 40 }, (_, i) => person(i + 1, "staff_researcher")));
    expect(warns(s)).toBe(true);
  });

  it("with training held there is no run income, so a wage bill is flagged", () => {
    const s = runLab([person(1, "staff_ops")], 0);
    expect(warns(s)).toBe(true);
  });
});
