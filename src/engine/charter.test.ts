import { describe, it, expect } from "vitest";
import { charterMods, setCharter, canSetCharter, chartersUnlocked, chartersBalance, lockCharter, charterHand, charterRule } from "./charter";
import { researchCost, applyWorldEventChoice } from "./actions";
import { ALL_RESEARCH } from "./researchTree";
const RESEARCH_BY_ID = Object.fromEntries(ALL_RESEARCH.map((r) => [r.id, r]));
import { derive } from "./derive";
import { prestige, legacyWeightsForMode, charterConvictionMult } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

function shipped() {
  const s = createInitialState();
  s.prestige.ships = 1;
  return s;
}
const firstCharter = chartersBalance.list[0]!; // open_source: +data, -money

/** A just-shipped lab whose dealt hand is certain to hold `id`: last run flew it, and
 *  the hand always keeps last run's charter. */
function dealt(id: string, ships = 1) {
  const s = shipped();
  s.prestige.ships = Math.max(ships, chartersBalance.list.find((c) => c.id === id)?.minShips ?? 0);
  s.lastCharter = id;
  return s;
}
/** Adopt a charter directly (mods tests don't care which hand dealt it). */
const adopted = (id: string) => ({ ...shipped(), charter: id });

describe("R6.1 — Lab Charters", () => {
  it("are locked until the first ship", () => {
    expect(chartersUnlocked(createInitialState())).toBe(false);
    expect(chartersUnlocked(shipped())).toBe(true);
  });

  it("identity when none is set — a charter-less run is the baseline", () => {
    expect(charterMods(createInitialState())).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
  });

  it("applies the chosen lane tilts in derive", () => {
    const base = shipped();
    const open = setCharter(base, "open_source");
    expect(open.charter).toBe("open_source");
    // +data, -money vs the same state without a charter.
    expect(derive(open).dataMult.toNumber()).toBeGreaterThan(derive(base).dataMult.toNumber());
    expect(derive(open).runMoneyYield.toNumber()).toBeLessThan(derive(base).runMoneyYield.toNumber());
    expect(charterMods(open).dataMult).toBeCloseTo(1 + (firstCharter.dataMult ?? 0), 6);
  });

  it("can only be set/changed while the run is fresh (no research yet)", () => {
    const fresh = shipped();
    expect(canSetCharter(fresh)).toBe(true);
    const started = { ...fresh, research: ["seed"] };
    expect(canSetCharter(started)).toBe(false);
    expect(setCharter(started, "moonshot")).toBe(started); // locked → no-op
  });

  it("rejects unknown charter ids", () => {
    expect(setCharter(shipped(), "not_a_charter").charter).toBeNull();
  });

  it("resets to null on prestige (fresh run, fresh choice)", () => {
    let s = setCharter(dealt("moonshot"), "moonshot");
    expect(s.charter).toBe("moonshot");
    s = { ...s, research: ["inference_api"] }; // commit a path → locks charter + meets ship gate
    const next = prestige(s);
    expect(next.prestige.ships).toBe(2); // the ship actually fired
    expect(next.charter).toBeNull();
  });

  it("survives a save round-trip and migrates from a pre-charter save", () => {
    const s = setCharter(dealt("bootstrapped"), "bootstrapped");
    expect(deserialize(serialize(s)).charter).toBe("bootstrapped");
    const old = JSON.parse(serialize(s));
    delete old.charter; old.version = 12;
    expect(deserialize(JSON.stringify(old)).charter).toBeNull();
  });

  it("every charter is a real, non-neutral build with unique id + finite mods", () => {
    const ids = chartersBalance.list.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // no dup ids
    expect(ids.length).toBeGreaterThanOrEqual(7); // expanded pool (more build options)
    for (const c of chartersBalance.list) {
      const m = charterMods(adopted(c.id));
      // finite, positive lane mults
      for (const v of [m.computeMult, m.dataMult, m.moneyMult]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
      // at least one lane tilts OR a rule changes (it's a real choice, not a no-op)
      const rule = Object.values(charterRule(adopted(c.id)));
      for (const v of rule) expect(Number.isFinite(v) && v > 0 && v !== 1).toBe(true);
      expect(m.computeMult !== 1 || m.dataMult !== 1 || m.moneyMult !== 1 || rule.length > 0).toBe(true);
    }
  });

  it("new charters tilt the lanes they advertise", () => {
    expect(charterMods(adopted("data_monopoly")).dataMult).toBeGreaterThan(1);
    expect(charterMods(adopted("data_monopoly")).computeMult).toBeLessThan(1);
    expect(charterMods(adopted("cash_machine")).moneyMult).toBeGreaterThan(1);
    expect(charterMods(adopted("mad_science")).computeMult).toBeGreaterThan(1);
  });

  describe("B1 — charter conviction prestige bonus", () => {
    // A shippable state with a chosen charter and a given previous-run charter.
    function readyToShip(charter: string | null, lastCharter: string | null) {
      const s = shipped();
      s.research = [balance.prestige.capabilityResearch];
      s.lifetimeMoney = Big.of("1e8");
      return { ...s, charter, lastCharter };
    }

    it("is identity unless the charter matches last run's (curve-safe)", () => {
      expect(charterConvictionMult(readyToShip(null, null))).toBe(1);
      expect(charterConvictionMult(readyToShip("moonshot", null))).toBe(1);
      expect(charterConvictionMult(readyToShip("moonshot", "bootstrapped"))).toBe(1);
      expect(charterConvictionMult({ ...readyToShip("moonshot", "moonshot"), charterStreak: 1 })).toBe(balance.prestige.charterConvictionLadder[0]);
    });

    it("escalates with the consecutive-same-charter streak, capped on the ladder", () => {
      const L = balance.prestige.charterConvictionLadder;
      // streak 2 (this ship + 1 prior) → rung 0; streak 3 → rung 1; 4+ → capped.
      expect(charterConvictionMult({ ...readyToShip("moonshot", "moonshot"), charterStreak: 2 })).toBe(L[1]);
      expect(charterConvictionMult({ ...readyToShip("moonshot", "moonshot"), charterStreak: 3 })).toBe(L[2]);
      expect(charterConvictionMult({ ...readyToShip("moonshot", "moonshot"), charterStreak: 99 })).toBe(L[L.length - 1]);
      // A fresh pick resets the bonus entirely regardless of an old long streak.
      expect(charterConvictionMult({ ...readyToShip("bootstrapped", "moonshot"), charterStreak: 99 })).toBe(1);
    });

    it("prestige advances and resets the streak correctly", () => {
      // Same charter again → streak climbs (1 → 2).
      const again = prestige({ ...readyToShip("moonshot", "moonshot"), charterStreak: 1 });
      expect(again.charterStreak).toBe(2);
      expect(again.lastCharter).toBe("moonshot");
      // A different pick → streak restarts at 1 for the NEW charter's next run…
      const switched = prestige({ ...readyToShip("cash_machine", "moonshot"), charterStreak: 3 });
      expect(switched.lastCharter).toBe("cash_machine");
      expect(switched.charterStreak).toBe(1);
      // …and no charter at all → 0.
      expect(prestige(readyToShip(null, null)).charterStreak).toBe(0);
    });

    it("multiplies banked Legacy when you double down on a charter", () => {
      const base = legacyWeightsForMode(readyToShip("moonshot", "bootstrapped"), "deploy").toNumber();
      const conv = legacyWeightsForMode(readyToShip("moonshot", "moonshot"), "deploy").toNumber();
      expect(conv).toBeGreaterThan(base);
    });

    it("prestige records the shipped charter as lastCharter for next run", () => {
      const next = prestige(readyToShip("moonshot", null));
      expect(next.lastCharter).toBe("moonshot");
      expect(next.charter).toBeNull(); // fresh run picks anew
    });

    it("survives a save round-trip; old saves migrate with no prior charter", () => {
      const s = { ...shipped(), lastCharter: "cash_machine" };
      expect(deserialize(serialize(s)).lastCharter).toBe("cash_machine");
      const old = JSON.parse(serialize(s));
      delete old.lastCharter; old.version = 14;
      expect(deserialize(JSON.stringify(old)).lastCharter).toBeNull();
    });
  });
});

describe("charter explicit lock (owner UX fix)", () => {
  it("locks the pick and blocks further changes; research=0 no longer unlocks it", () => {
    const s = createInitialState();
    s.prestige.ships = 1;
    const withPick = setCharter(s, chartersBalance.list[0]!.id);
    const locked = lockCharter(withPick);
    expect(locked.charterLocked).toBe(true);
    expect(canSetCharter(locked)).toBe(false);
    // Attempts to change after locking are no-ops.
    expect(setCharter(locked, chartersBalance.list[1]!.id)).toBe(locked);
  });

  it("cannot lock nothing, and the lock resets on prestige", () => {
    const s = createInitialState();
    s.prestige.ships = 1;
    expect(lockCharter(s)).toBe(s); // no charter picked → no-op
    let picked = lockCharter(setCharter(s, chartersBalance.list[0]!.id));
    picked.research = ["inference_api"]; // meet the ship gate
    const shipped = prestige(picked);
    expect(shipped.charterLocked).toBe(false);
  });
});

describe("Charter draft (2026-09)", () => {
  const H = chartersBalance.handSize;
  const RULES = chartersBalance.list.filter((c) => c.rule);
  const isRule = (id: string) => RULES.some((c) => c.id === id);
  const at = (ships: number, lastCharter: string | null = null) => {
    const s = shipped();
    s.prestige.ships = ships;
    s.lastCharter = lastCharter;
    return s;
  };

  it("deals a hand of distinct known charters, the same hand for the same ship", () => {
    expect(charterHand(createInitialState())).toEqual([]); // before the unlock
    for (let ships = 1; ships <= 40; ships++) {
      const hand = charterHand(at(ships));
      expect(hand.length).toBe(H);
      expect(new Set(hand).size).toBe(H);
      for (const id of hand) expect(chartersBalance.list.some((c) => c.id === id)).toBe(true);
      expect(charterHand(at(ships))).toEqual(hand);
    }
  });

  it("varies from ship to ship", () => {
    const hands = new Set<string>();
    for (let ships = 1; ships <= 20; ships++) hands.add(charterHand(at(ships)).slice().sort().join(","));
    expect(hands.size).toBeGreaterThan(8);
  });

  it("always keeps last run's charter, so a conviction streak can continue", () => {
    for (const c of chartersBalance.list) {
      const ships = Math.max(8, c.minShips ?? 0);
      expect(charterHand(at(ships, c.id))).toContain(c.id);
    }
  });

  it("deals no rule charter before its unlock, and exactly one wild card after", () => {
    const unlock = Math.min(...RULES.map((c) => c.minShips ?? 0));
    for (let ships = 1; ships < unlock; ships++) expect(charterHand(at(ships)).some(isRule)).toBe(false);
    for (let ships = unlock; ships <= unlock + 30; ships++) {
      expect(charterHand(at(ships)).filter(isRule).length).toBe(1);
      expect(charterHand(at(ships, "moonshot")).filter(isRule).length).toBe(1);
    }
  });

  it("only adopts a charter from the hand (or the one already adopted)", () => {
    const s = at(3);
    const hand = charterHand(s);
    const outside = chartersBalance.list.find((c) => !hand.includes(c.id) && (c.minShips ?? 0) <= 3)!;
    expect(setCharter(s, outside.id)).toBe(s);
    const picked = setCharter(s, hand[0]!);
    expect(picked.charter).toBe(hand[0]);
    // A charter already adopted (e.g. from a save made before the draft) stays settable.
    const legacy = { ...s, charter: outside.id };
    expect(setCharter(legacy, outside.id).charter).toBe(outside.id);
    expect(setCharter(legacy, null).charter).toBeNull();
  });

  it("Research Sprint halves research Compute and raises its Data", () => {
    const def = RESEARCH_BY_ID["backprop"]!;
    const plain = researchCost(shipped(), def);
    const sprint = researchCost(adopted("research_sprint"), def);
    expect(sprint.compute.toNumber()).toBeCloseTo(plain.compute.toNumber() * 0.5, 6);
    expect(sprint.data.toNumber()).toBeCloseTo(plain.data.toNumber() * 1.8, 6);
  });

  it("Product Company multiplies product ARPU", () => {
    const base = derive(shipped()).productMods.arpu;
    expect(derive(adopted("product_company")).productMods.arpu).toBeCloseTo(base * 2.5, 9);
  });

  it("True Believers doubles how far a faction choice moves you", () => {
    const ev = balance.worldEvents.list.find((e) => e.choices?.length)!;
    const plain = applyWorldEventChoice(shipped(), ev.id, 0).state.alignment;
    const doubled = applyWorldEventChoice(adopted("true_believers"), ev.id, 0).state.alignment;
    expect(doubled).toBeCloseTo(Math.max(-1, Math.min(1, plain * 2)), 9);
  });

  it("is identity with no charter (the sim's state)", () => {
    const s = createInitialState();
    expect(charterRule(s)).toEqual({});
    const def = RESEARCH_BY_ID["backprop"]!;
    expect(researchCost(s, def).compute.toNumber()).toBe(def.cost.compute * balance.difficulty.costMult);
  });
});
