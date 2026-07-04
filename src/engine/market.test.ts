import { describe, it, expect } from "vitest";
import { marketLeaderboard, playerMarketRank, rivalReaction, counterRival, canCounterRival, counterCooldownRemaining } from "./market";
import { serialize, deserialize } from "./save";
import { prestige } from "./prestige";
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

describe("rival counterplay (press blitz)", () => {
  function richLab(mau = 100_000) {
    const s = shippedWithProduct(mau);
    s.resources.money = Big.of(1e12);
    return s;
  }

  it("a strike shrinks the rival's users by the balance factor, for this run only", () => {
    const s = richLab();
    const target = marketLeaderboard(s).find((e) => !e.isYou)!;
    const struck = counterRival(s, target.name);
    const after = marketLeaderboard(struck).find((e) => e.name === target.name)!;
    expect(after.users).toBeCloseTo(target.users * M.counterplay.effectPerStrike, 3);
    // …and the money was actually paid (a sink, not a freebie).
    expect(struck.resources.money.lt(s.resources.money)).toBe(true);
  });

  it("respects the cooldown, the per-rival cap, and never targets someone you beat", () => {
    let s = richLab();
    const rivals = marketLeaderboard(s).filter((e) => !e.isYou);
    const first = rivals[0]!.name;
    s = counterRival(s, first);
    // Cooldown: an immediate second strike (same playtime) is a same-ref no-op.
    expect(counterRival(s, rivals[1]!.name)).toBe(s);
    expect(counterCooldownRemaining(s)).toBeGreaterThan(0);
    // Advance playtime past the cooldown and exhaust the per-rival cap.
    for (let i = 1; i < M.counterplay.maxStrikesPerRival; i++) {
      s = { ...s, stats: { ...s.stats, playtimeSec: s.stats.playtimeSec + M.counterplay.cooldownSec + 1 } };
      s = counterRival(s, first);
    }
    expect(s.rivalOps.strikes[first]).toBe(M.counterplay.maxStrikesPerRival);
    s = { ...s, stats: { ...s.stats, playtimeSec: s.stats.playtimeSec + M.counterplay.cooldownSec + 1 } };
    expect(canCounterRival(s, first)).toBe(false); // cap reached
    // A rival already below your product can't be blitzed.
    const giant = richLab(500_000_000);
    const beaten = marketLeaderboard(giant).find((e) => !e.isYou)!;
    expect(canCounterRival(giant, beaten.name)).toBe(false);
  });

  it("needs a live product, real money and a known rival", () => {
    const cold = createInitialState();
    cold.resources.money = Big.of(1e12);
    expect(canCounterRival(cold, M.rivals[0]!.name)).toBe(false); // no product
    const poor = shippedWithProduct(1000); // money = 0
    expect(canCounterRival(poor, M.rivals[0]!.name)).toBe(false);
    expect(canCounterRival(richLab(), "Not A Rival")).toBe(false);
  });

  it("strikes survive save/load (sanitized) and reset on prestige", () => {
    let s = richLab();
    const target = marketLeaderboard(s).find((e) => !e.isYou)!.name;
    s = counterRival(s, target);
    const back = deserialize(serialize(s));
    expect(back.rivalOps.strikes[target]).toBe(1);
    // Crafted saves can't zero the board or fake unknown rivals.
    const raw = JSON.parse(serialize(s));
    raw.rivalOps.strikes[target] = 99;
    raw.rivalOps.strikes["FakeCo"] = 3;
    const clamped = deserialize(JSON.stringify(raw));
    expect(clamped.rivalOps.strikes[target]).toBe(M.counterplay.maxStrikesPerRival);
    expect(clamped.rivalOps.strikes["FakeCo"]).toBeUndefined();
    // Prestige reshuffles the board: strikes clear with the run.
    s.research = ["inference_api"];
    expect(prestige(s).rivalOps.strikes).toEqual({});
  });
});
