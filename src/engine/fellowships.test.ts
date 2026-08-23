import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import {
  instituteBalance, fellowshipsUnlocked, fellowshipCost, fellowshipCostSum,
  canEndowFellowship, endowFellowship, fellowName, fellowshipMult, instituteMods,
  grantsAvailable,
} from "./institute";
import type { GameState } from "./types";

const ALL_WINGS = instituteBalance.perks.map((p) => p.id);

/** A lab that has ascended `n` times and founded every wing. */
function founded(ascensions: number): GameState {
  const s = createInitialState();
  return {
    ...s,
    institute: [...ALL_WINGS],
    stats: { ...s.stats, ascensions },
  };
}

describe("Institute Fellowships", () => {
  it("stays completely inert on a fresh save (the sim's state)", () => {
    // The curve-safety argument: the deploy-only balance sim EARNS Grants (it ascends)
    // but never spends them, so it never founds a wing — and Fellowships require every
    // wing. This must therefore be identity through the whole tuned run.
    const s = createInitialState();
    expect(fellowshipsUnlocked(s)).toBe(false);
    expect(fellowshipMult(s)).toBe(1);
    expect(canEndowFellowship(s)).toBe(false);
    const mods = instituteMods(s);
    expect(mods.computeMult).toBe(1);
    expect(mods.dataMult).toBe(1);
    expect(mods.moneyMult).toBe(1);
  });

  it("stays inert for a lab that has ascended many times but founded no wings", () => {
    // Exactly the sim's shape: lots of ascensions, zero meta spending.
    const s = createInitialState();
    const simLike = { ...s, stats: { ...s.stats, ascensions: 50 } };
    expect(grantsAvailable(simLike)).toBeGreaterThan(0); // it EARNS grants…
    expect(fellowshipsUnlocked(simLike)).toBe(false);    // …and still can't reach chairs
    expect(instituteMods(simLike).computeMult).toBe(1);
  });

  it("unlocks only once every wing is founded", () => {
    const partial = { ...founded(99), institute: ALL_WINGS.slice(0, -1) };
    expect(fellowshipsUnlocked(partial)).toBe(false);
    expect(fellowshipsUnlocked(founded(99))).toBe(true);
  });

  it("charges an escalating Grant cost and pays a growing multiplier", () => {
    let s = founded(200);
    const first = fellowshipCost(s);
    expect(first).toBe(instituteBalance.fellowships.baseCost);
    s = endowFellowship(s);
    expect(s.instituteFellowships).toBe(1);
    expect(fellowshipCost(s)).toBeGreaterThan(first);
    expect(fellowshipMult(s)).toBeCloseTo(1 + instituteBalance.fellowships.perLevel, 10);
    // The chair multiplier folds into every lane.
    const mods = instituteMods(s);
    expect(mods.computeMult).toBeGreaterThan(instituteMods(founded(200)).computeMult);
  });

  it("cannot be endowed without the Grants to pay for it", () => {
    // Wings cost 9 Grants total, so 9 ascensions leaves nothing over.
    const broke = founded(9);
    expect(grantsAvailable(broke)).toBe(0);
    expect(canEndowFellowship(broke)).toBe(false);
    expect(endowFellowship(broke)).toBe(broke); // pure no-op
  });

  it("names each chair deterministically and never blanks", () => {
    const names = new Set<string>();
    for (let n = 1; n <= instituteBalance.fellowships.names.length * 2 + 3; n++) {
      const name = fellowName(n);
      expect(name.length).toBeGreaterThan(0);
      names.add(name);
    }
    // Cycling past the list end must still produce distinct chairs, not repeats.
    expect(names.size).toBe(instituteBalance.fellowships.names.length * 2 + 3);
    expect(fellowName(1)).toBe(fellowName(1)); // stable
  });

  it("round-trips through save and survives migration from v31", () => {
    let s = founded(200);
    s = endowFellowship(endowFellowship(s));
    const back = deserialize(serialize(s));
    expect(back.instituteFellowships).toBe(2);
    expect(back.institute.sort()).toEqual([...ALL_WINGS].sort());

    // A v31 save (pre-Fellowships) loads with zero chairs, wings untouched.
    const old = JSON.parse(serialize(s));
    old.version = 31;
    delete old.instituteFellowships;
    const migrated = deserialize(JSON.stringify(old));
    expect(migrated.instituteFellowships).toBe(0);
    expect(migrated.institute.length).toBe(ALL_WINGS.length);
  });

  it("clamps a crafted chair count to what the player's ascensions could fund", () => {
    // The anti-cheat policy used by the perk tree / Endowment / wings: claiming chairs
    // you never earned must not bank free permanent output.
    const s = founded(12); // 12 grants; wings eat 9, so 3 are left over
    const crafted = JSON.parse(serialize({ ...s, instituteFellowships: 9999 }));
    const loaded = deserialize(JSON.stringify(crafted));
    // 3 leftover grants buys chair 1 (2) but not chair 2 (ceil(2*1.35)=3) -> 1 chair.
    expect(loaded.instituteFellowships).toBeLessThanOrEqual(2);
    expect(fellowshipCostSum(loaded.instituteFellowships)).toBeLessThanOrEqual(3);
  });

  it("drops claimed chairs entirely when the wings aren't all founded", () => {
    const s = createInitialState();
    const crafted = JSON.parse(serialize({ ...s, stats: { ...s.stats, ascensions: 500 }, instituteFellowships: 40 }));
    expect(deserialize(JSON.stringify(crafted)).instituteFellowships).toBe(0);
  });
});
