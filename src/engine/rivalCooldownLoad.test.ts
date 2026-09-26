import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { counterCooldownRemaining } from "./market";
import { market as M } from "./balance/market";

/**
 * The press-blitz cooldown is measured from a playtime stamp stored in the save. The
 * loader promised to bound that stamp "so it can't push the next blitz into next
 * century", but only checked it was finite and non-negative: a stamp past the lab's
 * own playtime loaded as a cooldown of years, locking every blitz for the run.
 */
describe("loading the press-blitz cooldown", () => {
  it("never loads a cooldown longer than a real blitz leaves", () => {
    const s = createInitialState();
    s.stats = { ...s.stats, playtimeSec: 1000 };
    s.rivalOps = { strikes: {}, lastStrikeSec: 1e15 };
    const loaded = deserialize(serialize(s));
    expect(counterCooldownRemaining(loaded)).toBeLessThanOrEqual(M.counterplay.cooldownSec);
  });

  it("keeps a real, recent stamp exactly", () => {
    const s = createInitialState();
    s.stats = { ...s.stats, playtimeSec: 1000 };
    s.rivalOps = { strikes: {}, lastStrikeSec: 900 };
    const loaded = deserialize(serialize(s));
    expect(loaded.rivalOps.lastStrikeSec).toBe(900);
    expect(counterCooldownRemaining(loaded)).toBe(M.counterplay.cooldownSec - 100);
  });
});
