import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { objectiveBoard } from "../engine/objectives";
import { objectives as O } from "../engine/balance/objectives";
import { createInitialState } from "../engine/state";
import { Big } from "../engine/math/Big";

/**
 * An objective one hair short of its target (bug hunt round 3). The disabled claim
 * button showed Math.round(progress): at 99.5% and up it read "100%" while it could
 * not be claimed, so a player tapped a full "100%" and nothing happened.
 */
describe("Objectives card percentage", () => {
  it("never reads 100% on an objective that is not met", () => {
    const s = createInitialState();
    s.lifetimeMoney = Big.of(1); // past the board's reveal gate
    s.objectives = { completed: O.pool.filter((o) => o.id !== "o_cmp2").map((o) => o.id) };
    s.stats.peakComputePerSec = Big.of(399); // "Reach 400 Compute/sec": 99.75%
    const v = objectiveBoard(s).find((x) => x.def.id === "o_cmp2")!;
    expect(v.ready).toBe(false);

    const html = renderToStaticMarkup(createElement(ObjectivesPanel, { game: s, onClaim: () => {} }));
    const button = html.match(/<button class="objective-claim"[^>]*>([^<]*)<\/button>/);
    expect(button).not.toBeNull();
    expect(button![1]).toBe("99%");
  });
});
