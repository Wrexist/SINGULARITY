import { describe, it, expect } from "vitest";
import { advisorItems, nextAction, attentionCounts } from "./advisor";
import { releaseProduct } from "./products";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

function shipped() {
  const s = createInitialState();
  s.prestige.ships = 1;
  s.resources.compute = Big.of(1e9);
  s.resources.data = Big.of(1e9);
  s.resources.money = Big.of(1e6);
  return s;
}

describe("advisor", () => {
  it("stays silent before products unlock", () => {
    expect(advisorItems(createInitialState())).toHaveLength(0);
    expect(nextAction(createInitialState())).toBeNull();
  });

  it("nudges to ship when products are unlocked but the portfolio is empty", () => {
    const s = shipped(); // no research yet, so staff is locked → no hire nudge
    s.research = [];
    const top = nextAction(s);
    expect(top?.tab).toBe("lab");
    expect(top?.text.toLowerCase()).toContain("ship");
  });

  it("prioritises launching a waiting draft over shipping again", () => {
    const s = shipped();
    s.products.drafts = [{ id: "d1", ships: 1, quality: s.products.frontier }];
    const top = nextAction(s);
    expect(top?.tab).toBe("products");
    expect(top?.text.toLowerCase()).toContain("launch");
  });

  it("stays quiet about a healthy, current product", () => {
    let s = shipped();
    s.research = [];
    s = releaseProduct(s, { type: "general", name: "Healthy", id: "p1" });
    s.products.active[0]!.quality = s.products.frontier; // qf = 1, not stale
    expect(advisorItems(s).some((i) => i.text.includes("Healthy"))).toBe(false);
  });

  it("does NOT nudge to launch a draft when every portfolio slot is full", () => {
    let s = shipped();
    s.research = [];
    for (let i = 0; i < 99; i++) {
      s = releaseProduct(s, { type: "general", name: `P${i}`, id: `p${i}` });
    }
    // Portfolio is now capped; a waiting draft can't be launched.
    s.products.drafts = [{ id: "d1", ships: 1, quality: s.products.frontier }];
    expect(advisorItems(s).some((i) => i.text.toLowerCase().includes("launch"))).toBe(false);
  });

  it("flags a stale product and counts it on the Products tab", () => {
    let s = shipped();
    s.research = [];
    s = releaseProduct(s, { type: "general", name: "Relic", id: "p1" });
    s.products.frontier = 100;
    s.products.active[0]!.quality = 1; // qf ≈ 0.01 → far behind
    const counts = attentionCounts(s);
    expect(counts.products).toBeGreaterThanOrEqual(1);
    expect(advisorItems(s).some((i) => i.text.includes("behind rivals"))).toBe(true);
  });

  it("nudges the first hire once staff is unlocked", () => {
    const s = shipped(); // research length ≥ revealAtResearch (1) from createInitialState? force it
    s.research = ["seed"]; // meets revealAtResearch = 1
    s.employees = [];
    s.products.drafts = [];
    const items = advisorItems(s);
    expect(items.some((i) => i.tab === "employees" && i.text.includes("first specialist"))).toBe(true);
  });
});
