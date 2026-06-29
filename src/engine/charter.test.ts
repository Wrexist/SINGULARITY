import { describe, it, expect } from "vitest";
import { charterMods, setCharter, canSetCharter, chartersUnlocked, chartersBalance } from "./charter";
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
    let s = setCharter(shipped(), "moonshot");
    expect(s.charter).toBe("moonshot");
    s = { ...s, research: ["inference_api"] }; // commit a path → locks charter + meets ship gate
    const next = prestige(s);
    expect(next.prestige.ships).toBe(2); // the ship actually fired
    expect(next.charter).toBeNull();
  });

  it("survives a save round-trip and migrates from a pre-charter save", () => {
    const s = setCharter(shipped(), "bootstrapped");
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
      const m = charterMods(setCharter(shipped(), c.id));
      // finite, positive lane mults
      for (const v of [m.computeMult, m.dataMult, m.moneyMult]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
      // at least one lane actually tilts (it's a real choice, not a no-op)
      expect(m.computeMult !== 1 || m.dataMult !== 1 || m.moneyMult !== 1).toBe(true);
    }
  });

  it("new charters tilt the lanes they advertise", () => {
    expect(charterMods(setCharter(shipped(), "data_monopoly")).dataMult).toBeGreaterThan(1);
    expect(charterMods(setCharter(shipped(), "data_monopoly")).computeMult).toBeLessThan(1);
    expect(charterMods(setCharter(shipped(), "cash_machine")).moneyMult).toBeGreaterThan(1);
    expect(charterMods(setCharter(shipped(), "mad_science")).computeMult).toBeGreaterThan(1);
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
      expect(charterConvictionMult(readyToShip("moonshot", "moonshot"))).toBe(balance.prestige.charterConvictionBonus);
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
