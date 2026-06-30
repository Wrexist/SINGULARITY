/**
 * Research categories — pure accessors over the category data
 * (`balance/researchCategories.ts`). Presentation-only legibility helper: groups
 * the research tree into themed sections so the panel can reveal structure in
 * waves. No clock, no RNG, no gameplay effect → curve-safe and unit-testable.
 */
import { researchCategories, researchCategoryOf, type ResearchCategoryDef } from "./balance/researchCategories";

const FALLBACK = "frontier";

/** The category id a research node belongs to (defaults to the last category so a
 *  newly-added, unmapped node still renders rather than vanishing). */
export function categoryOf(researchId: string): string {
  return researchCategoryOf[researchId] ?? FALLBACK;
}

/** Category definition by id (used for the header label + blurb). */
export function categoryDef(categoryId: string): ResearchCategoryDef | undefined {
  return researchCategories.find((c) => c.id === categoryId);
}

/**
 * Group research ids into categories in display order, dropping empty groups.
 * Order within each group follows the input order (the balance tree order), so
 * prerequisites still read top-to-bottom inside a category.
 */
export function groupByCategory<T>(
  items: T[],
  idOf: (item: T) => string,
): { category: ResearchCategoryDef; items: T[] }[] {
  return researchCategories
    .map((category) => ({
      category,
      items: items.filter((it) => categoryOf(idOf(it)) === category.id),
    }))
    .filter((g) => g.items.length > 0);
}
