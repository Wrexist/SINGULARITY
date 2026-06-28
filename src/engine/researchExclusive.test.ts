import { describe, it, expect } from "vitest";
import { researchAvailable, researchLockedOut, buyResearch, canBuyResearch } from "./actions";
import { prestige } from "./prestige";
import { balance } from "./balance/config";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

// Own the entire NON-exclusive tree (so every prerequisite is met) with resources
// to spend — this is the state where the "pick one" choices become available.
function atChoices() {
  const s = createInitialState();
  s.resources.compute = Big.of(1e9);
  s.resources.data = Big.of(1e9);
  s.research = balance.research.filter((r) => !r.exclusiveGroup).map((r) => r.id);
  return s;
}

describe("mutually-exclusive research branches", () => {
  it("both options in a group are available before you pick", () => {
    const s = atChoices();
    expect(researchAvailable(s, "sparse_arch")).toBe(true);
    expect(researchAvailable(s, "dense_scaling")).toBe(true);
    expect(researchLockedOut(s, "sparse_arch")).toBe(false);
  });

  it("buying one locks out its sibling for the run", () => {
    let s = atChoices();
    expect(canBuyResearch(s, "sparse_arch")).toBe(true);
    s = buyResearch(s, "sparse_arch");
    expect(s.research).toContain("sparse_arch");
    expect(researchAvailable(s, "dense_scaling")).toBe(false);
    expect(researchLockedOut(s, "dense_scaling")).toBe(true);
    expect(buyResearch(s, "dense_scaling")).toBe(s); // pure no-op — locked sibling
  });

  it("the two exclusive groups are independent", () => {
    let s = atChoices();
    s = buyResearch(s, "sparse_arch"); // architecture group
    // The doctrine group is untouched.
    expect(researchAvailable(s, "aligned_path")).toBe(true);
    expect(researchAvailable(s, "accelerationist_path")).toBe(true);
  });

  it("a fresh run (post-prestige) re-opens every choice (research resets)", () => {
    // Drive this through the REAL prestige reset, not createInitialState(), so it
    // would catch a regression where the ship path forgot to clear prior choices.
    let s = atChoices(); // atChoices already owns the capability gate (a non-exclusive node)
    s.lifetimeMoney = Big.of(1e9);
    s = buyResearch(s, "sparse_arch"); // commit to choices this run…
    s = buyResearch(s, "aligned_path");
    const fresh = prestige(s, "deploy"); // …then ship
    expect(fresh.research).toHaveLength(0); // research really did reset
    for (const id of ["sparse_arch", "dense_scaling", "aligned_path", "accelerationist_path"]) {
      expect(researchLockedOut(fresh, id)).toBe(false);
    }
  });
});
