import { describe, it, expect, vi } from "vitest";

// Open the product sheet on its Marketing tab (its only view state is the tab), and
// render the sheet in place: the Portal targets document.body, which a server render
// does not have.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: <T,>(init: T | (() => T)) => {
      const v = typeof init === "function" ? (init as () => T)() : init;
      return [(v === "overview" ? "marketing" : v) as T, () => {}] as const;
    },
  };
});
vi.mock("./Portal", () => ({ Portal: ({ children }: { children: unknown }) => children }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductDetail } from "./ProductDetail";
import { createInitialState } from "../engine/state";
import { simulateProducts } from "../engine/products";
import type { GameState, ProductState } from "../engine/types";

/**
 * Dragging every channel slider to zero does not stop the campaign: the sim spends the
 * whole budget on Paid Ads (its fallback, so a budget never burns for nothing). The
 * Marketing tab still read "0%" on every channel — including the one taking all of it.
 */
function lab(mix: Record<string, number>): { s: GameState; p: ProductState } {
  const s = createInitialState();
  s.prestige.ships = 4;
  const p: ProductState = {
    id: "p1", name: "Chat", type: "general", version: 1, quality: 10, priceMult: 1, enterprise: false,
    enterprisePrice: 1, marketingPerSec: 5_000, channelMix: mix, mau: 1_000, paid: 10, buzzSec: 0,
    ageSec: 5_000, upgrade: null, features: [],
  };
  s.products = { ...s.products, frontier: 10, active: [p] };
  return { s, p };
}

const render = (s: GameState) => renderToStaticMarkup(createElement(ProductDetail, {
  game: s, productId: "p1",
  onClose: () => {}, onStartUpgrade: () => {}, onSetPrice: () => {}, onSetMarketing: () => {},
  onSetEnterprise: () => {}, onSetEnterprisePrice: () => {}, onSetChannelMix: () => {},
  onBuyFeature: () => {}, onRename: () => {}, onRetire: () => {}, onSetFlagship: () => {},
}));

/** Channel name → the share its card shows. */
function shares(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/pd-channel-name">([^<]+)<\/span>.*?pd-channel-pct">([^<]+)</g)) out[m[1]!] = m[2]!;
  return out;
}

describe("the Marketing tab's channel split", () => {
  it("an all-zero split still buys users exactly as 100% Paid Ads does", () => {
    const zero = lab({ ads: 0, organic: 0 });
    const ads = lab({ ads: 1 });
    const grow = (x: { s: GameState }) => simulateProducts(x.s.products, 10).products.active[0]!.mau;
    expect(grow(zero)).toBeCloseTo(grow(ads), 6);
  });

  it("shows that spend on Paid Ads instead of 0% everywhere", () => {
    const got = shares(render(lab({ ads: 0, organic: 0 }).s));
    expect(got["Paid Ads"]).toBe("100%");
    expect(got["Organic / Social"]).toBe("0%");
  });

  it("an ordinary split is unchanged", () => {
    const got = shares(render(lab({ ads: 0.5, organic: 0.5 }).s));
    expect(got["Paid Ads"]).toBe("50%");
    expect(got["Organic / Social"]).toBe("50%");
  });
});
