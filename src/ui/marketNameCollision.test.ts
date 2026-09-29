import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { ProductsPanel } from "./ProductsPanel";
import { hookHost, findElements } from "./hookHost";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { releaseProduct } from "../engine/products";
import { market as MARKET } from "../engine/balance/market";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The player names their own products, and nothing stops a name that matches a rival
 * on the market board ("Claudius" as a joke, or on purpose to spite it). The board's
 * row markers matched rows by NAME alone, so with a Frontier Race stake on Claudius the
 * player's own "Claudius" row also wore the "staked" tag, as if the player had bet
 * against themselves (seen in the built app at 320px, r7 hostile-text hunt).
 */

const RIVAL = MARKET.rivals[1]!.name;

function lab(): GameState {
  let s = createInitialState();
  s.prestige = { ...s.prestige, ships: 3 };
  s.resources = { ...s.resources, compute: Big.of(1e12), data: Big.of(1e12), money: Big.of(1e9) };
  s = releaseProduct(s, { type: "general", name: RIVAL, id: "prod-1" });
  s.products.active[0]!.mau = 10; // well behind every rival, so the stake is live
  return { ...s, rivalStake: RIVAL };
}

const cls = (el: ReactElement) => String((el.props as { className?: unknown }).className ?? "");

describe("a product named like a rival", () => {
  it("does not wear the rival's 'staked' tag on the player's own row", () => {
    const game = lab();
    const noop = () => {};
    const props = {
      game, derived: derive(game),
      onLaunchDraft: noop, onStartUpgrade: noop, onSetPrice: noop, onSetMarketing: noop,
      onSetEnterprise: noop, onSetEnterprisePrice: noop, onSetChannelMix: noop, onBuyFeature: noop,
      onRename: noop, onRetire: noop, onSetFlagship: noop, onCounterRival: noop, onPlaceStake: noop,
    };
    const host = hookHost();
    let tree = host.render(ProductsPanel, props) as ReactElement;
    const head = findElements(tree, (el) => cls(el) === "prod-ms-head" && (el.props as { "aria-expanded"?: unknown })["aria-expanded"] !== undefined)[0]!;
    (head.props as { onClick: () => void }).onClick();
    tree = host.render(ProductsPanel, props) as ReactElement;
    const rows = findElements(tree, (el) => cls(el).startsWith("market-row"));
    const staked = rows.filter((r) => findElements(r, (el) => cls(el) === "market-staked").length > 0);
    expect(rows.length).toBeGreaterThan(1);
    expect(staked).toHaveLength(1);
    expect(cls(staked[0]!)).not.toContain("you");
  });
});
