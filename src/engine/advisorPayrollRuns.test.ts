import { describe, it, expect } from "vitest";
import { advisorItems } from "./advisor";
import { createInitialState } from "./state";
import { derive, runsPerSec } from "./derive";
import { addEmployee } from "./employees";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * "Payroll is outrunning your income — grow revenue or let someone go" must only fire
 * when it is true. It compared wages with passive money + product revenue and left out
 * the training runs, which are the whole income of a lab before Inference API and of
 * any lab without a live product. Hiring a specialist in the first generation (the
 * Employees tab opens after one research node) lit the warning — and the Employees
 * badge — for the rest of the run, telling the player to fire someone while the Money
 * bar, which does count runs, showed income many times the wage bill.
 */

const WARNING = "Payroll is outrunning your income";

/** A first-generation lab mid-way up the tree: Auto-Train running, no passive money
 *  (Inference API not researched), no products (they unlock at the first Ship). */
function lab(): GameState {
  const s = createInitialState();
  return {
    ...s,
    upgrades: { rack_basic: 20, rack_server: 6, auto_claim: 1, auto_train: 1, monetize: 5 },
    research: ["backprop", "curated_data", "mixed_precision"],
  };
}

function hire(s: GameState, n: number): GameState {
  let out = s;
  for (let i = 0; i < n; i++) {
    out = addEmployee(out, {
      id: `emp-${i}`, name: "E", roleId: balance.staff.roles[0]!.id, level: 1, trait: null,
      assignedProductId: null, training: null,
    });
  }
  return out;
}

describe("the payroll warning counts the runs that pay the wages", () => {
  it("stays quiet when the training runs out-earn the wage bill", () => {
    const s = hire(lab(), 1);
    const d = derive(s);
    expect(d.passiveMoneyPerSec.eq(0)).toBe(true);
    const runIncome = d.runMoneyYield.mul(runsPerSec(d, s.computeFocus));
    expect(runIncome.gt(d.payrollPerSec.mul(10))).toBe(true);
    expect(advisorItems(s).some((i) => i.text.startsWith(WARNING))).toBe(false);
  });

  it("still warns when the wage bill really is bigger than every income", () => {
    // Training held (intensity 0): the runs pay nothing, so the payroll is uncovered.
    const s: GameState = { ...hire(lab(), 3), computeFocus: 0 };
    expect(advisorItems(s).some((i) => i.text.startsWith(WARNING))).toBe(true);
  });
});
