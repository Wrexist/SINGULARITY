import { describe, it, expect, vi } from "vitest";

// Render the product sheet in place (its Overview tab is the default): the Portal
// targets document.body, which a server render does not have.
vi.mock("./Portal", () => ({ Portal: ({ children }: { children: unknown }) => children }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductDetail } from "./ProductDetail";
import { createInitialState } from "../engine/state";
import { releaseProduct } from "../engine/products";
import { setFlagship, flagshipMoneyMult, flagshipBrandLost } from "../engine/flagship";
import { products as PRODUCTS } from "../engine/balance/products";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The flagship line on the product sheet (bug hunt r4, guard parity). The flagship's
 * brand bonus is earned one Ship at a time — up to +30% of ALL revenue over ten ships —
 * and designating any product starts it at zero. The flagship's own sheet showed that
 * brand as "★ Flagship · +15% revenue — grows each ship you keep it", which reads as a
 * status, but it was the un-designate button: one tap cleared the flagship and threw
 * the tenure away for good (tapping it again starts over at 0). Un-designating never
 * gains anything, so the line is a status now, and only another product's sheet offers
 * the (confirmed) move.
 */

const noop = () => {};
const render = (game: GameState, productId: string) =>
  renderToStaticMarkup(createElement(ProductDetail, {
    game, productId, onClose: noop, onStartUpgrade: noop, onSetPrice: noop, onSetMarketing: noop,
    onSetEnterprise: noop, onSetEnterprisePrice: noop, onSetChannelMix: noop, onBuyFeature: noop,
    onRename: noop, onRetire: noop, onSetFlagship: noop,
  }));

/** Two live products, "a" the flagship with five ships of tenure behind it. */
function lab(): GameState {
  let s = createInitialState();
  s.prestige.ships = 6;
  s.resources = { compute: Big.of(1e9), data: Big.of(1e9), money: Big.of(1e6) };
  s = releaseProduct(s, { type: "general", name: "Nova", id: "a" });
  s = releaseProduct(s, { type: "general", name: "Vega", id: "b" });
  s = setFlagship(s, "a");
  return { ...s, flagship: { productId: "a", tenure: 5 } };
}

/** The flagship control on a sheet: its tag, and whether it is a button. */
function flagshipLine(html: string): { tag: string; text: string } | null {
  const m = /<(button|p|div|span)[^>]*class="pd-flagship[^"]*"[^>]*>([^<]*)</.exec(html);
  return m ? { tag: m[1]!, text: m[2]! } : null;
}

describe("the flagship's brand line", () => {
  it("is built up over ships", () => {
    expect(flagshipMoneyMult(lab())).toBeCloseTo(1 + 5 * PRODUCTS.flagship.perShip, 9);
  });

  it("is a status on the flagship's own sheet, not a button that discards the brand", () => {
    const line = flagshipLine(render(lab(), "a"));
    expect(line).not.toBeNull();
    expect(line!.text).toContain("Flagship");
    expect(line!.tag).not.toBe("button");
  });

  it("still lets another product take the flag", () => {
    const line = flagshipLine(render(lab(), "b"));
    expect(line).not.toBeNull();
    expect(line!.tag).toBe("button");
    expect(line!.text).toContain("Make this your flagship");
  });
});

describe("what moving the flag would throw away (the confirm App asks)", () => {
  it("names the built-up brand a move to another product resets", () => {
    expect(flagshipBrandLost(lab(), "b")).toEqual({ productId: "a", tenure: 5, pct: Math.round(5 * PRODUCTS.flagship.perShip * 100) });
    expect(setFlagship(lab(), "b").flagship).toEqual({ productId: "b", tenure: 0 }); // the engine rule it warns about
  });

  it("asks nothing when there is no brand to lose", () => {
    expect(flagshipBrandLost(lab(), "a")).toBeNull(); // already the flagship
    expect(flagshipBrandLost({ ...lab(), flagship: { productId: "a", tenure: 0 } }, "b")).toBeNull(); // no tenure yet
    expect(flagshipBrandLost({ ...lab(), flagship: { productId: null, tenure: 0 } }, "b")).toBeNull(); // first flag
  });

  it("is what a sale of the flagship ends, too", () => {
    expect(flagshipBrandLost(lab(), null)?.productId).toBe("a");
  });
});
