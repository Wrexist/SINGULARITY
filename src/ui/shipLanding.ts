import { productsUnlocked, maxActiveProducts } from "../engine/products";
import { automationEnabled } from "../engine/automation";
import type { GameState } from "../engine/types";

/**
 * What the moments after a Ship may promise about the Products tab.
 *
 * The Ship used to toast "Your shipped model is ready — commercialise it free in
 * Products" and, on closing the celebration, jump to Products whenever ANY draft was
 * on the shelf. From generation 3 or so most labs run a full portfolio, so a Deploy
 * parks its draft (the chooser even says "Draft parked — portfolio full"), and an
 * Open-source or Sell ship deposits no draft at all — yet every one of those ships
 * announced a model to launch and landed the player on a list of "Slots full" cards.
 * With the Launch Autopilot on, the model was launched for them on the next tick,
 * moments after the toast told them to go and do it. (r4 bug hunt, journeys gens 3–8.)
 */

/** A shipped model is on the shelf AND a portfolio slot is free, so the Products tab
 *  has something the player can launch right now — the same test the advisor's
 *  "Launch the model you shipped" uses. */
export function draftLaunchable(game: GameState): boolean {
  return productsUnlocked(game)
    && game.products.drafts.length > 0
    && game.products.active.length < maxActiveProducts(game);
}

/** The Ship that just happened left THIS generation's model to launch by hand: it
 *  deposited a draft (Deploy, Hard, Splash — not a give-away), a slot is free, and the
 *  Launch Autopilot is not about to commercialise it on its own. */
export function shipLeftModelToLaunch(game: GameState): boolean {
  return draftLaunchable(game)
    && game.products.drafts.some((d) => d.ships === game.prestige.ships)
    && !automationEnabled(game, "auto_launch");
}
