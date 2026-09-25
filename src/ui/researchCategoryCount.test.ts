import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResearchPanel } from "./ResearchPanel";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Research category counts (bug hunt r3). The "Recommended next" card is pulled out
 * of its category, and the category header counted only the rows left behind. So the
 * category holding the recommended node read one short: Foundations showed "3/3" with
 * no check while Data Augmentation, its fourth node, was still to buy (and "0/2" on a
 * fresh run that shows three of its nodes). Epoch categories already counted every node.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(ResearchPanel, { game, derived: derive(game), onResearch: noop, onBuyPreprint: noop }));

/** The "owned/total" text on a category header, by category name. */
function headerCount(html: string, name: string): string | null {
  const re = new RegExp(`<span class="research-cat-name">${name}</span><span class="research-cat-count">(?:<svg.*?</svg> )?([0-9]+/[0-9]+)</span>`);
  return re.exec(html)?.[1] ?? null;
}

describe("a research category counts the node recommended out of it", () => {
  it("does not read complete while its recommended node is still to buy", () => {
    const s = createInitialState();
    s.research = ["backprop", "curated_data", "mixed_precision"];
    s.resources = { ...s.resources, compute: Big.ZERO, data: Big.of(700) };
    const html = render(s);
    // Data Augmentation (Foundations) is the one affordable node → the hero card.
    expect(html).toMatch(/node-hero[^"]*"[^>]*>.*?Data Aug/);
    expect(headerCount(html, "Foundations")).toBe("3/4");
  });

  it("counts the recommended first node on a fresh run", () => {
    const html = render(createInitialState());
    expect(headerCount(html, "Foundations")).toBe("0/3");
  });
});
