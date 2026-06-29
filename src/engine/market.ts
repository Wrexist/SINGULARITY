import { market as M, type RivalFocus } from "./balance/market";
import type { GameState } from "./types";

/**
 * The AI market leaderboard (pure). Combines named rival labs (whose user base
 * scales with the frontier) with the player's live products, ranks everyone by
 * MAU, and computes each one's share of the total market. Deterministic — no
 * clock, no RNG — so it's safe to call every render and trivially testable.
 *
 * Rivals also carry a FOCUS + a reactive status line generated from the player's
 * standing (are you beating them? by how much?), so "the competition" reads like
 * characters reacting to you, not a static bar. Curve-safe: leaderboard is a
 * sidecar — it touches no resources and isn't folded into derive.
 */

export interface MarketEntry {
  name: string;
  vendor: string;
  users: number;
  /** 0..1 share of the total market. */
  share: number;
  isYou: boolean;
  /** Rivals only: worldview + personality + a reaction to the player's standing. */
  focus?: RivalFocus;
  blurb?: string;
  reaction?: string;
}

/** The player's strongest product's MAU (0 if none live). Pure. */
function bestPlayerUsers(state: GameState): number {
  return state.products.active.reduce((m, p) => Math.max(m, p.mau), 0);
}

/** A deterministic, satirical status line for a rival, reacting to the player's
 *  standing. No RNG — purely a function of (focus, are you live, are you ahead). */
export function rivalReaction(focus: RivalFocus, hasProduct: boolean, beatingPlayer: boolean): string {
  if (!hasProduct) {
    // The player hasn't shipped a product yet — rivals don't know you exist.
    return focus === "scaler"
      ? "Scaling recklessly while you watch from the sidelines."
      : focus === "safety"
        ? "Publishing safety papers nobody reads — and shipping anyway."
        : "Monetising everything that moves, including the exits.";
  }
  if (beatingPlayer) {
    // Rival is ahead of your best product.
    return focus === "scaler"
      ? "Ahead of you — and bragging about the compute bill."
      : focus === "safety"
        ? "Ahead of you, citing 'responsible deployment' the whole way."
        : "Ahead of you, with a sales team twice your size.";
  }
  // Player has overtaken this rival.
  return focus === "scaler"
    ? "You've passed them. Expect a 'we're focusing on AGI' blog post."
    : focus === "safety"
      ? "You've passed them. They're publishing a concerned op-ed about you."
      : "You've passed them. Their CFO is 'exploring strategic options'.";
}

export function marketLeaderboard(state: GameState): MarketEntry[] {
  const frontier = Math.max(0, state.products.frontier);
  const rivalPool = M.rivalBaseUsers + frontier * M.rivalUsersPerFrontier;
  const weightSum = M.rivals.reduce((s, r) => s + r.weight, 0) || 1;
  const myBest = bestPlayerUsers(state);
  const hasProduct = state.products.active.length > 0;

  const entries: Omit<MarketEntry, "share">[] = [
    ...M.rivals.map((r) => {
      const users = (rivalPool * r.weight) / weightSum;
      return {
        name: r.name,
        vendor: r.vendor,
        users,
        isYou: false,
        focus: r.focus,
        blurb: r.blurb,
        reaction: rivalReaction(r.focus, hasProduct, users > myBest),
      };
    }),
    ...state.products.active.map((p) => ({ name: p.name, vendor: "You", users: p.mau, isYou: true })),
  ];

  const total = entries.reduce((s, e) => s + e.users, 0) || 1;
  return entries
    .map((e) => ({ ...e, share: e.users / total }))
    .sort((a, b) => b.users - a.users);
}

/** The player's best market rank (1-based), or null if they have no live product. */
export function playerMarketRank(state: GameState): number | null {
  const board = marketLeaderboard(state);
  const idx = board.findIndex((e) => e.isYou);
  return idx === -1 ? null : idx + 1;
}

/** How many named rivals the player's strongest product currently outranks (0..N).
 *  Monotonic-ish as you grow, so it's a clean achievement metric. */
export function rivalsBeaten(state: GameState): number {
  const board = marketLeaderboard(state);
  const myBest = board.find((e) => e.isYou);
  if (!myBest) return 0;
  return board.filter((e) => !e.isYou && e.users < myBest.users).length;
}
