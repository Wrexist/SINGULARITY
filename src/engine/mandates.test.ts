import { describe, it, expect } from "vitest";
import {
  mandateDefs, mandatePicksAvailable, canPickMandate, pickMandate, mandateMods,
  challengeMods, megaprojectMult, fundMegaproject,
} from "./challenges";
import { challenges as C } from "./balance/challenges";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { SAVE_VERSION } from "./state";
import { Big } from "./math/Big";

const M = C.megaproject;

/**
 * Megaproject Mandates (2026-08 depth pass).
 *
 * The bounded megaproject bonus converges to 1 + baseMag/(1−decay) = ×1.333 while
 * each cycle costs ×growth more than the last, so past ~15 cycles the player was
 * pouring exponentially escalating output into the fourth decimal place. Mandates
 * sit on top: one permanent pick per completed cycle, so cycle 30 is worth what
 * cycle 5 was — and the pour becomes a decision rather than a bar.
 */
describe("Megaproject Mandates", () => {
  const atLevel = (level: number, mandates: string[] = []) => {
    const s = createInitialState();
    return { ...s, megaprojects: { ...s.megaprojects, level, mandates } };
  };

  it("mints exactly one pick per completed cycle", () => {
    expect(mandatePicksAvailable(atLevel(0))).toBe(0);
    expect(mandatePicksAvailable(atLevel(1))).toBe(1);
    expect(mandatePicksAvailable(atLevel(7))).toBe(7);
    expect(mandatePicksAvailable(atLevel(7, ["mand_compute", "mand_data"]))).toBe(5);
  });

  it("never offers a pick that was not earned", () => {
    // Includes the hostile case: more picks recorded than cycles completed.
    expect(mandatePicksAvailable(atLevel(2, ["mand_compute", "mand_data", "mand_money"]))).toBe(0);
    expect(canPickMandate(atLevel(0), "mand_compute")).toBe(false);
    expect(pickMandate(atLevel(0), "mand_compute").megaprojects.mandates).toEqual([]);
  });

  it("ignores an unknown mandate id", () => {
    const s = atLevel(3);
    expect(canPickMandate(s, "mand_nope")).toBe(false);
    expect(pickMandate(s, "mand_nope")).toBe(s);
  });

  it("stacks repeats — the same lane can be taken twice", () => {
    let s = atLevel(2);
    s = pickMandate(s, "mand_compute");
    s = pickMandate(s, "mand_compute");
    expect(s.megaprojects.mandates).toEqual(["mand_compute", "mand_compute"]);
    const def = mandateDefs().find((d) => d.id === "mand_compute")!;
    expect(mandateMods(s).compute.toNumber()).toBeCloseTo((1 + def.value) ** 2, 9);
    expect(mandateMods(s).data.toNumber()).toBe(1);
  });

  it("applies the synthesis mandate to every lane", () => {
    const def = mandateDefs().find((d) => d.id === "mand_all")!;
    const mods = mandateMods(pickMandate(atLevel(1), "mand_all"));
    for (const lane of [mods.compute, mods.data, mods.money]) {
      expect(lane.toNumber()).toBeCloseTo(1 + def.value, 9);
    }
  });

  it("is identity with no mandates taken", () => {
    const mods = mandateMods(atLevel(5));
    expect(mods.compute.toNumber()).toBe(1);
    expect(mods.data.toNumber()).toBe(1);
    expect(mods.money.toNumber()).toBe(1);
  });

  it("rides into derive through challengeMods, alongside the bounded bonus", () => {
    const s = pickMandate(atLevel(1), "mand_compute");
    const def = mandateDefs().find((d) => d.id === "mand_compute")!;
    const expected = megaprojectMult(s).toNumber() * (1 + def.value);
    expect(challengeMods(s).compute.toNumber()).toBeCloseTo(expected, 9);
    // …and the other lanes still carry the bounded bonus alone.
    expect(challengeMods(s).data.toNumber()).toBeCloseTo(megaprojectMult(s).toNumber(), 9);
  });

  it("leaves the bounded megaproject bonus exactly as it was", () => {
    // Nobody's held multiplier may move because mandates were added.
    for (const level of [0, 1, 5, 20]) {
      const sum = level === 0 ? 0 : (M.baseMag * (1 - Math.pow(M.decay, level))) / (1 - M.decay);
      expect(megaprojectMult(atLevel(level)).toNumber()).toBeCloseTo(1 + sum, 12);
    }
  });

  it("keeps mandates when a cycle completes", () => {
    let s = atLevel(1, ["mand_money"]);
    s = { ...s, resources: { compute: Big.of(1e40), data: Big.of(1e40), money: Big.of(1e40) },
          challenges: { ...s.challenges, completed: C.list.map((c) => c.id) } };
    const res = fundMegaproject(s);
    expect(res.justCompleted).toBe(true);
    expect(res.state.megaprojects.level).toBe(2);
    expect(res.state.megaprojects.mandates).toEqual(["mand_money"]); // not wiped
    expect(mandatePicksAvailable(res.state)).toBe(1); // the new cycle minted one
  });
});

describe("Megaproject Mandates — persistence", () => {
  it("round-trips through save/load", () => {
    const s0 = createInitialState();
    const s = { ...s0, megaprojects: { ...s0.megaprojects, level: 3, mandates: ["mand_compute", "mand_all"] } };
    const back = deserialize(serialize(s));
    expect(back.megaprojects.mandates).toEqual(["mand_compute", "mand_all"]);
    expect(back.megaprojects.level).toBe(3);
  });

  it("a save from before mandates existed loads with none taken", () => {
    const s0 = createInitialState();
    const raw = JSON.parse(serialize({ ...s0, megaprojects: { ...s0.megaprojects, level: 4 } }));
    delete raw.megaprojects.mandates;
    raw.version = 33; // the version that shipped before this field
    const back = deserialize(JSON.stringify(raw));
    expect(back.megaprojects.mandates).toEqual([]);
    // The picks its past cycles earned are waiting, unspent.
    expect(mandatePicksAvailable(back)).toBe(4);
  });

  it("filters hostile mandates: unknown ids, and more picks than cycles", () => {
    const s0 = createInitialState();
    const raw = JSON.parse(serialize({ ...s0, megaprojects: { ...s0.megaprojects, level: 1 } }));
    raw.megaprojects.mandates = ["mand_compute", "mand_compute", "mand_compute", "not_a_mandate", 7, null];
    const back = deserialize(JSON.stringify(raw));
    // Known ids only, and never more than the level minted.
    expect(back.megaprojects.mandates).toEqual(["mand_compute"]);
    expect(mandatePicksAvailable(back)).toBe(0);
  });

  it("is on the current save version", () => {
    expect(SAVE_VERSION).toBe(34);
  });
});

/**
 * Curve safety (CLAUDE.md hard rule). The balance sim buys research and racks and
 * ships `deploy`; it never funds a challenge, so it never completes all nine, so
 * `megaprojects.level` is 0 forever and no mandate can be earned or applied.
 */
describe("Megaproject Mandates — curve safety", () => {
  it("is unreachable in the tuned economy", () => {
    const sim = createInitialState(); // what the sim starts from and never leaves
    expect(sim.megaprojects.level).toBe(0);
    expect(sim.megaprojects.mandates).toEqual([]);
    expect(mandatePicksAvailable(sim)).toBe(0);
    const mods = challengeMods(sim);
    expect(mods.compute.toNumber()).toBe(1);
    expect(mods.data.toNumber()).toBe(1);
    expect(mods.money.toNumber()).toBe(1);
  });
});
