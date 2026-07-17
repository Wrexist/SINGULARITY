import { describe, it, expect } from "vitest";
import {
  doctrineBalance, doctrineUnlocked, committedSide, canClaimDoctrine, claimDoctrine, doctrineMods,
} from "./doctrine";
import { derive } from "./derive";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const REVEAL = doctrineBalance.revealAtShips;
const THRESH = doctrineBalance.threshold;
const TRUST = doctrineBalance.perks.find((p) => p.id === "doc_trust")!;

/** A revealed lab committed to a side (alignment past the threshold). */
function committed(side: "doomer" | "accel", ships = REVEAL) {
  const s = createInitialState();
  s.prestige.ships = ships;
  s.alignment = side === "doomer" ? -THRESH : THRESH;
  return s;
}

describe("doctrine consequences", () => {
  it("is hidden/identity until revealed AND committed (curve-safe: sim stays neutral)", () => {
    const fresh = createInitialState();
    expect(doctrineUnlocked(fresh)).toBe(false);
    expect(committedSide(fresh)).toBeNull(); // neutral → no side (the sim's state)
    expect(doctrineMods(fresh)).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
    // Revealed but neutral → nothing claimable.
    const neutral = createInitialState();
    neutral.prestige.ships = REVEAL;
    expect(doctrineUnlocked(neutral)).toBe(true);
    expect(canClaimDoctrine(neutral, "doc_trust")).toBe(false);
  });

  it("only lets you claim your COMMITTED side's perks, respecting prereqs", () => {
    const doomer = committed("doomer");
    expect(committedSide(doomer)).toBe("doomer");
    expect(canClaimDoctrine(doomer, "doc_trust")).toBe(true);   // doomer perk, committed doomer
    expect(canClaimDoctrine(doomer, "doc_scale")).toBe(false);  // accel perk, wrong side
    expect(canClaimDoctrine(doomer, "doc_longview")).toBe(false); // needs doc_trust first
    const t = claimDoctrine(doomer, "doc_trust");
    expect(t.doctrines).toContain("doc_trust");
    expect(canClaimDoctrine(t, "doc_longview")).toBe(true); // prereq now met
  });

  it("a claimed perk folds its bonus into derive (and stays after alignment resets)", () => {
    const base = committed("doomer");
    base.upgrades = { rack_basic: 10, monetize: 3 };
    const claimed = claimDoctrine(base, "doc_trust"); // +12% Money
    const ratio = derive(claimed).moneyMult.div(derive(base).moneyMult).toNumber();
    expect(ratio).toBeCloseTo(1 + TRUST.effect.value, 5);
    // Back at neutral (e.g. next run) the perk STILL applies — it's permanent.
    const neutralAgain = { ...claimed, alignment: 0 };
    expect(doctrineMods(neutralAgain).moneyMult).toBeCloseTo(1 + TRUST.effect.value, 6);
  });

  it("persists across prestige and round-trips; unknown ids are dropped", () => {
    let s = committed("accel");
    s.research = [balance.prestige.capabilityResearch];
    s.lifetimeMoney = Big.of(1e6);
    s = claimDoctrine(s, "doc_scale");
    expect(prestige(s).doctrines).toContain("doc_scale"); // survives the ship
    expect(deserialize(serialize(s)).doctrines).toContain("doc_scale");
    const crafted = JSON.parse(serialize(s));
    crafted.doctrines = ["doc_scale", "doc_bogus"];
    expect(deserialize(JSON.stringify(crafted)).doctrines).toEqual(["doc_scale"]);
  });
});
