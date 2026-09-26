import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GoalsPanel } from "./GoalsPanel";
import { goalsCounts } from "./goalsCount";
import { advisorItems } from "../engine/advisor";
import { derive } from "../engine/derive";
import { contractBoard } from "../engine/contracts";
import { createInitialState } from "../engine/state";
import type { GameState } from "../engine/types";

const noop = () => {};

/** Render GOALS as the player would see it on the "Now" horizon. */
function renderNow(game: GameState): string {
  return renderToStaticMarkup(
    createElement(GoalsPanel, {
      game,
      section: "now",
      onSection: noop,
      onClaimObjective: noop,
      onClaimContract: noop,
      onClaimSponsor: noop,
      onFundChallenge: noop,
      onChooseFork: noop,
      onFundMegaproject: noop,
      onPickMandate: noop,
      onStartTrial: noop,
      onAbandonTrial: noop,
      onClaimDoctrine: noop,
      onCollectionSeen: noop,
    } as Parameters<typeof GoalsPanel>[0]),
  );
}

/**
 * The GOALS badge and the advisor chip both count ready contracts. Whatever they
 * count, the Goals tab must actually render — a badge that promises a row the
 * player cannot find is the worst kind.
 */
describe("GOALS renders every contract it counts", () => {
  it("shows the Contracts board right after the first Ship, when Ship It is ready", () => {
    // A Ship resets Data to 0 and research to [], which is exactly when "Ship It"
    // (and often "Going Commercial") become claimable.
    const s = createInitialState();
    s.prestige.ships = 1;
    s.contracts.completed = ["boot", "seed_round", "hello_science"];
    expect(s.resources.data.gt(0)).toBe(false);
    expect(s.research.length).toBe(0);
    const ready = contractBoard(s).filter((c) => c.ready).map((c) => c.def.title);
    expect(ready).toContain("Ship It");
    expect(goalsCounts(s).contracts).toBeGreaterThan(0);
    expect(advisorItems(s, derive(s)).some((it) => it.tab === "goals" && it.text.includes("Ship It"))).toBe(true);

    const html = renderNow(s);
    expect(html).toContain("Contracts");
    expect(html).toContain("Ship It");
  });

  it("shows a ready contract even before the first payout", () => {
    const s = createInitialState();
    s.stats.peakComputePerSec = s.stats.peakComputePerSec.add(1e6); // "Boot Sequence" met
    expect(goalsCounts(s).contracts).toBeGreaterThan(0);
    const html = renderNow(s);
    expect(html).toContain("Boot Sequence");
  });

  it("keeps the board after a Ship once its contracts are claimed", () => {
    // The ladder persists across Ships; the board must not blink out between them.
    const s = createInitialState();
    s.prestige.ships = 2;
    s.contracts.completed = ["boot", "seed_round", "hello_science", "ship_it"];
    expect(goalsCounts(s).contracts).toBe(0);
    expect(renderNow(s)).toContain("Contracts");
  });

  it("stays out of a brand-new lab's way", () => {
    expect(renderNow(createInitialState())).not.toContain("Contracts");
  });
});
