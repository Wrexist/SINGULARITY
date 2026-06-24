import { describe, it, expect } from "vitest";
import { applyWorldEvent, pickWorldEvent, maybeWorldEvent } from "./actions";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { prestige } from "./prestige";
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
    // Seed an active modifier, then ship — the reset must drop it.
    let s = applyWorldEvent(createInitialState(), "breakthrough_paper").state;
    s.research = [...s.research, balance.prestige.capabilityResearch]; // make shippable
    s.lifetimeMoney = Big.of("1e8");
    expect(s.modifiers).toHaveLength(1);
    const after = prestige(s);
    expect(after.modifiers).toEqual([]);
    expect(after.prestige.ships).toBe(1);
  });

  it("a near-expired buff does NOT apply to a whole large tick (no offline windfall)", () => {
    const s = applyWorldEvent(createInitialState(), "breakthrough_paper").state; // ×1.5 compute
    s.modifiers[0]!.remainingSec = 5; // only 5s left
    // Fresh compute rate is 1/s. Over 600s: 5s boosted (×1.5) + 595s normal.
    const after = tick(s, 600_000);
    expect(after.resources.compute.toNumber()).toBeCloseTo(1.5 * 5 + 595, 1); // 602.5
    expect(after.modifiers).toHaveLength(0);
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
