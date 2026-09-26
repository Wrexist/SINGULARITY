import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { launchDraft } from "../engine/products";
import { productMilestones } from "../engine/balance/products";
import type { GameState } from "../engine/types";

/**
 * Product milestones that land on the same tick (bug hunt round 3). The store named
 * only the FIRST new milestone, so the rest paid their Money in silence. The very
 * first launch hits two at once — a shipped model launches at the frontier, which is
 * "Hello, World" and "Market Leader" (+$120,000) together — and the player was told
 * about the $5,000 one only.
 */
function firstLaunch(): GameState {
  let s = createInitialState();
  s.prestige.ships = 1;
  s.products.drafts = [{ id: "draft-1", quality: s.products.frontier, ships: 1 }];
  s = launchDraft(s, { draftId: "draft-1", type: "general", name: "P", id: "p1" });
  return s;
}

describe("product milestone notices", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // no world / product events
    useGame.setState({ game: firstLaunch(), offline: null, notice: null, event: null, worldEvent: null });
  });

  it("announces every milestone reached on one tick, with the Money they paid", () => {
    const milestoneNotices: string[] = [];
    for (let i = 0; i < 60; i++) {
      useGame.getState().advance(100, 100);
      const n = useGame.getState().notice;
      if (n?.kind === "milestone" && !milestoneNotices.includes(n.message)) milestoneNotices.push(n.message);
    }
    const reached = useGame.getState().game.products.milestones;
    expect(reached).toEqual(expect.arrayContaining(["first_launch", "dominant"]));
    for (const id of ["first_launch", "dominant"]) {
      const def = productMilestones.find((d) => d.id === id)!;
      expect(milestoneNotices.some((m) => m.includes(def.label))).toBe(true);
    }
    const total = productMilestones.filter((d) => reached.includes(d.id)).reduce((a, d) => a + d.reward, 0);
    expect(milestoneNotices.some((m) => m.includes(`$${total.toLocaleString()}`))).toBe(true);
  });
});
