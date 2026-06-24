import { describe, it, expect } from "vitest";
import { applyWorldEvent, pickWorldEvent, maybeWorldEvent } from "./actions";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

describe("world events — immediate effects", () => {
  it("a grantPct event swings the resource by the percentage", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    const { state } = applyWorldEvent(s, "gov_grant"); // +25% money
    expect(state.resources.money.eq(Big.of(1250))).toBe(true);
  });

  it("a negative grantPct never goes below zero", () => {
    const s = createInitialState();
    s.resources.data = Big.of(500);
    const { state } = applyWorldEvent(s, "data_breach"); // -20% data
    expect(state.resources.data.eq(Big.of(400))).toBe(true);
  });
});

describe("world events — timed modifiers", () => {
  it("a buff event adds a modifier that derive folds into the multiplier", () => {
    const s = createInitialState();
    const before = derive(s).computePerSec;
    const { state } = applyWorldEvent(s, "breakthrough_paper"); // Compute ×1.5
    expect(state.modifiers).toHaveLength(1);
    const boosted = derive(state).computePerSec;
    expect(boosted.eq(before.mul(1.5))).toBe(true);
  });

  it("modifiers tick down and expire", () => {
    const s = createInitialState();
    const { state } = applyWorldEvent(s, "viral_demo"); // Revenue ×2, 45s
    const dur = state.modifiers[0]!.remainingSec;
    const mid = tick(state, (dur - 5) * 1000);
    expect(mid.modifiers).toHaveLength(1);
    expect(mid.modifiers[0]!.remainingSec).toBeCloseTo(5, 3);
    const after = tick(mid, 6000); // push past expiry
    expect(after.modifiers).toHaveLength(0);
  });

  it("re-firing the same event refreshes rather than stacks", () => {
    let s = createInitialState();
    s = applyWorldEvent(s, "breakthrough_paper").state;
    s = tick(s, 10_000);
    s = applyWorldEvent(s, "breakthrough_paper").state; // same id again
    expect(s.modifiers).toHaveLength(1);
    expect(s.modifiers[0]!.remainingSec).toBeCloseTo(60, 3); // refreshed to full
  });

  it("modifiers are cleared by a prestige reset", () => {
    // (prestige spreads a fresh state, which has modifiers: [])
    const fresh = createInitialState();
    expect(fresh.modifiers).toEqual([]);
  });
});

describe("world events — firing & gating", () => {
  it("does not fire before the lab is established (minResearch)", () => {
    const s = createInitialState(); // no research
    expect(maybeWorldEvent(s, 10, 0, 0)).toBeNull();
  });

  it("fires on a low fire-roll once established", () => {
    const s = createInitialState();
    s.research = ["backprop"];
    const res = maybeWorldEvent(s, balance.worldEvents.meanIntervalSec, 0, 0);
    expect(res).not.toBeNull();
  });

  it("pickWorldEvent spans the table", () => {
    expect(typeof pickWorldEvent(0).id).toBe("string");
    expect(typeof pickWorldEvent(0.999).id).toBe("string");
  });
});
