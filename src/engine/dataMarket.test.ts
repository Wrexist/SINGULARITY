import { describe, it, expect } from "vitest";
import {
  buyDataOffer,
  canBuyDataOffer,
  buyUpgrade,
  effectiveRaidChance,
  applyHeatEvent,
  maybeHeatEvent,
  pickHeatEvent,
} from "./actions";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

describe("data market — legit vendors", () => {
  it("buys clean data for money, ignoring the risk roll", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    // roll is irrelevant for non-shady offers
    const { state, outcome } = buyDataOffer(s, "meta_dump", 0.0);
    expect(outcome?.kind).toBe("clean");
    expect(state.resources.money.eq(Big.of(800))).toBe(true); // 1000 - 200
    expect(state.resources.data.eq(Big.of(150))).toBe(true);
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

  // At heat 0: raid 0.05, poison 0.15 (clean above 0.20). Data 240, fine 120.
  it("clean haul on a high roll", () => {
    const { state, outcome } = buyDataOffer(fresh(), "bazaar_pack", 0.99);
    expect(outcome?.kind).toBe("clean");
    expect(state.resources.data.eq(Big.of(240))).toBe(true);
    expect(state.resources.money.eq(Big.of(10000 - 120))).toBe(true);
  });

  it("poisoned batch on a mid roll", () => {
    const { state, outcome } = buyDataOffer(fresh(), "bazaar_pack", 0.1);
    expect(outcome?.kind).toBe("poisoned");
    expect(state.resources.data.eq(Big.of(240).mul(0.3))).toBe(true);
    expect(state.resources.money.eq(Big.of(10000 - 120))).toBe(true);
  });

  it("raided on a low roll: pays a fine and gets reduced data", () => {
    const { state, outcome } = buyDataOffer(fresh(), "bazaar_pack", 0.02);
    expect(outcome?.kind).toBe("raid");
    expect(state.resources.data.eq(Big.of(240).mul(0.4))).toBe(true);
    // cost 120 + fine 120 = 240
    expect(state.resources.money.eq(Big.of(10000 - 240))).toBe(true);
  });

  it("clamps the fine so money never goes negative, and reports the fine actually charged", () => {
    const s = createInitialState();
    s.resources.money = Big.of(120); // exactly the cost; fine would overrun
    const { state, outcome } = buyDataOffer(s, "bazaar_pack", 0.0);
    expect(outcome?.kind).toBe("raid");
    expect(state.resources.money.eq(Big.ZERO)).toBe(true);
    // The whole $120 went to the batch cost; $0 of fine was actually charged.
    expect(outcome?.moneyLost.eq(Big.of(120))).toBe(true);
    expect(outcome?.message).toContain("$0");
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

  it("buying a dark-web tool adds Heat", () => {
    let s = createInitialState();
    s.resources.money = Big.of(10000);
    s = buyUpgrade(s, "web_scraper");
    expect(s.heat).toBe(balance.heat.toolBuyHeat);
  });

  it("passive Data/sec rides the Legacy multiplier", () => {
    let s = createInitialState();
    s.resources.money = Big.of(100000);
    s = buyUpgrade(s, "web_scraper"); // +1/sec base
    const base = derive(s).dataPerSec;
    s.prestige.legacyWeights = Big.of(10); // legacyMult = 1 + 10*perPoint
    const boosted = derive(s).dataPerSec;
    expect(boosted.gt(base)).toBe(true);
  });
});

describe("regulatory Heat", () => {
  it("a shady buy adds Heat; cooling reduces it over time", () => {
    let s = createInitialState();
    s.resources.money = Big.of(10000);
    const { state } = buyDataOffer(s, "bazaar_pack", 0.99); // clean
    expect(state.heat).toBe(6); // bazaar_pack heat
    const cooled = tick(state, 4000); // 4s of cooling
    expect(cooled.heat).toBeCloseTo(6 - balance.heat.coolPerSec * 4, 5);
  });

  it("raid chance rises with Heat", () => {
    const cold = createInitialState();
    const hot = { ...createInitialState(), heat: balance.heat.max };
    expect(effectiveRaidChance(hot, "bazaar_pack")).toBeGreaterThan(
      effectiveRaidChance(cold, "bazaar_pack"),
    );
  });

  it("raid chance never overlaps the poison band (clamped to 1 - poison)", () => {
    // Force an absurd heat far past max; raid must still leave room for poison.
    const insane = { ...createInitialState(), heat: 100000 };
    const raid = effectiveRaidChance(insane, "bazaar_pack");
    const poison = 0.15; // bazaar_pack poisonChance
    expect(raid).toBeLessThanOrEqual(1 - poison + 1e-9);
  });

  it("a raid cools you off (lay low) rather than heating further", () => {
    const s = { ...createInitialState(), heat: 50, resources: { ...createInitialState().resources, money: Big.of(10000) } };
    const { state, outcome } = buyDataOffer(s, "bazaar_pack", 0.0); // forced raid
    expect(outcome?.kind).toBe("raid");
    expect(state.heat).toBeCloseTo(50 * 0.4, 5);
  });
});

describe("heat events", () => {
  it("never fires when cold", () => {
    const s = createInitialState(); // heat 0
    expect(maybeHeatEvent(s, 1, 0, 0)).toBeNull();
  });

  it("fires on a low fire-roll when hot", () => {
    const s = { ...createInitialState(), heat: balance.heat.max };
    const res = maybeHeatEvent(s, 1, 0, 0); // fireRoll 0 < chance
    expect(res).not.toBeNull();
  });

  it("does not fire when the fire-roll exceeds the (capped) chance", () => {
    const s = { ...createInitialState(), heat: balance.heat.max };
    // A huge elapsed would make chance certain without the cap; the cap holds it
    // at eventChanceCap, so a fire-roll above the cap must NOT fire.
    const justAboveCap = balance.heat.eventChanceCap + 0.01;
    expect(maybeHeatEvent(s, 100000, justAboveCap, 0)).toBeNull();
  });

  it("event probability is capped on huge frames (tab refocus can't guarantee one)", () => {
    const s = { ...createInitialState(), heat: balance.heat.max };
    // fireRoll exactly at the cap boundary should be the no-fire edge.
    expect(maybeHeatEvent(s, 1e9, balance.heat.eventChanceCap, 0)).toBeNull();
  });

  it("audit fines a fraction of money and cools heat", () => {
    const s = { ...createInitialState(), heat: 80, resources: { ...createInitialState().resources, money: Big.of(1000) } };
    const { state, event } = applyHeatEvent(s, "audit");
    expect(event.id).toBe("audit");
    expect(state.resources.money.eq(Big.of(750))).toBe(true); // -25%
    expect(state.heat).toBeCloseTo(80 * 0.3, 5);
  });

  it("lobbyist clears heat", () => {
    const s = { ...createInitialState(), heat: 90 };
    const { state } = applyHeatEvent(s, "lobbyist");
    expect(state.heat).toBe(0);
  });

  it("subpoena seizes a fraction of data", () => {
    const s = { ...createInitialState(), heat: 60, resources: { ...createInitialState().resources, data: Big.of(1000) } };
    const { state } = applyHeatEvent(s, "subpoena");
    expect(state.resources.data.eq(Big.of(800))).toBe(true); // -20%
  });

  it("pickHeatEvent spans the weighted table across the roll range", () => {
    // roll 0 → first event; roll just under 1 → last event; all valid ids.
    expect(pickHeatEvent(0).id).toBe("audit");
    expect(pickHeatEvent(0.999).id).toBe("lobbyist");
    for (const r of [0, 0.2, 0.45, 0.7, 0.95, 0.999]) {
      expect(typeof pickHeatEvent(r).id).toBe("string");
    }
  });
});
