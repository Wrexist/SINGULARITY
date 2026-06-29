import { describe, it, expect } from "vitest";
import { marketLeaderboard, playerMarketRank, rivalReaction } from "./market";
import { market as M } from "./balance/market";
import { releaseProduct } from "./products";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

function shippedWithProduct(mau: number) {
  let s = createInitialState();
  s.prestige.ships = 1;
  s.resources.compute = Big.of(1e12);
  s.resources.data = Big.of(1e12);
  s = releaseProduct(s, { type: "general", name: "Mirage", id: "p1" });
  s.products.active[0]!.mau = mau;
  return s;
}

describe("market leaderboard (rivals)", () => {
  it("lists all rivals (and ranks them) even with no player product", () => {
    const board = marketLeaderboard(createInitialState());
    expect(board).toHaveLength(M.rivals.length);
    expect(board.every((e) => !e.isYou)).toBe(true);
    expect(playerMarketRank(createInitialState())).toBeNull();
  });

  it("shares are non-negative and sum to ~100%", () => {
    const board = marketLeaderboard(shippedWithProduct(5_000_000));
    const sum = board.reduce((s, e) => s + e.share, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(board.every((e) => e.share >= 0)).toBe(true);
  });

  it("is sorted by users descending", () => {
    const board = marketLeaderboard(shippedWithProduct(1_000_000));
    for (let i = 1; i < board.length; i++) expect(board[i - 1]!.users).toBeGreaterThanOrEqual(board[i]!.users);
  });

  it("a tiny new product is an underdog; a huge one tops the chart", () => {
    expect(playerMarketRank(shippedWithProduct(1000))).toBeGreaterThan(1);
    const big = shippedWithProduct(500_000_000);
    expect(playerMarketRank(big)).toBe(1);
    expect(marketLeaderboard(big)[0]!.isYou).toBe(true);
  });

  it("rivals carry focus + a reactive status that flips when you overtake them", () => {
    // No product yet → every rival has a 'sidelines' reaction and a focus tag.
    const cold = marketLeaderboard(createInitialState());
    expect(cold.every((e) => e.focus && e.reaction)).toBe(true);
    expect(cold.some((e) => /sidelines|safety|monetis/i.test(e.reaction!))).toBe(true);

    // A dominant product → rivals you've passed react to being overtaken.
    const big = marketLeaderboard(shippedWithProduct(500_000_000));
    const passed = big.filter((e) => !e.isYou && e.users < big.find((x) => x.isYou)!.users);
    expect(passed.length).toBeGreaterThan(0);
    expect(passed.every((e) => /passed them/i.test(e.reaction!))).toBe(true);
  });

  it("rivalReaction is pure and branches on standing", () => {
    expect(rivalReaction("scaler", false, false)).toMatch(/sidelines/i);
    expect(rivalReaction("safety", true, true)).toMatch(/ahead of you/i);
    expect(rivalReaction("money", true, false)).toMatch(/passed them/i);
  });
});
