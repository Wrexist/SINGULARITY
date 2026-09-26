import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployeesPanel } from "./EmployeesPanel";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { employeePayroll, roleDef } from "../engine/employees";
import { m$ } from "./format";
import type { Candidate } from "../state/store";
import type { Employee } from "../engine/types";

/**
 * Candidate cards (bug hunt E-staff). The recruit card printed the ROLE's base salary,
 * but a hire is paid role base × level × trait: a Prima Donna costs 1.8×, a Legendary
 * L2 10× about 2×, a Frugal hire half. The player made the hire on the wrong number,
 * and it jumped on the roster the moment they signed. The card must show the salary
 * the roster will show for that same person.
 */
const noop = () => {};
function renderCards(candidates: Candidate[]): string {
  const game = createInitialState();
  return renderToStaticMarkup(createElement(EmployeesPanel, {
    game, derived: derive(game), candidates,
    onRecruit: noop, onRefresh: noop, onCloseRecruit: noop, onHireCandidate: noop,
    onTrain: noop, onAssign: noop, onFire: noop, onBuyPerk: noop,
  }));
}
const payTags = (html: string) =>
  [...html.matchAll(/class="emp-tag muted">([^<]*)</g)].map((m) => m[1]!.replace(/&#x27;|&amp;/g, ""));

describe("recruit card salary", () => {
  it("shows what each candidate will actually be paid (level × trait), not the role base", () => {
    const cands: Candidate[] = [
      { name: "Ada Lovelace", roleId: "staff_sales", trait: "prima_donna" },
      { name: "Grace Hopper", roleId: "staff_sales", trait: "tenx", rare: true, level: 2 },
      { name: "Alan Turing", roleId: "staff_sales", trait: "frugal" },
    ];
    const tags = payTags(renderCards(cands));
    expect(tags).toHaveLength(3);
    cands.forEach((c, i) => {
      // The person the store would mint on hire, priced exactly as the roster prices them.
      const hired: Employee = { id: "emp-1", name: c.name, roleId: c.roleId, level: c.level ?? 1, trait: c.trait, assignedProductId: null, training: null };
      const actual = employeePayroll(hired);
      expect(actual).not.toBeCloseTo(roleDef(c.roleId)!.payroll, 6); // the traits really do move it
      expect(tags[i]).toBe(`${m$(actual)}/s`);
    });
  });
});
