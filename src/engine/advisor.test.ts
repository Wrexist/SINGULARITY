import { describe, it, expect } from "vitest";
import { advisorItems, nextAction, attentionCounts } from "./advisor";
import { releaseProduct, productsUnlocked } from "./products";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
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
  it("guides a brand-new player to start their first training run", () => {
    const top = nextAction(createInitialState());
    expect(top?.tab).toBe("lab");
    expect(top?.text.toLowerCase()).toContain("training run");
  });

  it("nudges to claim a finished run during the first session", () => {
    const s = createInitialState();
    s.run = { active: false, progress: 1, readyToClaim: true };
    const top = nextAction(s);
    expect(top?.text.toLowerCase()).toContain("claim");
  });

  it("drops the first-session hand-holding once you've shipped", () => {
    const s = createInitialState();
    s.prestige.ships = 1; // returning player — no more "start a run" nagging
    expect(advisorItems(s).some((i) => i.text.includes("training run"))).toBe(false);
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
    s.products.active[0]!.buzzSec = 0; // past the launch buzz window
    const counts = attentionCounts(s);
    expect(counts.products).toBeGreaterThanOrEqual(1);
    expect(advisorItems(s).some((i) => i.text.includes("behind rivals"))).toBe(true);
  });

  it("does NOT flag a stale product while it's still in its launch buzz window", () => {
    let s = shipped();
    s.research = [];
    s = releaseProduct(s, { type: "general", name: "Fresh", id: "p1" }); // releaseProduct sets buzzSec > 0
    s.products.frontier = 100;
    s.products.active[0]!.quality = 1; // stale on arrival, but buzzed
    expect(s.products.active[0]!.buzzSec).toBeGreaterThan(0);
    expect(advisorItems(s).some((i) => i.text.includes("behind rivals"))).toBe(false);
  });

  it("nudges to spend Lab Reputation when a perk is affordable", () => {
    const s = createInitialState();
    s.stats.totalShips = 100; // plenty of reputation earned, none spent
    expect(advisorItems(s).some((i) => i.text.includes("Lab Reputation"))).toBe(true);
    // …and not when there's nothing to spend.
    expect(advisorItems(createInitialState()).some((i) => i.text.includes("Lab Reputation"))).toBe(false);
  });

  it("never points the banner at a tab the player can't open yet", () => {
    // The App renders the advisor item's `tab` as a tappable banner that jumps
    // there. If an item targeted a still-locked tab, the tap would dead-end. Sweep
    // a spread of representative states and assert every item resolves to a tab
    // that is actually renderable given the same gates the UI uses.
    const staffOpen = (s: ReturnType<typeof createInitialState>) =>
      balance.staff.enabled && s.research.length >= balance.staff.revealAtResearch;

    const states = [
      createInitialState(), // fresh: products + staff locked
      (() => { const s = createInitialState(); s.run = { active: false, progress: 1, readyToClaim: true }; return s; })(),
      (() => { const s = shipped(); s.research = []; return s; })(), // products unlocked, staff locked
      (() => { const s = shipped(); s.research = ["seed"]; s.employees = []; s.products.drafts = []; return s; })(), // staff open
      (() => { const s = shipped(); s.products.drafts = [{ id: "d1", ships: 1, quality: s.products.frontier }]; return s; })(),
    ];

    for (const s of states) {
      for (const item of advisorItems(s)) {
        if (item.tab === "products") expect(productsUnlocked(s)).toBe(true);
        if (item.tab === "employees") expect(staffOpen(s)).toBe(true);
        // "lab" is always renderable — no assertion needed.
      }
    }
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
