import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { launchDraft } from "./products";
import { applyAutomation, toggleAutomation } from "./automation";
import type { Employee, GameState } from "./types";

/**
 * Crew of a product the loader drops (bug hunt r3, staff). The product sanitizer drops
 * a malformed product entry (a non-finite MAU, an unknown type, a "__proto__" id...) and
 * the flagship pointing at it is cleared — but each person assigned to it kept the dead
 * id. They then sat in no project's crew and off the "Available" list of the Team tab,
 * and the HR Autopilot, which only posts people with no assignment, never re-posted them.
 */
const person = (id: string, productId: string | null): Employee => ({
  id, name: "A B", roleId: "staff_sales", level: 1, trait: null, assignedProductId: productId, training: null,
});

function twoProducts(): GameState {
  let s = createInitialState();
  s.prestige.ships = 5; // products + HR Autopilot unlocked
  s.products.drafts = [{ id: "d1", quality: 5, ships: 1 }, { id: "d2", quality: 5, ships: 2 }];
  s = launchDraft(s, { draftId: "d1", type: "code", name: "Keep", id: "prod-1" });
  s = launchDraft(s, { draftId: "d2", type: "code", name: "Lost", id: "prod-2" });
  s.employees = [person("emp-1", "prod-1"), person("emp-2", "prod-2"), person("emp-3", null)];
  return s;
}

/** Serialize, then corrupt prod-2 so the loader drops it (a non-finite MAU). */
function loadWithProd2Dropped(s: GameState): GameState {
  const raw = JSON.parse(serialize(s));
  raw.products.active.find((p: { id: string }) => p.id === "prod-2").mau = "NaN";
  return deserialize(JSON.stringify(raw));
}

describe("loading a save whose product was dropped", () => {
  it("frees that product's crew and keeps everyone else's assignment", () => {
    const loaded = loadWithProd2Dropped(twoProducts());
    expect(loaded.products.active.map((p) => p.id)).toEqual(["prod-1"]);
    const at = (id: string) => loaded.employees.find((e) => e.id === id)!.assignedProductId;
    expect(at("emp-1")).toBe("prod-1");
    expect(at("emp-2")).toBe(null);
    expect(at("emp-3")).toBe(null);
    expect(loaded.employees).toHaveLength(3); // filter, don't wipe
  });

  it("the HR Autopilot posts the freed specialist again", () => {
    const loaded = toggleAutomation(loadWithProd2Dropped(twoProducts()), "auto_assign");
    const next = applyAutomation(loaded);
    expect(next.employees.find((e) => e.id === "emp-2")!.assignedProductId).toBe("prod-1");
  });

  it("an intact save keeps every assignment", () => {
    const s = twoProducts();
    const loaded = deserialize(serialize(s));
    expect(loaded.employees.map((e) => e.assignedProductId)).toEqual(["prod-1", "prod-2", null]);
  });
});
