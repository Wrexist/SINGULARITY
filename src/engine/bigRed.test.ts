import { describe, it, expect } from "vitest";
import { bigRedBalance as B, bigRedCooldown, bigRedOpen, bigRedOutcome, bigRedReady, pressBigRed } from "./bigRed";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { buildHallModel } from "../render/hallModel";
import type { GameState } from "./types";

/**
 * POST_LAUNCH R3.3 — the Big Red Button: a gamble the player starts. It must be pure
 * (no RNG), honest about its odds (the table's weights), temporary in every effect
 * (curve-safe: the sim never presses), and safe to load from a hostile save.
 */
function lab(over: Partial<GameState> = {}): GameState {
  const s = createInitialState();
  return { ...s, prestige: { ...s.prestige, ships: 1 }, upgrades: { ...s.upgrades, rack_basic: 6 }, ...over };
}
const at = (s: GameState, sec: number): GameState => ({ ...s, stats: { ...s.stats, playtimeSec: sec } });

describe("Big Red Button — availability", () => {
  it("unlocks with the first Ship and starts ready", () => {
    expect(bigRedOpen(createInitialState())).toBe(false);
    expect(pressBigRed(createInitialState())).toEqual(createInitialState());
    expect(bigRedOpen(lab())).toBe(true);
    expect(bigRedReady(lab())).toBe(true);
  });

  it("recharges over playtime after a press, and a press while recharging does nothing", () => {
    const pressed = pressBigRed(at(lab(), 1000));
    expect(pressed.bigRed).toEqual({ presses: 1, lastSec: 1000 });
    expect(bigRedCooldown(pressed)).toBe(B.cooldownSec);
    const early = at(pressed, 1000 + B.cooldownSec - 1);
    expect(bigRedReady(early)).toBe(false);
    expect(pressBigRed(early)).toBe(early);
    expect(bigRedReady(at(pressed, 1000 + B.cooldownSec))).toBe(true);
  });
});

describe("Big Red Button — the roll", () => {
  it("is a pure function of the lab's state", () => {
    const s = at(lab(), 4321);
    expect(bigRedOutcome(s)).toBe(bigRedOutcome({ ...s }));
    expect(pressBigRed(s)).toEqual(pressBigRed(s));
  });

  it("lands on each outcome about as often as its weight says", () => {
    const total = B.outcomes.reduce((n, o) => n + o.weight, 0);
    const seen = new Map<string, number>();
    const N = 20000;
    for (let k = 0; k < N; k++) {
      const s = { ...at(lab(), 37 * k + 11), bigRed: { presses: k % 50, lastSec: null } };
      const o = bigRedOutcome(s);
      seen.set(o.id, (seen.get(o.id) ?? 0) + 1);
    }
    for (const o of B.outcomes) {
      const share = (seen.get(o.id) ?? 0) / N;
      expect(Math.abs(share - o.weight / total)).toBeLessThan(0.02);
    }
  });

  it("only ever applies a temporary modifier, refreshed rather than stacked", () => {
    for (const o of B.outcomes) {
      expect(o.durationSec).toBeGreaterThan(0);
      expect(o.durationSec).toBeLessThanOrEqual(300);
      expect(o.factor).toBeGreaterThan(0);
      expect(o.factor).toBeLessThanOrEqual(3);
    }
    const s = at(lab(), 777);
    const o = bigRedOutcome(s);
    const once = pressBigRed(s);
    const mods = once.modifiers.filter((m) => m.id.startsWith("bigred_"));
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatchObject({ id: `bigred_${o.id}`, target: o.target, factor: o.factor, remainingSec: o.durationSec, tone: o.factor < 1 ? "bad" : "good" });
    // Pressed again later and landing the same outcome: still one modifier.
    const again = { ...at(once, 777 + B.cooldownSec), modifiers: once.modifiers };
    if (bigRedOutcome(again).id === o.id) expect(pressBigRed(again).modifiers.filter((m) => m.id === `bigred_${o.id}`)).toHaveLength(1);
  });

  it("a small disaster becomes a workable incident on a rack", () => {
    // Find a moment whose roll is a bad outcome.
    let s = at(lab(), 0);
    for (let sec = 0; sec < 5000 && bigRedOutcome(s).factor >= 1; sec++) s = at(lab(), sec);
    expect(bigRedOutcome(s).factor).toBeLessThan(1);
    const after = pressBigRed(s);
    expect(buildHallModel(after).incidents.some((i) => i.id.startsWith("bigred_"))).toBe(true);
  });
});

describe("Big Red Button — saves", () => {
  it("round-trips, and a stamp from the future is pulled back to now", () => {
    const pressed = pressBigRed(at(lab(), 900));
    expect(deserialize(serialize(pressed)).bigRed).toEqual({ presses: 1, lastSec: 900 });
    const forged = JSON.parse(serialize(pressed));
    forged.bigRed = { presses: -4, lastSec: 1e12 };
    const back = deserialize(JSON.stringify(forged));
    expect(back.bigRed.presses).toBe(0);
    expect(back.bigRed.lastSec).toBe(back.stats.playtimeSec);
    forged.bigRed = "garbage";
    expect(deserialize(JSON.stringify(forged)).bigRed).toEqual({ presses: 0, lastSec: null });
  });

  it("migrates a v41 save to a never-pressed, ready button", () => {
    const old = JSON.parse(serialize(lab()));
    delete old.bigRed;
    old.version = 41;
    expect(deserialize(JSON.stringify(old)).bigRed).toEqual({ presses: 0, lastSec: null });
  });
});
