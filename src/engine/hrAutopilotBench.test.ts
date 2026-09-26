import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { applyAutomation, toggleAutomation } from "./automation";
import { assignEmployee } from "./employees";
import { launchDraft, retireProduct } from "./products";
import { serialize, deserialize } from "./save";
import { prestige } from "./prestige";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { Employee, GameState } from "./types";

/**
 * HR Autopilot vs a manual bench (bug hunt E-staff). The autopilot posted EVERY idle
 * product specialist on every store tick, so when the player tapped a crew avatar or
 * "send to Lab" to bench someone (benched staff buff every product), the next 100 ms
 * tick put them straight back on a product — the bench appeared to do nothing, and
 * bench strategies were impossible with the autopilot on. A player's bench now sticks
 * until the player places that person again; people who are idle for any other reason
 * (a fresh hire, a sold product, a new generation) are still posted as before.
 */
const hire = (id: string, over: Partial<Employee> = {}): Employee => ({
  id, name: "A B", roleId: "staff_sales", level: 1, trait: null, assignedProductId: null, training: null, ...over,
});

function withProduct(): GameState {
  let s = createInitialState();
  s.prestige.ships = 5; // HR Autopilot unlocks at 4
  s.products.drafts = [{ id: "d1", quality: 5, ships: 1 }];
  s = launchDraft(s, { draftId: "d1", type: "code", name: "C", id: "prod-1" });
  return toggleAutomation(s, "auto_assign");
}
const where = (s: GameState, id: string) => s.employees.find((e) => e.id === id)!.assignedProductId;

describe("HR Autopilot respects a manual bench", () => {
  it("still posts a fresh hire to a product", () => {
    const s = { ...withProduct(), employees: [hire("emp-1")] };
    expect(where(applyAutomation(s), "emp-1")).toBe("prod-1");
  });

  it("does not undo the player benching someone", () => {
    let s = { ...withProduct(), employees: [hire("emp-1", { assignedProductId: "prod-1" })] };
    s = assignEmployee(s, "emp-1", null); // player: "send to Lab"
    expect(where(s, "emp-1")).toBe(null);
    for (let i = 0; i < 5; i++) s = applyAutomation(s); // several store ticks
    expect(where(s, "emp-1")).toBe(null);
  });

  it("a benched person placed again by the player is managed normally afterwards", () => {
    let s = { ...withProduct(), employees: [hire("emp-1")] };
    s = assignEmployee(s, "emp-1", null);
    s = assignEmployee(s, "emp-1", "prod-1"); // player puts them back
    expect(where(s, "emp-1")).toBe("prod-1");
    s = retireProduct(s, "prod-1"); // product sold → crew freed (not a player bench)
    expect(where(s, "emp-1")).toBe(null);
    s.products.drafts = [{ id: "d2", quality: 5, ships: 1 }];
    s = launchDraft(s, { draftId: "d2", type: "code", name: "D", id: "prod-2" });
    expect(where(applyAutomation(s), "emp-1")).toBe("prod-2");
  });

  it("the bench survives a save round-trip", () => {
    let s = { ...withProduct(), employees: [hire("emp-1", { assignedProductId: "prod-1" })] };
    s = assignEmployee(s, "emp-1", null);
    const loaded = deserialize(serialize(s));
    expect(where(applyAutomation(loaded), "emp-1")).toBe(null);
  });

  it("a placement onto a product that has gone away is not treated as a bench", () => {
    let s = { ...withProduct(), employees: [hire("emp-1")] };
    s = assignEmployee(s, "emp-1", "prod-gone"); // stale drop target
    expect(where(s, "emp-1")).toBe(null);
    expect(where(applyAutomation(s), "emp-1")).toBe("prod-1");
  });
});

describe("a new generation clears the hand bench", () => {
  // The bench is a choice about THIS run's crews. A Ship resets every assignment
  // ("the lab is fresh"), and the fix above promised that people idle because of a new
  // generation are posted as before — but prestige() kept `benched: true`, so someone
  // benched once in generation 5 was skipped by the autopilot in every generation after,
  // sitting in "Available · 1 idle" for good (r4 bug hunt, journeys gens 3–8).
  const shippable = (s: GameState): GameState => ({
    ...s, research: [balance.prestige.capabilityResearch], lifetimeMoney: Big.of(1e9),
  });

  it("the autopilot posts a person benched last run once the lab ships", () => {
    let s = { ...withProduct(), employees: [hire("emp-1", { assignedProductId: "prod-1" }), hire("emp-2")] };
    s = assignEmployee(s, "emp-1", null); // player: "send to Lab"
    s = applyAutomation(s);
    expect(where(s, "emp-1")).toBe(null); // the bench holds for the rest of the run
    const fresh = prestige(shippable(s), "deploy");
    expect(fresh.employees.every((e) => e.benched === undefined)).toBe(true);
    const next = applyAutomation(fresh);
    expect(where(next, "emp-1")).toBe("prod-1");
    expect(where(next, "emp-2")).toBe("prod-1");
  });

  it("a bench made in the new run holds again", () => {
    let s = { ...withProduct(), employees: [hire("emp-1", { assignedProductId: "prod-1" })] };
    s = assignEmployee(s, "emp-1", null);
    let fresh = applyAutomation(prestige(shippable(s), "deploy"));
    fresh = assignEmployee(fresh, "emp-1", null);
    for (let i = 0; i < 3; i++) fresh = applyAutomation(fresh);
    expect(where(fresh, "emp-1")).toBe(null);
  });
});

describe("save v38: the hand-bench flag", () => {
  it("a v36 save loads with nobody benched by hand (the autopilot manages them as before)", () => {
    const s = { ...withProduct(), employees: [hire("emp-1"), hire("emp-2", { assignedProductId: "prod-1" })] };
    const raw = JSON.parse(serialize(s));
    raw.version = 36;
    for (const e of raw.employees) delete e.benched;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.version).toBe(39);
    expect(loaded.employees.every((e) => e.benched === undefined)).toBe(true);
    expect(where(applyAutomation(loaded), "emp-1")).toBe("prod-1");
  });

  it("sanitizes the flag: only a literal true survives, junk loads as not benched", () => {
    const s = { ...withProduct(), employees: [hire("emp-1"), hire("emp-2"), hire("emp-3")] };
    const raw = JSON.parse(serialize(s));
    raw.employees[0].benched = true;
    raw.employees[1].benched = "yes";
    raw.employees[2].benched = 1;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.employees.map((e) => e.benched)).toEqual([true, undefined, undefined]);
    expect(loaded.employees).toHaveLength(3); // filtered, never wiped
  });
});
