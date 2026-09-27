import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GrandChallengesPanel } from "./GrandChallengesPanel";
import { challenges as C } from "../engine/balance/challenges";
import {
  megaprojectCost, megaprojectView, megaprojectMult, mandateMods, canFundMegaproject, fundMegaproject,
} from "../engine/challenges";
import { derive } from "../engine/derive";
import { tick } from "../engine/tick";
import { serialize, deserialize } from "../engine/save";
import { createInitialState } from "../engine/state";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Megaproject cap (round 8, owner call). Cycles ended at 512; the cap is now 890, the
 * roadmap's suggestion: the last cycle whose cost (×2.2 per cycle) still fits a double
 * with room to spare, so every derived number stays finite and the card stays short.
 */
const CAP = 890;
const noop = () => {};
const MANDATES = C.megaproject.mandates.defs.map((d) => d.id);

/** A lab at `level` cycles with every mandate taken (a mixed stack and a one-lane one). */
function lab(level: number, mix: "mixed" | "compute", wealth = "1e330"): GameState {
  const s = createInitialState();
  const funded = Object.fromEntries(C.list.map((c) => [c.id, {
    compute: Big.of(c.cost.compute), data: Big.of(c.cost.data), money: Big.of(c.cost.money),
  }]));
  const rich = Big.of(wealth);
  return {
    ...s,
    prestige: { ...s.prestige, ships: 60 },
    resources: { compute: rich, data: rich, money: rich },
    challenges: { ...s.challenges, funded, completed: C.list.map((c) => c.id) },
    megaprojects: {
      ...s.megaprojects,
      level,
      mandates: Array.from({ length: level }, (_, i) => (mix === "mixed" ? MANDATES[i % MANDATES.length]! : "mand_compute")),
    },
  };
}

describe(`megaproject cycles run to ${CAP}`, () => {
  it("the cap is balance data at 890", () => {
    expect(C.megaproject.maxLevel).toBe(CAP);
  });

  it("the last cycle can be funded and then the loop stops", () => {
    const below = lab(CAP - 1, "mixed");
    expect(canFundMegaproject(below)).toBe(true);
    const done = fundMegaproject(below);
    expect(done.justCompleted).toBe(true);
    expect(done.state.megaprojects.level).toBe(CAP);
    expect(canFundMegaproject(done.state)).toBe(false);
    expect(megaprojectView(done.state).maxed).toBe(true);
  });

  it("every derived number stays finite at the cap", () => {
    for (const level of [CAP - 1, CAP]) {
      const c = megaprojectCost(level);
      for (const v of [c.compute, c.data, c.money]) {
        expect(v.isFinite()).toBe(true);
        expect(v.gt(0)).toBe(true);
      }
      for (const mix of ["mixed", "compute"] as const) {
        const s = lab(level, mix);
        const view = megaprojectView(s);
        for (const n of [view.progress, view.bonusPct, view.nextBonusPct]) expect(Number.isFinite(n)).toBe(true);
        expect(Number.isFinite(megaprojectMult(s).toNumber())).toBe(true);
        const mm = mandateMods(s);
        for (const v of [mm.compute, mm.data, mm.money]) expect(v.isFinite()).toBe(true);
        const d = derive(s);
        for (const v of [d.computePerSec, d.computeMult, d.dataMult, d.moneyMult, d.runMoneyYield]) {
          expect(v.isFinite()).toBe(true);
          expect(v.gte(0)).toBe(true);
        }
        const t = tick(s, 1000);
        for (const v of [t.resources.compute, t.resources.data, t.resources.money]) expect(v.isFinite()).toBe(true);
      }
    }
  });

  it("a save at the cap loads every cycle and mandate back", () => {
    const s = lab(CAP, "mixed");
    const back = deserialize(serialize(s))!;
    expect(back.megaprojects.level).toBe(CAP);
    expect(back.megaprojects.mandates).toHaveLength(CAP);
  });

  it("the card's mandate summary and cost labels stay short at the cap", () => {
    for (const mix of ["mixed", "compute"] as const) {
      for (const level of [CAP - 1, CAP]) {
        const html = renderToStaticMarkup(createElement(GrandChallengesPanel, {
          game: lab(level, mix, "1"), onFund: noop, onChooseFork: noop, onFundMegaproject: noop, onPickMandate: noop,
        }));
        const summary = /class="mandate-held-mult">(.*?)<\/span>/.exec(html)?.[1] ?? null;
        expect(summary).not.toBeNull();
        expect(summary).not.toMatch(/e\+|\d{5,}|NaN|Infinity/);
        expect(summary!.length).toBeLessThanOrEqual(32);
        const text = html.replace(/<[^>]+>/g, " ");
        expect(text).not.toMatch(/NaN|Infinity|e\+|undefined/);
        // Each "funded / cost" pledge on the last open cycle stays a short chip.
        const mega = html.slice(html.indexOf("mega-card"));
        const res = mega.slice(0, mega.indexOf("challenge-foot"));
        const pledges = res.split('class="challenge-pledge ').slice(1).map((c) => c.slice(c.indexOf(">") + 1).replace(/<[^>]+>/g, "").trim());
        if (level === CAP - 1) {
          expect(pledges).toHaveLength(3);
          for (const p of pledges) expect(p.length, p).toBeLessThanOrEqual(24);
        }
      }
    }
  });
});
