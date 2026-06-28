import { describe, it, expect } from "vitest";
import { charterMods, setCharter, canSetCharter, chartersUnlocked, chartersBalance } from "./charter";
import { derive } from "./derive";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";

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
});
