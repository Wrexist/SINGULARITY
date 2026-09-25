import { describe, it, expect, vi } from "vitest";

// Open the product sheet on its Pricing tab (its only view state is the tab), and
// render the sheet in place: the Portal targets document.body, which a server render
// does not have.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: <T,>(init: T | (() => T)) => {
      const v = typeof init === "function" ? (init as () => T)() : init;
      return [(v === "overview" ? "pricing" : v) as T, () => {}] as const;
    },
  };
});
vi.mock("./Portal", () => ({ Portal: ({ children }: { children: unknown }) => children }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductDetail } from "./ProductDetail";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { tick } from "../engine/tick";
import { productMilestones } from "../engine/balance/products";
import { productMetrics } from "../engine/products";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The Pricing tab's "Pro price" is what one paying user brings in per second. It was
 * computed from the base price × dial × quality × features only, so it left out every
 * revenue buff the product actually bills with: the Product Company charter's ×2.5 and
 * any Sales Exec on the product. On a Product Company lab it read $1.0/s per user while
 * the same sheet's Overview said $2.5/s and the product really billed $2.5/s each.
 */
function productCompanyLab(): GameState {
  const s = createInitialState();
  s.prestige.ships = 8;
  s.charter = "product_company";
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  s.products = {
    ...s.products,
    frontier: 10,
    milestones: productMilestones.map((m) => m.id),
    active: [{
      id: "p1", name: "Coder", type: "code", version: 1, quality: 10, priceMult: 1, enterprise: false,
      enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 }, mau: 20_000, paid: 3_192, buzzSec: 0,
      ageSec: 5_000, upgrade: null, features: [],
    }],
  };
  return s;
}

describe("the Pro price on the Pricing tab", () => {
  it("quotes what each paying user really brings in", () => {
    const s = productCompanyLab();
    // What tick() bills: one second of Money is paid subs x (revenue/user - serving/user).
    const mods = derive(s).productModsById.p1!;
    const m = productMetrics(s.products.active[0]!, s.products.frontier, mods);
    expect(m.arpu).toBeCloseTo(2.5, 6);
    const after = tick(s, 1000);
    expect(after.resources.money.sub(s.resources.money).toNumber() / (m.mrr - m.serve)).toBeCloseTo(1, 2);
    const html = renderToStaticMarkup(createElement(ProductDetail, {
      game: s, productId: "p1", mods: derive(s).productModsById.p1,
      onClose: () => {}, onStartUpgrade: () => {}, onSetPrice: () => {}, onSetMarketing: () => {},
      onSetEnterprise: () => {}, onSetEnterprisePrice: () => {}, onSetChannelMix: () => {},
      onBuyFeature: () => {}, onRename: () => {}, onRetire: () => {}, onSetFlagship: () => {},
    }));
    expect(html).toContain("Pro price");
    const quoted = /Pro price[^<]*<\/span><span class="pd-card-value">\$([0-9.]+)\/s ea\./.exec(html)?.[1];
    expect(Number(quoted)).toBeCloseTo(2.5, 1);
  });
});
