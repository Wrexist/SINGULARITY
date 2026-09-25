import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Celebration, type ShipReport } from "./Celebration";
import { Big } from "../engine/math/Big";

/**
 * The AGI ascension ceremony (bug hunt r2, render/shell). headlines.ts gives an
 * ascension its own tier ("The Singularity Files Its Own Press Release" / "History
 * splits into before and after."), and Celebration takes an `ascended` prop for it —
 * but the prop only reached the gold confetti. The report handed to the headline and
 * subtitle never carried it, so the grandest beat in the game got a generic headline
 * ("Market Leader — You're #1", "The Scaling Triumph", …) on a gilded card.
 */

const report: ShipReport = {
  gen: 9, rank: 1, peakCompute: Big.of(1e20), peakMrr: 1e9,
  era: 5, alignment: 0, productsLive: 3, rivalsBeaten: 6,
};

const render = (ascended: boolean) =>
  renderToStaticMarkup(createElement(Celebration, {
    weightsGained: Big.of(1e6), totalWeights: Big.of(1e9), report, ascended, onDone: () => {},
  }));

const headline = (html: string) => html.match(/<h2[^>]*>(.*?)<\/h2>/)?.[1];
const subtitle = (html: string) => html.match(/class="celebrate-sub">(.*?)<\/p>/)?.[1];

describe("ascension ceremony copy", () => {
  it("an ascension gets its own headline and subtitle, above every other standout", () => {
    const html = render(true);
    expect(html).toContain("celebrate-card ascended"); // the gilded card already worked
    expect(headline(html)).toBe("The Singularity Files Its Own Press Release");
    expect(subtitle(html)).toBe("History splits into before and after. You banked:");
  });

  it("an ordinary ship with the same stats keeps its earned headline", () => {
    const html = render(false);
    expect(html).not.toContain("celebrate-card ascended");
    expect(headline(html)).toBe("Market Leader — You&#x27;re #1");
  });
});
