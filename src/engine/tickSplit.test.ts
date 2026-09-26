import { describe, it, expect } from "vitest";
import { tick } from "./tick";
import { applyOffline } from "./offline";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import type { GameState } from "./types";

/** A lab with one timed buff that has exactly `rem` seconds left. */
function withBuff(rem: number): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 5 };
  s.modifiers = [{ id: "test_buff", target: "computeMult", factor: 2, remainingSec: rem, label: "Test ×2", tone: "good" }];
  return s;
}

describe("tick: splitting the window at a modifier's expiry", () => {
  // (r*1000)/1000 rounds one ulp ABOVE r for this value — the case that used to make
  // the split re-trigger with the same firstMs until the stack overflowed.
  const NASTY = 0.05454600453375624;

  it("the nasty value really does round up (guards the test's premise)", () => {
    expect((NASTY * 1000) / 1000 > NASTY).toBe(true);
  });

  it("expires the buff without recursing forever", () => {
    for (const ms of [100, 99.7, 100.4, 54.546004533756246, 1000]) {
      const next = tick(withBuff(NASTY), ms);
      expect(next.modifiers).toEqual([]);
      expect(next.resources.compute.gt(0)).toBe(true);
    }
  });

  it("survives a fuzz of real 10Hz expiries", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 3000; i++) {
      const rem = 0.001 + rnd() * 0.2;
      const ms = 96 + rnd() * 8;
      const next = tick(withBuff(rem), ms); // must never throw
      if (rem * 1000 <= ms) expect(next.modifiers.length).toBe(0);
      else expect(next.modifiers[0]!.remainingSec).toBeCloseTo(rem - ms / 1000, 9);
    }
  });

  it("round-trips the poisoned value through a save and still catches up offline", () => {
    const back = deserialize(serialize(withBuff(NASTY)));
    expect(back.modifiers[0]!.remainingSec).toBe(NASTY);
    const { state } = applyOffline(back, 60 * 60 * 1000);
    expect(state.modifiers).toEqual([]);
  });

  it("leaves no float dust behind at the boundary", () => {
    const next = tick(withBuff(0.1), 100);
    expect(next.modifiers).toEqual([]);
  });
});
