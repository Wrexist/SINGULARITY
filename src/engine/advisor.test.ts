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

  it("stays quiet about a finished run (the Claim button is its own CTA)", () => {
    const s = createInitialState();
    s.run = { active: false, progress: 1, readyToClaim: true };
    expect(advisorItems(s).some((i) => i.text.toLowerCase().includes("claim your"))).toBe(false);
    // …and the idle "start a run" nudge must not fire while a claim is waiting.
    expect(advisorItems(s).some((i) => i.text.toLowerCase().includes("start a training run"))).toBe(false);
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

  it("nudges to claim a contract once one is ready on the board", () => {
    const s = createInitialState();
    s.stats.peakComputePerSec = Big.of(1e6); // satisfies the early compute contracts
    // Routes to GOALS, which owns the contract board since the 2026-08
    // consolidation — a nudge that lands the player on a tab the board no longer
    // lives on is worse than no nudge at all.
    expect(advisorItems(s).some((i) => i.tab === "goals" && i.text.toLowerCase().includes("contract"))).toBe(true);
    // …and stays quiet when nothing is ready.
    expect(advisorItems(createInitialState()).some((i) => i.text.toLowerCase().includes("contract"))).toBe(false);
  });

  it("routes every goal-board nudge to GOALS, never to a Lab section", () => {
    // The boards moved; the wayfinding must move with them. Any advisory item
    // mentioning a contract or sponsor must resolve on the GOALS tab, and must not
    // carry a stale Lab section that would deep-link into an empty pane.
    const s = createInitialState();
    s.stats.peakComputePerSec = Big.of(1e6);
    const goalItems = advisorItems(s).filter((i) => /contract|sponsor/i.test(i.text));
    expect(goalItems.length).toBeGreaterThan(0);
    for (const it of goalItems) {
      expect(it.tab).toBe("goals");
      expect(it.section).toBeUndefined();
    }
  });

  it("never nags about affordable shop stock (Reputation perks / Endowment)", () => {
    // 2026-08 noise sweep: "you can afford a Lab Reputation perk" and "you can afford
    // an Endowment level" used to be advisory items. Because the Endowment is an
    // INFINITE Reputation sink, the second was true on essentially every mature save —
    // so between them they kept the Lab nav badge and the HQ dot permanently lit, which
    // teaches players that badges mean nothing. The advisor is now reserved for things
    // genuinely WAITING on the player; affordable stock is legible in the panel that
    // sells it. This test pins that: a rep-rich save must produce NO such item.
    const s = createInitialState();
    s.stats.totalShips = 100; // plenty of reputation earned, none spent
    expect(advisorItems(s).some((i) => i.text.includes("Lab Reputation"))).toBe(false);
    expect(advisorItems(s).some((i) => i.text.includes("Endow"))).toBe(false);
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
      // Staff open + a LIVE product + cash on hand: the hire nudge actually
      // fires here, so the employees-tab assertion below is exercised for real.
      (() => {
        let s = shipped();
        s.research = ["seed"];
        s.employees = [];
        s.products.drafts = [];
        s = releaseProduct(s, { type: "general", name: "P", id: "p1" });
        s.products.active[0]!.quality = s.products.frontier;
        return s;
      })(),
    ];

    const seenTabs = new Set<string>();
    for (const s of states) {
      for (const item of advisorItems(s)) {
        seenTabs.add(item.tab);
        if (item.tab === "products") expect(productsUnlocked(s)).toBe(true);
        if (item.tab === "employees") expect(staffOpen(s)).toBe(true);
        // "lab" is always renderable — no assertion needed.
      }
    }
    // Guard against a vacuous sweep: the gated tabs must actually appear.
    expect(seenTabs.has("products")).toBe(true);
    expect(seenTabs.has("employees")).toBe(true);
  });

  it("nudges the first hire only once a product is LIVE and a hire is affordable", () => {
    let s = shipped();
    s.research = ["seed"]; // meets revealAtResearch = 1 → staff unlocked
    s.employees = [];
    s.products.drafts = [];
    // Staff unlocked but no project running yet → no nudge (owner report: it
    // fired minutes into a fresh run, long before hiring made sense).
    expect(advisorItems(s).some((i) => i.text.includes("first specialist"))).toBe(false);
    s = releaseProduct(s, { type: "general", name: "P", id: "p1" });
    s.products.active[0]!.quality = s.products.frontier; // healthy, no stale item noise
    const items = advisorItems(s);
    expect(items.some((i) => i.tab === "employees" && i.text.includes("first specialist"))).toBe(true);
    // …and stays quiet when the signing bonus is out of reach.
    s.resources.money = Big.of(0);
    expect(advisorItems(s).some((i) => i.text.includes("first specialist"))).toBe(false);
  });
});
