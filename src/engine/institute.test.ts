import { describe, it, expect } from "vitest";
import {
  instituteBalance, instituteUnlocked, earnedGrants, grantsAvailable, canBuyInstitute, buyInstitute, instituteMods, grantsSpent,
} from "./institute";
import { derive } from "./derive";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const FOUND = instituteBalance.foundAtAscensions;
const COMPUTE = instituteBalance.perks.find((p) => p.id === "inst_compute")!;

/** A post-ascension lab with `asc` ascensions banked (→ Grants). */
function ascended(asc = FOUND) {
  const s = createInitialState();
  s.prestige.ships = 12;
  s.stats.ascensions = asc;
  return s;
}

describe("the institute (third meta-layer)", () => {
  it("is hidden and identity until the founding ascension (curve-safe)", () => {
    const fresh = createInitialState();
    expect(instituteUnlocked(fresh)).toBe(false);
    expect(earnedGrants(fresh)).toBe(0);
    expect(instituteMods(fresh)).toEqual({ computeMult: 1, dataMult: 1, moneyMult: 1 });
    expect(instituteUnlocked(ascended(FOUND - 1 >= 0 ? FOUND - 1 : 0))).toBe(FOUND === 0);
    expect(instituteUnlocked(ascended())).toBe(true);
  });

  it("mints one Grant per ascension and folds a founded wing into derive", () => {
    const s = ascended(1);
    expect(earnedGrants(s)).toBe(1 * instituteBalance.grantsPerAscension);
    expect(canBuyInstitute(s, "inst_synthesis")).toBe(false); // needs inst_compute + 2 grants
    expect(canBuyInstitute(s, "inst_compute")).toBe(true);
    const founded = buyInstitute(s, "inst_compute");
    expect(founded.institute).toContain("inst_compute");
    expect(grantsSpent(founded)).toBe(COMPUTE.cost);
    expect(grantsAvailable(founded)).toBe(earnedGrants(s) - COMPUTE.cost);
    const ratio = derive({ ...founded, upgrades: { rack_basic: 10 } }).computePerSec
      .div(derive({ ...s, upgrades: { rack_basic: 10 } }).computePerSec).toNumber();
    expect(ratio).toBeCloseTo(1 + COMPUTE.effect.value, 5); // +40% Compute
  });

  it("gates deeper wings on Grants AND prereqs; can't overspend", () => {
    const poor = ascended(1); // only 1 grant
    const withCompute = buyInstitute(poor, "inst_compute"); // spends the 1 grant
    expect(grantsAvailable(withCompute)).toBe(0);
    expect(canBuyInstitute(withCompute, "inst_synthesis")).toBe(false); // prereq met but 0 grants
    const rich = ascended(3); // 3 grants
    const c = buyInstitute(rich, "inst_compute");
    expect(canBuyInstitute(c, "inst_synthesis")).toBe(true); // 2 grants left, prereq met
  });

  it("persists across prestige and round-trips; unknown ids dropped", () => {
    let s = ascended(2);
    s.research = [balance.prestige.capabilityResearch];
    s.lifetimeMoney = Big.of(1e6);
    s = buyInstitute(s, "inst_compute");
    expect(prestige(s).institute).toContain("inst_compute"); // survives the ship
    expect(deserialize(serialize(s)).institute).toContain("inst_compute");
    const crafted = JSON.parse(serialize(s));
    crafted.institute = ["inst_compute", "inst_bogus"];
    expect(deserialize(JSON.stringify(crafted)).institute).toEqual(["inst_compute"]);
  });
});
