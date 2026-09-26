import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GrandChallengesPanel } from "./GrandChallengesPanel";
import { createInitialState } from "../engine/state";
import { megaprojectMult } from "../engine/challenges";
import { challenges as C } from "../engine/balance/challenges";
import type { GameState } from "../engine/types";

/**
 * The Megaproject reward line (bug hunt, meta r1 #4). Before the first cycle it read
 * "+0.0% to ALL output on first cycle" — the HELD bonus, which is 0 at level 0 —
 * while completing the cycle actually grants +5.0%. It must quote what the first
 * cycle pays, read from the same megaprojectMult the reward uses.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(GrandChallengesPanel, {
    game, onFund: noop, onChooseFork: noop, onFundMegaproject: noop, onPickMandate: noop,
  }));

function everyChallengeDone(level: number): GameState {
  const s = createInitialState();
  s.prestige.ships = 60;
  s.challenges = { funded: {}, completed: C.list.map((c) => c.id), forks: {} };
  s.megaprojects = { ...s.megaprojects, level };
  return s;
}

const pct = (s: GameState) => ((megaprojectMult(s).toNumber() - 1) * 100).toFixed(1);

describe("Megaproject reward line", () => {
  it("before the first cycle, quotes what completing it grants", () => {
    const firstCycle = pct(everyChallengeDone(1));
    expect(Number(firstCycle)).toBeGreaterThan(0);
    const html = render(everyChallengeDone(0));
    expect(html).toContain(`+${firstCycle}% to ALL output on first cycle`);
    expect(html).not.toContain("+0.0%");
  });

  it("after cycles are done, still shows the bonus held", () => {
    const s = everyChallengeDone(3);
    expect(render(s)).toContain(`+${pct(s)}% to ALL output (held)`);
  });
});
