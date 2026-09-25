import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployeesPanel } from "./EmployeesPanel";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { employeePayroll } from "../engine/employees";
import { m$ } from "./format";
import type { Candidate } from "../state/store";
import type { Employee, GameState } from "../engine/types";

/**
 * Per-person pay with payroll perks owned (bug hunt r3, staff). Remote-First (−20%),
 * the Wellness Program (−15%) and the Prestige Employer Reputation perk (−15%) trim
 * every salary before tick() charges it, and the Payroll /s KPI showed that — but each
 * roster card and recruit card still quoted the untrimmed salary, so with all three
 * owned the cards summed to ~1.7× the wage bill actually paid.
 */
const noop = () => {};
const person = (i: number, roleId: string, trait: string | null): Employee => ({
  id: `emp-${i}`, name: `Ada Lovelace${i}`, roleId, level: 2, trait, assignedProductId: null, training: null,
});
function render(game: GameState, candidates: Candidate[] | null): string {
  return renderToStaticMarkup(createElement(EmployeesPanel, {
    game, derived: derive(game), candidates,
    onRecruit: noop, onRefresh: noop, onCloseRecruit: noop, onHireCandidate: noop,
    onTrain: noop, onAssign: noop, onFire: noop, onBuyPerk: noop,
  }));
}
const clean = (s: string) => s.replace(/&#x27;|&amp;/g, "");
const cardPays = (html: string) => [...html.matchAll(/class="emp-person-pay">([^<]*)</g)].map((m) => clean(m[1]!));
const candidatePays = (html: string) => [...html.matchAll(/class="emp-tag muted">([^<]*)</g)].map((m) => clean(m[1]!));

function perkedLab(): GameState {
  const s = createInitialState();
  s.upgrades = { perk_remote: 1, perk_wellness: 1 };
  s.reputation = { ...s.reputation, perks: ["rep_payroll1"] };
  s.employees = [person(1, "staff_sales", "prima_donna"), person(2, "staff_pr", "tenx"), person(3, "staff_recruiter", null)];
  return s;
}

describe("roster pay with payroll perks", () => {
  it("each card quotes the salary actually charged, and they add up to Payroll /s", () => {
    const s = perkedLab();
    const d = derive(s);
    const mult = 0.8 * 0.85 * 0.85;
    const html = render(s, null);
    expect(cardPays(html)).toEqual(s.employees.map((e) => `${m$(employeePayroll(e) * mult)}/s`));
    const sum = s.employees.reduce((t, e) => t + employeePayroll(e) * mult, 0);
    expect(sum / d.payrollPerSec.toNumber()).toBeCloseTo(1, 6);
  });

  it("a recruit card quotes the trimmed salary too", () => {
    const s = perkedLab();
    const c: Candidate = { name: "Grace Hopper", roleId: "staff_sales", trait: "frugal" };
    const expected = employeePayroll({ roleId: c.roleId, level: 1, trait: c.trait }) * 0.8 * 0.85 * 0.85;
    expect(candidatePays(render(s, [c]))).toEqual([`${m$(expected)}/s`]);
  });
});
