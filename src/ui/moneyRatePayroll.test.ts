import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UpgradePanel } from "./UpgradePanel";
import { effRate, netMoneyRate } from "./format";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { tick } from "../engine/tick";
import { launchDraft, productMetrics } from "../engine/products";
import { productMilestones } from "../engine/balance/products";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { Employee, GameState } from "../engine/types";

/**
 * The Money rate the top bar and the Upgrade panel's Money ETAs quote (bug hunt r3,
 * staff). Both subtracted the WHOLE wage bill, but tick() takes payroll out of what the
 * lab earns and never more than half of it — so a roster costing more than half the
 * income read as a loss: the $/s line disappeared and every Money ETA vanished while
 * Money kept climbing. And both priced live products mods-blind, so the Sales Execs /
 * SREs a player assigned never moved the rate at all.
 */
const person = (i: number, roleId: string, over: Partial<Employee> = {}): Employee => ({
  id: `emp-${i}`, name: "A B", roleId, level: 1, trait: null, assignedProductId: null, training: null, ...over,
});

/** A run-income lab (auto-train + auto-claim, no products) with `n` Researchers: they
 *  lift Data, not Money, so every one of them is pure wage bill against run income. */
function runLab(n: number): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 20, rack_server: 10, auto_claim: 1, auto_train: 1 };
  s.research = ["backprop"];
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  s.computeFocus = 1;
  s.employees = Array.from({ length: n }, (_, i) => person(i + 1, "staff_researcher"));
  return s;
}

const moneyEtas = (html: string) =>
  [...html.matchAll(/<div class="card-cost"><span style="color:var\(--money-ink\)">[^<]*<\/span><span class="cost-eta">([^<]*)<\/span>/g)].map((m) => m[1]);

describe("Money rate with a roster on payroll", () => {
  it("keeps the Money ETAs when the wage bill is bigger than the income", () => {
    const s = runLab(30);
    const d = derive(s);
    const income = effRate(d, "money", s.computeFocus);
    expect(d.payrollPerSec.gt(income)).toBe(true); // the wage bill really is that big
    // ...yet Money still climbs: the tick takes at most half of what the lab earns.
    let w = s;
    for (let i = 0; i < 300; i++) w = tick(w, 100);
    expect(w.resources.money.gt(s.resources.money)).toBe(true);
    const html = renderToStaticMarkup(createElement(UpgradePanel, { game: s, derived: d, onBuy: () => {}, onFoundWing: () => {} }));
    expect(moneyEtas(html).length).toBeGreaterThan(3);
  });

  it("takes payroll the way the tick does: never more than half of what the lab earns", () => {
    const s = runLab(20);
    const d = derive(s);
    const income = effRate(d, "money", s.computeFocus);
    const net = netMoneyRate(s, d, income);
    expect(net.toNumber()).toBeCloseTo(income.toNumber() * (1 - balance.staff.payrollMaxShareOfIncome), 6);
    // What a long (resume-sized) window really banks: the cap binds on the window's earnings.
    let w = s;
    for (let i = 0; i < 600; i++) w = tick(w, 100);
    const after = tick(w, 120_000);
    const real = after.resources.money.sub(w.resources.money).toNumber() / 120;
    expect(net.toNumber() / real).toBeCloseTo(1, 1);
  });

  it("a light roster is charged in full", () => {
    const s = runLab(2);
    const d = derive(s);
    const income = effRate(d, "money", s.computeFocus);
    expect(netMoneyRate(s, d, income).eq(income.sub(d.payrollPerSec))).toBe(true);
  });

  it("counts the buffs assigned staff give a live product", () => {
    let s = createInitialState();
    s.prestige.ships = 3;
    s.research = ["backprop"];
    s.products.drafts = [{ id: "d1", quality: 5, ships: 1 }];
    s = launchDraft(s, { draftId: "d1", type: "code", name: "C", id: "prod-1" });
    const p = s.products.active[0]!;
    p.mau = 50_000; p.paid = 5_000; p.buzzSec = 0;
    s.products.frontier = 5;
    s.products.milestones = productMilestones.map((m) => m.id); // no one-off rewards in the window
    s.employees = Array.from({ length: 3 }, (_, i) => person(i + 1, "staff_sales", { assignedProductId: "prod-1" }));
    const d = derive(s);
    const net = netMoneyRate(s, d, d.passiveMoneyPerSec).toNumber();
    let t = s;
    for (let i = 0; i < 10; i++) t = tick(t, 100);
    const real = t.resources.money.sub(s.resources.money).toNumber();
    expect(net / real).toBeCloseTo(1, 1);
    // The mods-blind figure the bar used to quote is well off what the product earns.
    const blind = productMetrics(p, s.products.frontier).margin - d.payrollPerSec.toNumber();
    expect(Math.abs(blind / real - 1)).toBeGreaterThan(0.2);
  });
});
