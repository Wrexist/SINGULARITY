import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChallengeComplete } from "./ChallengeComplete";
import { challenges as C, type GrandChallenge } from "../engine/balance/challenges";

/**
 * The "Grand Challenge complete" moment for a FORKED challenge (bug hunt r2,
 * events #4). A forked moonshot grants nothing until the player picks one of its
 * two arms, and the arms differ (Fusion: +35% Compute OR +35% revenue). The moment
 * printed the top-level preview reward — "+35% Compute, forever" — as a gift tag,
 * so it announced a reward that was not active and might never be (the player may
 * take the other arm), and never said a choice was waiting.
 */

const render = (challenge: GrandChallenge) =>
  renderToStaticMarkup(createElement(ChallengeComplete, { challenge, onDone: () => {} }));

describe("ChallengeComplete — forked rewards", () => {
  it("a forked challenge names both arms and promises neither", () => {
    const fusion = C.list.find((c) => c.id === "fusion_dc")!;
    const html = render(fusion);
    for (const arm of fusion.forks!) expect(html).toContain(arm.label);
    expect(html).not.toContain(fusion.reward.desc);
  });

  it("every forked challenge shows its choice, every fixed one its reward", () => {
    for (const c of C.list) {
      const html = render(c);
      if (c.forks) for (const arm of c.forks) expect(html, c.id).toContain(arm.label);
      else expect(html, c.id).toContain(c.reward.desc);
    }
  });
});
