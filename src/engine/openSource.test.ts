import { describe, it, expect } from "vitest";
import { prestige } from "./prestige";
import { earnedReputation } from "./reputation";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const OS = balance.prestige.shipModes.open_source;

function shippable() {
  const s = createInitialState();
  s.research = ["inference_api"]; // meets the prestige gate
  s.lifetimeMoney = Big.of(1e6);
  s.resources.money = Big.of(1e6);
  return s;
}

describe("Open-source ship — community gains", () => {
  it("counts the open-source ship and raises earned Reputation", () => {
    const s = shippable();
    const repBefore = earnedReputation(s);
    const os = prestige(s, "open_source");
    expect(os.stats.openSourceShips).toBe(1);
    expect(earnedReputation(os)).toBeGreaterThan(repBefore); // ship + open-source bonus
  });

  it("reputation rises by exactly the open-source bonus (beyond the normal per-ship)", () => {
    const s = shippable();
    const deployRep = earnedReputation(prestige(s, "deploy"));   // +perShip only
    const osRep = earnedReputation(prestige(s, "open_source"));  // +perShip +bonus
    expect(osRep - deployRep).toBe(OS.reputationBonus);
  });

  it("leaves a temporary community-momentum buff on the next run (all three lanes)", () => {
    const os = prestige(shippable(), "open_source");
    const mom = os.modifiers.filter((m) => m.id.startsWith("momentum_"));
    expect(mom).toHaveLength(3);
    expect(mom.every((m) => m.factor === OS.momentum!.factor && m.remainingSec === OS.momentum!.durationSec)).toBe(true);
    expect(new Set(mom.map((m) => m.target))).toEqual(new Set(["computeMult", "dataMult", "moneyMult"]));
  });

  it("deploy grants neither the bonus reputation nor momentum", () => {
    const dep = prestige(shippable(), "deploy");
    expect(dep.stats.openSourceShips).toBe(0);
    expect(dep.modifiers.filter((m) => m.id.startsWith("momentum_"))).toHaveLength(0);
  });

  it("openSourceShips survives a save round-trip", () => {
    const os = prestige(shippable(), "open_source");
    expect(deserialize(serialize(os)).stats.openSourceShips).toBe(1);
  });
});
