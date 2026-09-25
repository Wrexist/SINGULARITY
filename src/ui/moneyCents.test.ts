import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployeesPanel } from "./EmployeesPanel";
import { m$, fmtMoney } from "./format";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * m$ — money from a plain number (product revenue/profit, salaries) — rounded to whole
 * dollars before formatting (bug hunt r4, number formatting). Every Big money figure
 * (the resource bar, Payroll /s) shows a decimal under $10, so the two disagreed on the
 * same money: a lone $1.20/s Greenhorn's card read "$1/s" beside "Payroll /s $1.2",
 * a product clearing $0.40/s read "$0/s revenue", and a product $0.30/s short of its
 * marketing spend read "-$0/s profit" — a negative zero, in red.
 */

describe("m$ keeps the precision fmtMoney shows", () => {
  it("shows cents under $10 instead of rounding to whole dollars", () => {
    expect(m$(1.2)).toBe("$1.2");
    expect(m$(0.4)).toBe("$0.4");
    expect(m$(7.25)).toBe(fmtMoney(Big.of(7.25)));
  });

  it("never prints a negative zero", () => {
    expect(m$(-0.3)).toBe("-$0.3");
    expect(m$(-0.02)).toBe("$0");
    expect(m$(-0.02)).not.toContain("-");
  });

  it("keeps the large-number and non-finite behaviour", () => {
    expect(m$(-5000)).toBe("-$5K");
    expect(m$(1_234_567)).toBe("$1.23M");
    expect(m$(NaN)).toBe("$0");
    expect(m$(Infinity)).toBe("$0");
  });

  it("a lone specialist's card quotes the Payroll /s it is the whole of", () => {
    const s: GameState = createInitialState();
    s.employees = [{ id: "e1", name: "Ada", roleId: "staff_researcher", level: 1, trait: "greenhorn", assignedProductId: null, training: null }];
    const d = derive(s);
    const html = renderToStaticMarkup(createElement(EmployeesPanel, {
      game: s, derived: d, candidates: null,
      onRecruit: () => {}, onRefresh: () => {}, onCloseRecruit: () => {}, onHireCandidate: () => {},
      onTrain: () => {}, onAssign: () => {}, onFire: () => {}, onBuyPerk: () => {},
    }));
    const card = /class="emp-person-pay">([^<]*)</.exec(html)?.[1];
    expect(fmtMoney(d.payrollPerSec)).toBe("$1.2");
    expect(card).toBe("$1.2/s");
  });
});
