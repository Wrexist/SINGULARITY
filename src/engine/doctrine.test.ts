import { describe, it, expect } from "vitest";
import {
  doctrineBalance, doctrineUnlocked, committedSide, canClaimDoctrine, claimDoctrine, doctrineMods,
  doctrinePerks, perksPerSide, schismDepth, schismRevealed,
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

/**
 * Doctrine Schisms (2026-08 depth pass). The two side tracks were terminal — claim
 * your three and the system is finished. The Schism is the third track, and the only
 * content that cannot be reached by committing harder: every rung requires perks held
 * on BOTH sides, and is claimed while UNCOMMITTED.
 */
describe("Doctrine Schisms", () => {
  const SCHISMS = doctrinePerks().filter((p) => p.side === "schism");
  const R1 = SCHISMS[0]!;

  /** A veteran at a given alignment holding `held` perks. */
  const at = (alignment: number, held: string[] = []) => {
    const s = createInitialState();
    return { ...s, alignment, prestige: { ...s.prestige, ships: 20 }, doctrines: held };
  };
  const ONE_EACH = ["doc_trust", "doc_scale"];
  const TWO_EACH = ["doc_trust", "doc_clean", "doc_scale", "doc_ship"];
  const ALL_SIX = [...TWO_EACH, "doc_longview", "doc_frontier"];

  it("is never a side you can commit to", () => {
    for (const a of [-1, -0.5, 0, 0.5, 1]) expect(committedSide(at(a))).not.toBe("schism");
  });

  it("counts depth as the WEAKER side, so a lopsided run qualifies for nothing", () => {
    expect(schismDepth(at(0, ALL_SIX.filter((id) => id.startsWith("doc_t") || id === "doc_clean" || id === "doc_longview")))).toBe(0);
    expect(schismDepth(at(0, ONE_EACH))).toBe(1);
    expect(schismDepth(at(0, TWO_EACH))).toBe(2);
    expect(schismDepth(at(0, ALL_SIX))).toBe(3);
  });

  it("does not let Schism perks count toward their own prerequisite", () => {
    // Holding rung I must not inflate the depth that rung II measures.
    const s = at(0, [...ONE_EACH, R1.id]);
    expect(schismDepth(s)).toBe(1);
    expect(perksPerSide(s)).toEqual({ doomer: 1, accel: 1 });
  });

  it("stays hidden until a perk is held on both sides", () => {
    expect(schismRevealed(at(0))).toBe(false);
    expect(schismRevealed(at(0, ["doc_trust", "doc_clean", "doc_longview"]))).toBe(false);
    expect(schismRevealed(at(0, ONE_EACH))).toBe(true);
  });

  it("claims from the CENTER — committing to a side closes it", () => {
    expect(canClaimDoctrine(at(0, ONE_EACH), R1.id)).toBe(true);
    expect(canClaimDoctrine(at(-1, ONE_EACH), R1.id)).toBe(false);
    expect(canClaimDoctrine(at(1, ONE_EACH), R1.id)).toBe(false);
    // …and exactly at the commit threshold it is committed, so closed.
    expect(canClaimDoctrine(at(doctrineBalance.threshold, ONE_EACH), R1.id)).toBe(false);
  });

  it("refuses a rung short of its both-sides depth, whatever the alignment", () => {
    for (const p of SCHISMS) {
      const held = ["doc_trust", "doc_scale"]; // depth 1
      const s = at(0, [...held, ...SCHISMS.slice(0, SCHISMS.indexOf(p)).map((q) => q.id)]);
      expect(canClaimDoctrine(s, p.id)).toBe(schismDepth(s) >= p.minPerSide!);
    }
  });

  it("climbs in order: each rung needs the one below", () => {
    for (let i = 1; i < SCHISMS.length; i++) {
      expect(SCHISMS[i]!.requires).toBe(SCHISMS[i - 1]!.id);
      // Full depth but no prerequisite → still refused.
      expect(canClaimDoctrine(at(0, ALL_SIX), SCHISMS[i]!.id)).toBe(false);
    }
  });

  it("opens the whole track to a player who walked both sides in full", () => {
    let s = at(0, ALL_SIX);
    for (const p of SCHISMS) {
      expect(canClaimDoctrine(s, p.id)).toBe(true);
      s = claimDoctrine(s, p.id);
    }
    expect(s.doctrines).toHaveLength(ALL_SIX.length + SCHISMS.length);
  });

  it("pays every lane, multiplying with the side perks already held", () => {
    const base = doctrineMods(at(0, ONE_EACH));
    const withR1 = doctrineMods(at(0, [...ONE_EACH, R1.id]));
    for (const lane of ["computeMult", "dataMult", "moneyMult"] as const) {
      expect(withR1[lane] / base[lane]).toBeCloseTo(1 + R1.effect.value, 9);
    }
  });

  it("round-trips through save/load", () => {
    const s = at(0, [...ALL_SIX, ...SCHISMS.map((p) => p.id)]);
    const back = deserialize(serialize(s));
    expect(back.doctrines).toEqual(s.doctrines);
    expect(doctrineMods(back)).toEqual(doctrineMods(s));
  });

  it("filters an unknown Schism-shaped id from a crafted save", () => {
    const raw = JSON.parse(serialize(at(0, ONE_EACH)));
    raw.doctrines = [...ONE_EACH, "doc_not_a_schism", 7, null];
    const back = deserialize(JSON.stringify(raw));
    expect(back.doctrines).toEqual(ONE_EACH);
  });

  it("is curve-safe: the sim sits at neutral forever and still qualifies for nothing", () => {
    const sim = createInitialState();
    // The sim WOULD pass the alignment gate — it is uncommitted by construction — so
    // the both-sides prerequisite is what actually holds the line here.
    expect(committedSide(sim)).toBeNull();
    expect(schismDepth(sim)).toBe(0);
    expect(schismRevealed(sim)).toBe(false);
    const deep = { ...sim, prestige: { ...sim.prestige, ships: 999 } };
    for (const p of SCHISMS) expect(canClaimDoctrine(deep, p.id)).toBe(false);
    expect(doctrineMods(sim)).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
  });
});
