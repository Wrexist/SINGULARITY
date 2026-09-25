import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GrandChallengesPanel } from "./GrandChallengesPanel";
import { createInitialState } from "../engine/state";
import { challenges as C } from "../engine/balance/challenges";
import type { GameState } from "../engine/types";

/**
 * "Mandates held" on the Megaproject card (bug hunt r4, number formatting). Mandates
 * stack multiplicatively (+12% a pick), and the summary printed each lane as a raw
 * Math.round((mult − 1) × 100): a lab that stacked 100 Compute Mandates read
 * "+8352127% C", and past ~390 the number went exponential — "+4.866414170442524e+21%
 * C" — in a one-line chip on a phone card.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(GrandChallengesPanel, {
    game, onFund: noop, onChooseFork: noop, onFundMegaproject: noop, onPickMandate: noop,
  }));

function withMandates(ids: string[]): GameState {
  const s = createInitialState();
  s.prestige.ships = 60;
  s.challenges = { funded: {}, completed: C.list.map((c) => c.id), forks: {} };
  s.megaprojects = { ...s.megaprojects, level: ids.length, mandates: ids };
  return s;
}

const summary = (html: string) => /class="mandate-held-mult">(.*?)<\/span>/.exec(html)?.[1] ?? null;

describe("the Mandates held summary", () => {
  it("reads a few mandates exactly as before", () => {
    expect(summary(render(withMandates(["mand_compute"])))).toBe("+12% C · +0% D · +0% $");
    expect(summary(render(withMandates(["mand_all", "mand_all"])))).toBe("+10% C · +10% D · +10% $");
  });

  it("keeps a deep stack short and never exponential", () => {
    for (const n of [100, 400, 512]) {
      const s = summary(render(withMandates(Array(n).fill("mand_compute"))));
      expect(s).not.toBeNull();
      expect(s).not.toMatch(/e\+|\d{5,}/);
      expect(s!.length).toBeLessThanOrEqual(32);
    }
    expect(summary(render(withMandates(Array(100).fill("mand_compute"))))).toBe("+8.35M% C · +0% D · +0% $");
  });
});
