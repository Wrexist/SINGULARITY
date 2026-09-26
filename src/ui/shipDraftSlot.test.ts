import { describe, it, expect, vi } from "vitest";

// Open the "How do you ship it?" chooser: the panel's boolean view state starts false,
// so render every boolean useState as true (the chooser, and the Rep sheet with it).
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: <T,>(init: T | (() => T)) => {
      const v = typeof init === "function" ? (init as () => T)() : init;
      return [(v === false ? true : v) as T, () => {}] as const;
    },
  };
});
vi.mock("./Portal", () => ({ Portal: ({ children }: { children: unknown }) => children }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrestigePanel } from "./PrestigePanel";
import { createInitialState } from "../engine/state";
import { prestige } from "../engine/prestige";
import { releaseProduct, maxActiveProducts, canLaunchDraft } from "../engine/products";
import { trialDefs } from "../engine/trials";
import { products as PRODUCTS } from "../engine/balance/products";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The Deploy button's draft tag on a run that banks a product slot (bug hunt r4, guard
 * parity). Unplugged I pays +1 concurrent product slot, banked by the very Ship that
 * ends it. Run it with a full portfolio — the reason to want the slot — and the Ship
 * panel tagged Deploy "Draft parked — portfolio full (3/3)", counting slots before
 * the Ship. After it the portfolio has four, and the shipped model launches at once.
 * The tag pushed a player toward the give-away modes for a product they would have had.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(PrestigePanel, {
    game, onPrestige: noop, onBuyReputationPerk: noop, onBuyEndowment: noop, onPickDirective: noop, onBuyLegacyPerk: noop,
  }));

const U1 = trialDefs().find((d) => d.id === "trial_unplugged")!;

/** A shippable lab running Unplugged I with every product slot taken. */
function lab(activeTrial: string | null): GameState {
  let s = createInitialState();
  s.prestige = { ships: U1.unlockShips + 1, legacyWeights: Big.of(100) };
  s.stats.totalShips = s.prestige.ships;
  s.resources = { compute: Big.of(1e12), data: Big.of(1e12), money: Big.of(1e9) };
  s.lifetimeMoney = Big.of(1e9);
  for (let i = 0; i < PRODUCTS.maxActive; i++) s = releaseProduct(s, { type: "general", name: `P${i}`, id: `p${i}` });
  s.research = balance.research.map((r) => r.id);
  return { ...s, activeTrial };
}

/** The tag line under the Deploy button. */
const deployTags = (html: string) => {
  const btn = html.split('<button class="ship-mode">').slice(1).find((b) => b.includes("Deploy commercially"));
  return btn?.split('<div class="ship-mode-tags">')[1] ?? "";
};

describe("the Deploy draft tag counts the slots the Ship itself banks", () => {
  it("the Ship that banks Unplugged I leaves the draft launchable", () => {
    const s = lab(U1.id);
    expect(s.products.active.length).toBe(maxActiveProducts(s));
    const after = prestige(s, "deploy");
    expect(after.trialsDone).toContain(U1.id);
    expect(after.products.active.length).toBeLessThan(maxActiveProducts(after));
    expect(canLaunchDraft(after, after.products.drafts[after.products.drafts.length - 1]!.id, "general")).toBe(true);
  });

  it("so the tag promises the product, not a parked draft", () => {
    const tags = deployTags(render(lab(U1.id)));
    expect(tags).not.toContain("Draft parked");
    expect(tags).toContain("Product to sell");
  });

  it("still warns when the Ship banks no slot", () => {
    expect(deployTags(render(lab(null)))).toContain("Draft parked");
  });
});
