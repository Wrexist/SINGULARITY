import { describe, it, expect } from "vitest";
import { tick, incomeRatePerSec } from "./tick";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { Employee, GameState } from "./types";

/**
 * Payroll must not depend on frame rate (r3 bug hunt). It was capped at a share of each
 * TICK's receipts, and auto-claimed runs pay in lumps every few seconds — so every 10Hz
 * frame between lumps forgave its wages (live play paid ~2–5% of the bill) while a
 * resume or offline window paid the whole capped amount. The cap now also counts the
 * lab's income rate, so a frame and a long step charge the same per second.
 */
const person = (i: number): Employee => ({
  id: `p${i}`, name: "A B", roleId: "staff_engineer", level: 1, trait: null, assignedProductId: null, training: null,
});

function autoLab(staff: number): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 30, rack_server: 10, auto_claim: 1, auto_train: 1 };
  s.research = ["backprop"];
  s.computeFocus = 1;
  s.employees = Array.from({ length: staff }, (_, i) => person(i));
  return s;
}

function moneyAfter(s: GameState, totalMs: number, stepMs: number): number {
  let g = s;
  for (let t = 0; t < totalMs; t += stepMs) g = tick(g, stepMs);
  return g.resources.money.toNumber();
}

describe("payroll is charged per second, not per frame", () => {
  it("the lab really is a lumpy auto-run lab with a wage bill", () => {
    const d = derive(autoLab(4));
    expect(d.autoTrain && d.autoClaim).toBe(true);
    expect(d.payrollPerSec.gt(0)).toBe(true);
    expect(incomeRatePerSec(autoLab(4), d).gt(0)).toBe(true);
  });

  it("10Hz live play and 5 s steps end within a few percent of each other", () => {
    const lab = autoLab(4);
    const live = moneyAfter(lab, 120_000, 100);
    const coarse = moneyAfter(lab, 120_000, 5_000);
    expect(live).toBeGreaterThan(0);
    expect(Math.abs(live - coarse) / coarse).toBeLessThan(0.08);
  });

  it("live play pays what the rule says: min(bill, share × income) — not a sliver of it", () => {
    const lab = autoLab(4);
    let g = lab;
    for (let t = 0; t < 120_000; t += 100) g = tick(g, 100);
    const earned = g.lifetimeMoney.sub(lab.lifetimeMoney).toNumber();
    const paid = earned - g.resources.money.sub(lab.resources.money).toNumber(); // nothing else spends here
    const bill = derive(lab).payrollPerSec.toNumber() * 120;
    const expected = Math.min(bill, balance.staff.payrollMaxShareOfIncome * earned);
    expect(paid).toBeGreaterThan(0.85 * expected); // it was ~2–5% of the bill before
    expect(paid).toBeLessThanOrEqual(expected * 1.02);
  });

  it("still never pins an income-less lab at $0", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    s.employees = [person(1), person(2), person(3)];
    expect(tick(s, 10_000).resources.money.eq(1000)).toBe(true);
    expect(balance.staff.payrollMaxShareOfIncome).toBeLessThan(1);
  });
});
