import { market as M } from "./balance/market";
import type { GameState } from "./types";

/**
 * The AI market leaderboard (pure). Combines named rival labs (whose user base
 * scales with the frontier) with the player's live products, ranks everyone by
 * MAU, and computes each one's share of the total market. Deterministic — no
 * clock, no RNG — so it's safe to call every render and trivially testable.
 */

export interface MarketEntry {
  name: string;
  vendor: string;
  users: number;
  /** 0..1 share of the total market. */
  share: number;
  isYou: boolean;
}

export function marketLeaderboard(state: GameState): MarketEntry[] {
  const frontier = Math.max(0, state.products.frontier);
  const rivalPool = M.rivalBaseUsers + frontier * M.rivalUsersPerFrontier;
  const weightSum = M.rivals.reduce((s, r) => s + r.weight, 0) || 1;

  const entries: Omit<MarketEntry, "share">[] = [
    ...M.rivals.map((r) => ({ name: r.name, vendor: r.vendor, users: (rivalPool * r.weight) / weightSum, isYou: false })),
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
