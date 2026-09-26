import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { objectiveBoard, claimObjective, canClaimObjective } from "./objectives";
import { objectives as O } from "./balance/objectives";
import { launchDraft, retireProduct } from "./products";
import { fireEmployee } from "./employees";
import { Big } from "./math/Big";
import type { Employee, GameState } from "./types";

/**
 * "Run N live products." / "Employ N specialists." (bug hunt E-staff). These read the
 * LIFETIME counters (products ever launched, people ever hired), so a player with one
 * live product completed "Run 2 live products" by launching, selling and relaunching,
 * and a player who had fired most of the team still completed "Employ 16". They now
 * measure what the card promises — the live products and the current roster — while
 * the "first product" / "first specialist" entries stay lifetime milestones, and a
 * claimed objective stays claimed whatever happens to the counts afterwards.
 */
function onlyOnBoard(id: string): GameState {
  const s = createInitialState();
  s.prestige.ships = 5;
  s.lifetimeMoney = Big.of(1);
  s.objectives = { completed: O.pool.filter((o) => o.id !== id).map((o) => o.id) };
  return s;
}
function launch(s: GameState, n: number): GameState {
  s.products.drafts = [{ id: `d${n}`, quality: 5, ships: 1 }];
  return launchDraft(s, { draftId: `d${n}`, type: "code", name: `P${n}`, id: `prod-${n}` });
}
const staff = (n: number): Employee[] => Array.from({ length: n }, (_, i) => ({
  id: `emp-${i + 1}`, name: "A B", roleId: "staff_engineer", level: 1, trait: null, assignedProductId: null, training: null,
}));
const view = (s: GameState, id: string) => objectiveBoard(s).find((v) => v.def.id === id)!;

describe("Objectives that promise a CURRENT count measure the current count", () => {
  it("'Run 2 live products' is not met by one live product after a relaunch", () => {
    let s = onlyOnBoard("o_prod2");
    s = launch(s, 1);
    s = retireProduct(s, "prod-1");
    s = launch(s, 2);
    expect(s.stats.productsLaunched).toBe(2); // two launches in the lifetime…
    expect(s.products.active.length).toBe(1); // …but only one product is live
    expect(view(s, "o_prod2").value).toBe(1);
    expect(view(s, "o_prod2").ready).toBe(false);
    s = launch(s, 3);
    expect(view(s, "o_prod2").ready).toBe(true);
  });

  it("'Run 3 live products' counts live products too", () => {
    let s = onlyOnBoard("o_prod3");
    s.stats.productsLaunched = 9;
    s = launch(s, 1);
    expect(view(s, "o_prod3").value).toBe(1);
    expect(view(s, "o_prod3").ready).toBe(false);
  });

  it("'Employ N specialists' counts the current roster, not everyone ever hired", () => {
    for (const id of ["o_emp2", "o_emp3", "o_emp4"]) {
      const target = O.pool.find((o) => o.id === id)!.target;
      const s = onlyOnBoard(id);
      s.stats.employeesHired = target + 5; // hired plenty over the lifetime…
      s.employees = staff(1); // …but fired all but one
      expect(view(s, id).ready).toBe(false);
      s.employees = staff(target);
      expect(view(s, id).ready).toBe(true);
    }
  });

  it("the lifetime 'first product' / 'first specialist' entries stay lifetime", () => {
    const p = onlyOnBoard("o_prod1");
    p.stats.productsLaunched = 1; // launched once, since sold
    expect(view(p, "o_prod1").ready).toBe(true);
    const e = onlyOnBoard("o_emp1");
    e.stats.employeesHired = 1; // hired once, since fired
    expect(view(e, "o_emp1").ready).toBe(true);
  });

  it("a claimed objective never un-completes when the count later drops", () => {
    let s = onlyOnBoard("o_prod2");
    s = launch(launch(s, 1), 2);
    s.employees = staff(4);
    expect(canClaimObjective(s, "o_prod2")).toBe(true);
    s = claimObjective(s, "o_prod2");
    s = retireProduct(retireProduct(s, "prod-1"), "prod-2");
    expect(s.objectives.completed).toContain("o_prod2");
    expect(objectiveBoard(s).some((v) => v.def.id === "o_prod2")).toBe(false);

    let t = onlyOnBoard("o_emp2");
    t.employees = staff(4);
    t = claimObjective(t, "o_emp2");
    for (const e of staff(4)) t = fireEmployee(t, e.id);
    expect(t.objectives.completed).toContain("o_emp2");
    expect(objectiveBoard(t).some((v) => v.def.id === "o_emp2")).toBe(false);
  });
});
