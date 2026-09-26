import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModifierBar } from "./ModifierBar";
import { applyWorldEvent, grantDailyBoost } from "../engine/actions";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import type { ActiveModifier } from "../engine/types";

/**
 * Two separate effects that happen to share a label (bug hunt r2, events #6). The
 * bar merges chips by label so a per-lane family (the Daily Boost's three ×1.5
 * mults, open-source momentum) reads as one effect. But it merged ANY two chips with
 * the same label: "Breakthrough Paper" and "Datacenter Tax Break" are both
 * "Compute ×1.5" and stack to ×2.25, yet the bar showed one ×1.5 chip; a GPU Shortage
 * on top of a Global GPU Shortage (×0.36) showed one ×0.6 setback, and the hidden
 * one could not be worked from the bar at all.
 */

const render = (modifiers: ActiveModifier[]) =>
  renderToStaticMarkup(createElement(ModifierBar, { modifiers, onWork: () => {}, workShaveSec: 12 }));
const chips = (html: string) => html.match(/class="modchip /g)?.length ?? 0;

describe("ModifierBar shows every effect that applies", () => {
  it("two different events with the same label are two chips", () => {
    let s = createInitialState();
    s = applyWorldEvent(s, "breakthrough_paper").state; // Compute ×1.5
    s = applyWorldEvent(s, "tax_break").state; // Compute ×1.5
    const base = derive(createInitialState()).computePerSec;
    expect(derive(s).computePerSec.div(base).toNumber()).toBeCloseTo(2.25, 9); // both apply
    const html = render(s.modifiers);
    expect(html.match(/Compute ×1\.5/g)).toHaveLength(2);
  });

  it("two stacked setbacks are each workable", () => {
    let s = createInitialState();
    s = applyWorldEvent(s, "gpu_shortage").state; // Compute ×0.6
    s = applyWorldEvent(s, "gpu_shortage_global").state; // Compute ×0.6
    expect(render(s.modifiers).match(/<button/g)).toHaveLength(2);
  });

  it("a per-lane family (the Daily Boost, ship momentum) is still one chip", () => {
    const s = grantDailyBoost(createInitialState());
    expect(s.modifiers).toHaveLength(3);
    expect(chips(render(s.modifiers))).toBe(1);
    const momentum = (["computeMult", "dataMult", "moneyMult"] as const).map((target): ActiveModifier => ({
      id: `momentum_${target}`, target, factor: 1.2, remainingSec: 90, label: "Community momentum ×1.2", tone: "good",
    }));
    expect(chips(render([...s.modifiers, ...momentum]))).toBe(2);
  });
});
