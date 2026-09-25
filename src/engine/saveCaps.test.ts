import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { tick } from "./tick";
import { canFundMegaproject, fundMegaproject, megaprojectView, pickMandate } from "./challenges";
import { challenges as C } from "./balance/challenges";
import { Big } from "./math/Big";
import type { ActiveModifier, GameState } from "./types";

/**
 * Load-time caps must agree with what the runtime can build (2026-09 bug hunt).
 *
 * The loader clamps several collections so a crafted save can't brick the install.
 * Where a clamp sat BELOW what honest play can reach, the next reload silently deleted
 * real progress. Each block below pins one of those caps to its runtime counterpart.
 */

const roundTrip = (s: GameState) => deserialize(serialize(s));

describe("active modifiers: the loader keeps what tick() keeps", () => {
  const buff = (i: number, remainingSec: number): ActiveModifier => ({
    id: `obj_${i}`, target: "computeMult", factor: 1.5, remainingSec, label: `buff ${i}`, tone: "good",
  });

  it("a burst of 21+ live buffs (claimed backlog + daily + momentum) survives a reload", () => {
    // Objective claims, the day's boost and open-source momentum stack past 20 in real
    // play; tick() allows up to 48, so none of these are pathological.
    const s = createInitialState();
    s.modifiers = Array.from({ length: 30 }, (_, i) => buff(i, 60 + i * 3));
    const back = roundTrip(s);
    expect(back.modifiers.map((m) => m.id)).toEqual(s.modifiers.map((m) => m.id));
  });

  it("an over-cap stack loads as exactly the set the next tick would have kept", () => {
    const s = createInitialState();
    // Deliberately unsorted expiries so "first N" and "soonest-expiring N" differ.
    s.modifiers = Array.from({ length: 70 }, (_, i) => buff(i, 1000 - ((i * 37) % 70) * 10));
    const ticked = new Set(tick(s, 1).modifiers.map((m) => m.id));
    const loaded = new Set(roundTrip(s).modifiers.map((m) => m.id));
    expect(loaded.size).toBe(ticked.size);
    expect([...loaded].every((id) => ticked.has(id))).toBe(true);
  });
});

describe("megaproject level: the runtime stops where the loader does", () => {
  const MAX = C.megaproject.maxLevel;
  const rich = Big.of("1e300");
  /** Every Grand Challenge funded to cost (the sanitizer recomputes completion from
   *  funding), at `level` completed cycles with every mandate taken, rich enough to
   *  complete any cycle in one tap. */
  const atLevel = (level: number): GameState => {
    const s = createInitialState();
    const funded = Object.fromEntries(C.list.map((c) => [c.id, {
      compute: Big.of(c.cost.compute), data: Big.of(c.cost.data), money: Big.of(c.cost.money),
    }]));
    return {
      ...s,
      resources: { compute: rich, data: rich, money: rich },
      challenges: { ...s.challenges, funded, completed: C.list.map((c) => c.id) },
      megaprojects: { ...s.megaprojects, level, mandates: Array.from({ length: level }, () => "mand_compute") },
    };
  };

  it("the cap is a real ceiling: no cycle can be funded past it", () => {
    const below = atLevel(MAX - 1);
    expect(canFundMegaproject(below)).toBe(true);
    const done = fundMegaproject(below);
    expect(done.justCompleted).toBe(true);
    expect(done.state.megaprojects.level).toBe(MAX);

    expect(megaprojectView(below).maxed).toBe(false);

    const top = pickMandate(done.state, "mand_data");
    expect(megaprojectView(top).maxed).toBe(true); // the card shows a finished state
    expect(canFundMegaproject(top)).toBe(false);
    const again = fundMegaproject(top);
    expect(again.state).toBe(top); // no level, and no resources taken toward a cycle that can't complete
    expect(again.justCompleted).toBe(false);
  });

  it("a lab at the ceiling reloads with every cycle and mandate intact", () => {
    const top = pickMandate(fundMegaproject(atLevel(MAX - 1)).state, "mand_data");
    const back = roundTrip(top);
    expect(back.megaprojects.level).toBe(MAX);
    expect(back.megaprojects.mandates).toEqual(top.megaprojects.mandates);
  });
});
