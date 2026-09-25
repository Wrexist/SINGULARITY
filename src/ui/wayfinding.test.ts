import { describe, it, expect } from "vitest";
import { goalDestination, nudgeDestination } from "./wayfinding";
import { goalCandidates } from "../engine/goals";
import { advisorItems } from "../engine/advisor";
import { derive } from "../engine/derive";
import { createInitialState } from "../engine/state";

/**
 * The goal strip and the advisor chip are wayfinders: a tap must land on the pane
 * that actually renders the target. Contracts and the daily sponsor live on
 * GOALS › Now (they moved out of Lab › HQ), achievements and milestones on
 * GOALS › Collection, and the ship / era road on the Lab.
 */
describe("goal strip destinations", () => {
  const ctx = { shipReady: false, era: 1, labSectioned: true };

  it("sends a contract goal to GOALS › Now, where the Contracts board lives", () => {
    const s = createInitialState();
    s.prestige.ships = 1;
    const contract = goalCandidates(s).find((g) => g.kind === "contract");
    expect(contract).toBeDefined();
    expect(goalDestination(contract!, ctx)).toEqual({ tab: "goals", goalsSection: "now" });
    // Same before the Lab is sectioned: the destination is not a Lab pane at all.
    expect(goalDestination(contract!, { ...ctx, labSectioned: false })).toEqual({ tab: "goals", goalsSection: "now" });
  });

  it("sends achievements and milestones to GOALS › Collection", () => {
    expect(goalDestination({ kind: "achievement" }, ctx)).toEqual({ tab: "goals", goalsSection: "collection" });
    expect(goalDestination({ kind: "milestone" }, ctx)).toEqual({ tab: "goals", goalsSection: "collection" });
  });

  it("keeps the ship and era road on the Lab", () => {
    expect(goalDestination({ kind: "ship" }, ctx)).toEqual({ tab: "lab", labSection: "research" });
    expect(goalDestination({ kind: "ship" }, { ...ctx, shipReady: true })).toEqual({ tab: "lab", labSection: "hq" });
    expect(goalDestination({ kind: "era" }, { ...ctx, era: 0 })).toEqual({ tab: "lab", labSection: "research" });
    expect(goalDestination({ kind: "era" }, ctx)).toEqual({ tab: "lab", labSection: "hq" });
    // Before the Lab has sections there is no pane to pick.
    expect(goalDestination({ kind: "ship" }, { ...ctx, labSectioned: false })).toEqual({ tab: "lab" });
  });
});

describe("advisor chip destinations", () => {
  it("opens GOALS on Now for a contract claim, whatever horizon was last open", () => {
    const s = createInitialState();
    s.prestige.ships = 1;
    s.contracts.completed = ["boot", "seed_round", "hello_science"];
    const claim = advisorItems(s, derive(s)).find((it) => it.tab === "goals");
    expect(claim?.text).toContain("Ship It");
    expect(nudgeDestination(claim!, true)).toEqual({ tab: "goals", goalsSection: "now" });
  });

  it("deep-links Lab items into their section only once the Lab is sectioned", () => {
    expect(nudgeDestination({ tab: "lab", section: "hq" }, true)).toEqual({ tab: "lab", labSection: "hq" });
    expect(nudgeDestination({ tab: "lab", section: "hq" }, false)).toEqual({ tab: "lab" });
    expect(nudgeDestination({ tab: "products" }, true)).toEqual({ tab: "products" });
  });
});
