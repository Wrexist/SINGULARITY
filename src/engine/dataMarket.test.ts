import { describe, it, expect } from "vitest";
import { buyDataOffer, canBuyDataOffer, buyUpgrade } from "./actions";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { Big } from "./math/Big";

describe("data market — legit vendors", () => {
  it("buys clean data for money, ignoring the risk roll", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    // roll is irrelevant for non-shady offers
    const { state, outcome } = buyDataOffer(s, "meta_dump", 0.0);
    expect(outcome?.kind).toBe("clean");
    expect(state.resources.money.eq(Big.of(800))).toBe(true); // 1000 - 200
    expect(state.resources.data.eq(Big.of(180))).toBe(true);
  });

  it("is a no-op when you can't afford it", () => {
    const s = createInitialState();
    s.resources.money = Big.of(10);
    expect(canBuyDataOffer(s, "meta_dump")).toBe(false);
    const { state, outcome } = buyDataOffer(s, "meta_dump", 0.9);
    expect(state).toBe(s);
    expect(outcome).toBeNull();
  });
});

describe("data market — dark web risk (deterministic via passed-in roll)", () => {
  const fresh = () => {
    const s = createInitialState();
    s.resources.money = Big.of(10000);
    return s;
  };

  it("clean haul on a high roll", () => {
    const { state, outcome } = buyDataOffer(fresh(), "bazaar_pack", 0.99);
    expect(outcome?.kind).toBe("clean");
    expect(state.resources.data.eq(Big.of(220))).toBe(true);
    expect(state.resources.money.eq(Big.of(10000 - 120))).toBe(true);
  });

  it("poisoned batch on a mid roll (raid 0.12, poison to 0.40)", () => {
    const { state, outcome } = buyDataOffer(fresh(), "bazaar_pack", 0.3);
    expect(outcome?.kind).toBe("poisoned");
    // 220 * 0.12 poison factor, no fine (just the cost)
    expect(state.resources.data.eq(Big.of(220).mul(0.12))).toBe(true);
    expect(state.resources.money.eq(Big.of(10000 - 120))).toBe(true);
  });

  it("raided on a low roll: pays a fine and gets reduced data", () => {
    const { state, outcome } = buyDataOffer(fresh(), "bazaar_pack", 0.05);
    expect(outcome?.kind).toBe("raid");
    expect(state.resources.data.eq(Big.of(220).mul(0.4))).toBe(true);
    // cost 120 + fine 300 = 420
    expect(state.resources.money.eq(Big.of(10000 - 420))).toBe(true);
  });

  it("clamps the fine so money never goes negative", () => {
    const s = createInitialState();
    s.resources.money = Big.of(120); // exactly the cost; fine would overrun
    const { state, outcome } = buyDataOffer(s, "bazaar_pack", 0.0);
    expect(outcome?.kind).toBe("raid");
    expect(state.resources.money.gte(Big.ZERO)).toBe(true);
    expect(state.resources.money.eq(Big.ZERO)).toBe(true);
  });
});

describe("dark-web tools — passive data per second", () => {
  it("a web scraper adds Data/sec that tick accrues", () => {
    let s = createInitialState();
    s.resources.money = Big.of(10000);
    expect(derive(s).dataPerSec.eq(Big.ZERO)).toBe(true);

    s = buyUpgrade(s, "web_scraper"); // +1 data/sec
    expect(derive(s).dataPerSec.eq(Big.of(1))).toBe(true);

    const before = s.resources.data;
    const after = tick(s, 10_000); // 10s
    expect(after.resources.data.sub(before).eq(Big.of(10))).toBe(true);
  });
});
