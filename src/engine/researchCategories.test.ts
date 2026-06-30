import { describe, it, expect } from "vitest";
import { balance } from "./balance/config";
import { researchCategories, researchCategoryOf } from "./balance/researchCategories";
import { categoryOf, categoryDef, groupByCategory } from "./researchCategories";

describe("research categories (legibility subsystem)", () => {
  it("assigns every research node to a real category", () => {
    const catIds = new Set(researchCategories.map((c) => c.id));
    for (const def of balance.research) {
      const cat = researchCategoryOf[def.id];
      expect(cat, `research '${def.id}' must be categorised`).toBeDefined();
      expect(catIds.has(cat!), `'${def.id}' maps to unknown category '${cat}'`).toBe(true);
    }
  });

  it("has no orphan category entries (every mapped id is a real research node)", () => {
    const ids = new Set(balance.research.map((r) => r.id));
    for (const id of Object.keys(researchCategoryOf)) {
      expect(ids.has(id), `'${id}' in the category map is not a research node`).toBe(true);
    }
  });

  it("category ids are unique", () => {
    const ids = researchCategories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("categoryDef resolves known categories and is undefined otherwise", () => {
    expect(categoryDef("foundations")?.name).toBe("Foundations");
    expect(categoryDef("nope")).toBeUndefined();
  });

  it("groupByCategory preserves input order and drops empty groups", () => {
    const subset = ["scaling_laws", "backprop", "moe"].map((id) => ({ id }));
    const groups = groupByCategory(subset, (x) => x.id);
    // Foundations (backprop) comes before Scale (scaling_laws, moe) in display order.
    expect(groups.map((g) => g.category.id)).toEqual(["foundations", "scale"]);
    // Within Scale, input order is preserved (scaling_laws before moe).
    expect(groups[1]!.items.map((x) => x.id)).toEqual(["scaling_laws", "moe"]);
    // No empty groups leak through.
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("falls back gracefully for an unmapped id", () => {
    expect(categoryOf("totally_new_node")).toBe("frontier");
  });
});
