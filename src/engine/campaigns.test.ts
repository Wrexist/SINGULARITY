import { describe, it, expect } from "vitest";
import {
  bankCampaign, campaignRep, campaignSponsor, campaignView, contractsReputation, contractsBalance,
  isLadderContractId, rollSponsor, sponsorIdFor, sponsorView, weekOf, weekStartDay,
} from "./contracts";
import { objectiveMetric } from "./objectives";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import type { GameState } from "./types";

/**
 * AUDIT 2026-08 #5 — weekly Sponsor Campaigns. The week is DERIVED from the sponsor
 * completions every save already keeps; the only new record is the banked campaign,
 * which pays Reputation behind a claim (curve-safe) and must never be mintable from
 * a crafted save.
 */
const K = contractsBalance.campaign;

/** A lab whose daily sponsors are open, with today's sponsor rolled on `day`. */
function lab(day: number): GameState {
  const s = createInitialState();
  s.prestige = { ...s.prestige, ships: Math.max(1, contractsBalance.sponsor.openAtShips) };
  return rollSponsor(s, day);
}
const withSponsorDays = (s: GameState, days: number[]): GameState => ({
  ...s,
  contracts: { completed: [...s.contracts.completed, ...days.map(sponsorIdFor)] },
});

// Week 2938 starts on a Monday (day 20563 = 2026-04-20): weeks run Monday → Sunday.
const WEEK = 2938;
const MON = weekStartDay(WEEK);

describe("sponsor campaign weeks", () => {
  it("run Monday to Sunday over the local day number", () => {
    expect(weekOf(4)).toBe(1); // Mon 5 Jan 1970 opens week 1
    expect(weekOf(3)).toBe(0); // Sun 4 Jan 1970 closes week 0
    expect(weekOf(10)).toBe(1);
    expect(weekOf(11)).toBe(2);
    expect(new Date(MON * 86_400_000).getUTCDay()).toBe(1); // a Monday
    for (let d = 0; d < 7; d++) expect(weekOf(MON + d)).toBe(WEEK);
  });

  it("run every daily sponsor of a week under the campaign's banner", () => {
    for (let d = 0; d < 7; d++) expect(sponsorView(lab(MON + d))!.def.title).toBe(campaignSponsor(WEEK));
  });
});

describe("sponsor campaign progress and banking", () => {
  it("has no campaign without a daily sponsor", () => {
    expect(campaignView(createInitialState())).toBeNull();
  });

  it("needs five of seven sponsor days — any five, no streak", () => {
    const today = MON + 6;
    const four = withSponsorDays(lab(today), [MON, MON + 2, MON + 4, MON + 6]);
    expect(campaignView(four)!.done).toBe(4);
    expect(campaignView(four)!.ready).toBe(false);
    expect(bankCampaign(four)).toBe(four); // same-ref no-op when unmet
    const five = withSponsorDays(four, [MON + 1]);
    const v = campaignView(five)!;
    expect(v.days).toEqual([true, true, true, false, true, false, true]);
    expect(v.today).toBe(6);
    expect(v.ready).toBe(true);
    // Sponsor days from the neighbouring weeks never count toward this one.
    expect(campaignView(withSponsorDays(lab(today), [MON - 1, MON + 7, MON, MON + 1, MON + 2, MON + 3]))!.done).toBe(4);
  });

  it("banks once, lifts the Sponsor Tier, and pays the tier's bonus in Reputation", () => {
    const s = withSponsorDays(lab(MON + 5), [MON, MON + 1, MON + 2, MON + 3, MON + 4]);
    const before = contractsReputation(s);
    const banked = bankCampaign(s);
    expect(campaignView(banked)!.claimed).toBe(true);
    expect(campaignView(banked)!.tier).toBe(1);
    expect(contractsReputation(banked) - before).toBe(K.rep);
    expect(bankCampaign(banked)).toBe(banked); // once per week
  });

  it("scales the bonus with the tier, capped", () => {
    expect(campaignRep(0)).toBe(K.rep);
    expect(campaignRep(1)).toBe(K.rep + K.perTier);
    expect(campaignRep(K.tierCap)).toBe(campaignRep(K.tierCap + 50));
    expect(campaignRep(K.tierCap)).toBe(K.rep + K.perTier * K.tierCap);
  });

  it("banks a met-but-unclaimed campaign when the next week's sponsor rolls", () => {
    const met = withSponsorDays(lab(MON + 6), [MON, MON + 1, MON + 2, MON + 3, MON + 4]);
    const next = rollSponsor(met, MON + 7);
    expect(next.contracts.completed).toContain(`campaign_${WEEK}`);
    expect(campaignView(next)!.weekKey).toBe(WEEK + 1);
    expect(campaignView(next)!.tier).toBe(1);
    // An unmet week banks nothing at the rollover.
    const unmet = rollSponsor(withSponsorDays(lab(MON + 6), [MON, MON + 1]), MON + 7);
    expect(unmet.contracts.completed.some((id) => id.startsWith("campaign_"))).toBe(false);
  });

  it("never counts campaign records as ladder contracts", () => {
    expect(isLadderContractId(`campaign_${WEEK}`)).toBe(false);
    expect(isLadderContractId(sponsorIdFor(MON))).toBe(false);
    expect(isLadderContractId(contractsBalance.pool[0]!.id)).toBe(true);
    const banked = bankCampaign(withSponsorDays(lab(MON + 5), [MON, MON + 1, MON + 2, MON + 3, MON + 4]));
    expect(objectiveMetric(banked, "contracts")).toBe(0);
  });
});

describe("sponsor campaigns in the save", () => {
  it("round-trips a banked campaign", () => {
    const banked = bankCampaign(withSponsorDays(lab(MON + 5), [MON, MON + 1, MON + 2, MON + 3, MON + 4]));
    const back = deserialize(serialize(banked));
    expect(back.contracts.completed).toContain(`campaign_${WEEK}`);
    expect(contractsReputation(back)).toBe(contractsReputation(banked));
  });

  it("drops a crafted campaign record with no sponsor days behind it, and duplicates", () => {
    const s = lab(MON + 5);
    const forged = { ...s, contracts: { completed: [`campaign_${WEEK}`, `campaign_${WEEK + 1}`, ...[MON, MON + 1, MON + 2].map(sponsorIdFor)] } };
    const back = deserialize(serialize(forged));
    expect(back.contracts.completed.filter((id) => id.startsWith("campaign_"))).toEqual([]);
    const real = withSponsorDays(s, [MON, MON + 1, MON + 2, MON + 3, MON + 4]);
    const duped = { ...real, contracts: { completed: [...real.contracts.completed, `campaign_${WEEK}`, `campaign_${WEEK}`] } };
    const kept = deserialize(serialize(duped)).contracts.completed.filter((id) => id.startsWith("campaign_"));
    expect(kept).toEqual([`campaign_${WEEK}`]);
  });
});
