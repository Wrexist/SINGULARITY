import { describe, it, expect } from "vitest";
import { advisorItems } from "./advisor";
import { labReveal } from "./reveal";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

/** The first-research chip must land on a Research section that is drawn (r3 bug hunt). */
describe("first-research advisor chip", () => {
  it("waits for the Research section to open before pointing at it", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(5_000); // the first node's Compute banked before any run paid Data
    expect(labReveal(s).research).toBe(false);
    const items = advisorItems(s);
    expect(items.some((i) => i.section === "research")).toBe(false);
    expect(items.some((i) => i.text.startsWith("Start a training run"))).toBe(true);
  });

  it("points at Research once it is drawn", () => {
    const s = createInitialState();
    s.resources.compute = Big.of(5_000);
    s.resources.data = Big.of(1);
    expect(labReveal(s).research).toBe(true);
    expect(advisorItems(s).some((i) => i.section === "research" && i.text === "Research your first capability")).toBe(true);
  });
});
