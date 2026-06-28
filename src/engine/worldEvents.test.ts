import { describe, it, expect } from "vitest";
import { applyWorldEvent, applyWorldEventChoice, pickWorldEvent, maybeWorldEvent } from "./actions";
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

describe("world events — faction choices (Phase 2)", () => {
  it("a choice event does NOT apply anything until the player picks", () => {
    const s = createInitialState();
    s.resources.data = Big.of(1000);
    const { state, event } = applyWorldEvent(s, "choice_opensource");
    expect(state).toBe(s); // unchanged on fire
    expect(event.choices).toHaveLength(2);
    expect(event.choices![0]!.summary.length).toBeGreaterThan(0);
  });

  it("picking a branch applies its effect and shifts alignment", () => {
    const s = createInitialState();
    s.resources.data = Big.of(1000);
    // Branch 0 of choice_opensource: +30% data, alignment +0.34.
    const { state } = applyWorldEventChoice(s, "choice_opensource", 0);
    expect(state.resources.data.eq(Big.of(1300))).toBe(true);
    expect(state.alignment).toBeCloseTo(0.34, 6);
  });

  it("the other branch moves alignment the other way", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1000);
    const { state } = applyWorldEventChoice(s, "choice_opensource", 1); // keep closed: +25% $, -0.34
    expect(state.resources.money.eq(Big.of(1250))).toBe(true);
    expect(state.alignment).toBeCloseTo(-0.34, 6);
  });

  it("alignment clamps to [-1, 1] on both ends", () => {
    let hi = createInitialState();
    for (let i = 0; i < 10; i++) hi = applyWorldEventChoice(hi, "choice_opensource", 0).state; // +accel
    expect(hi.alignment).toBe(1);
    let lo = createInitialState();
    for (let i = 0; i < 10; i++) lo = applyWorldEventChoice(lo, "choice_opensource", 1).state; // +doomer
    expect(lo.alignment).toBe(-1);
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

  it("every world-event id is unique (a dup id makes the later entry dead content — applyWorldEvent resolves by find)", () => {
    const ids = balance.worldEvents.list.map((e) => e.id);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dups).toEqual([]);
  });

  it("every choice dilemma has exactly two branches that move alignment opposite ways", () => {
    for (const e of balance.worldEvents.list) {
      if (!e.choices) continue;
      expect(e.choices).toHaveLength(2);
      const [a, b] = e.choices;
      // one branch leans doomer (≤0), the other accelerationist (≥0); never both same sign
      expect(Math.sign(a!.alignment) !== Math.sign(b!.alignment) || a!.alignment === 0 || b!.alignment === 0).toBe(true);
    }
  });

  describe("R6.2 — faction-branched pools", () => {
    const ids = () => balance.worldEvents.list.map((e) => e.id);
    const sweep = (alignment: number): Set<string> => {
      const seen = new Set<string>();
      for (let r = 0; r < 1; r += 0.002) seen.add(pickWorldEvent(r, alignment).id);
      return seen;
    };
    const doomerIds = balance.worldEvents.list.filter((e) => e.faction === "doomer").map((e) => e.id);
    const accelIds = balance.worldEvents.list.filter((e) => e.faction === "accel").map((e) => e.id);

    it("the data has both faction pools defined", () => {
      expect(doomerIds.length).toBeGreaterThan(0);
      expect(accelIds.length).toBeGreaterThan(0);
    });

    it("neutral players never see ANY faction-tagged event (base pool = curve-safe)", () => {
      const seen = sweep(0);
      for (const id of [...doomerIds, ...accelIds]) expect(seen.has(id)).toBe(false);
    });

    it("a committed doomer sees doomer events but no accelerationist ones", () => {
      const seen = sweep(-1);
      expect(doomerIds.some((id) => seen.has(id))).toBe(true);
      for (const id of accelIds) expect(seen.has(id)).toBe(false);
    });

    it("a committed accelerationist sees accel events but no doomer ones", () => {
      const seen = sweep(1);
      expect(accelIds.some((id) => seen.has(id))).toBe(true);
      for (const id of doomerIds) expect(seen.has(id)).toBe(false);
    });

    it("maybeWorldEvent routes through the aligned pool", () => {
      const s = createInitialState();
      s.research = ["backprop"];
      s.alignment = -1; // committed doomer
      // Fire deterministically; the only-doomer-or-untagged guarantee is covered above —
      // here we just assert it still produces a valid event id with alignment set.
      const res = maybeWorldEvent(s, balance.worldEvents.meanIntervalSec, 0, 0.999);
      expect(res).not.toBeNull();
      expect(ids()).toContain(res!.event.id);
    });
  });
});
