/**
 * Lab Reputation (Phase 3) — a second persistent meta-currency above prestige.
 * Points are EARNED from achievements + ascensions (see engine/reputation.ts) and
 * SPENT on a permanent perk tree that folds into derive and survives every reset
 * (prestige AND AGI ascension). Pure DATA; logic + earn formula live in the engine.
 *
 * Curve safety: because points come only from achievements (real progression) and
 * ascensions (deep endgame), a fresh run owns no perks — the tuned early/mid curve
 * is untouched. All magnitudes/costs are tunable here without code changes.
 */

export type ReputationEffectKind =
  | "globalMult" // +value to all three production lanes
  | "computeMult"
  | "dataMult"
  | "moneyMult"
  | "payrollMult" // multiplies payroll (value 0.15 → −15% wage bill)
  | "automate" // unlocks an automation (value unused) — e.g. auto-buy research
  | "productSlot" // grants `value` extra concurrent product slots
  | "researchDiscount" // every research node costs `value` less Compute & Data (0.2 → −20%)
  | "startingRacks"; // begin every run with `value` basic racks already humming

export interface ReputationPerk {
  id: string;
  name: string;
  desc: string;
  /** Cost in Reputation points. */
  cost: number;
  /** Optional prerequisite perk id (tree depth). */
  requires?: string;
  effect: { kind: ReputationEffectKind; value: number };
}

export const reputation = {
  /** Points per ship (steady trickle) and per AGI ascension (a windfall). */
  perShip: 1,
  perAscension: 8,

  /** Floor for stacked research-cost discounts (research can get cheap, never free). */
  researchDiscountFloor: 0.25,

  perks: [
    // --- Tier 1: single-lane boosts (entry-level) ---
    { id: "rep_compute1", name: "Compute Grant", desc: "+10% Compute, permanently.", cost: 8, effect: { kind: "computeMult", value: 0.1 } },
    { id: "rep_data1", name: "Data Partnership", desc: "+10% Data, permanently.", cost: 8, effect: { kind: "dataMult", value: 0.1 } },
    { id: "rep_money1", name: "Brand Equity", desc: "+10% Money, permanently.", cost: 8, effect: { kind: "moneyMult", value: 0.1 } },
    { id: "rep_payroll1", name: "Prestige Employer", desc: "−15% payroll — people take less to work here.", cost: 12, effect: { kind: "payrollMult", value: 0.15 } },

    // --- Tier 2: stronger, gated on a tier-1 pick ---
    { id: "rep_compute2", name: "Supercomputer Access", desc: "+25% Compute.", cost: 30, requires: "rep_compute1", effect: { kind: "computeMult", value: 0.25 } },
    { id: "rep_global1", name: "Industry Standard", desc: "+8% to all production.", cost: 36, requires: "rep_money1", effect: { kind: "globalMult", value: 0.08 } },
    { id: "rep_autoresearch", name: "Research Director", desc: "Auto-buys affordable research for you — no more babysitting the tree.", cost: 24, effect: { kind: "automate", value: 0 } },
    { id: "rep_slot", name: "Portfolio Expansion", desc: "+1 concurrent product slot — run a broader business.", cost: 40, effect: { kind: "productSlot", value: 1 } },
    { id: "rep_research1", name: "Research Fellowship", desc: "Every research node costs 20% less Compute & Data — climb the tree faster every run.", cost: 28, requires: "rep_data1", effect: { kind: "researchDiscount", value: 0.2 } },
    { id: "rep_startrack", name: "Founder's Stockpile", desc: "Start every run with 3 basic racks already racked and humming — skip the cold open.", cost: 32, requires: "rep_compute1", effect: { kind: "startingRacks", value: 3 } },

    // --- Tier 3: capstones ---
    { id: "rep_global2", name: "Household Name", desc: "+15% to all production.", cost: 90, requires: "rep_global1", effect: { kind: "globalMult", value: 0.15 } },
    { id: "rep_legend", name: "Lab of Legend", desc: "+30% to all production. The history books are written.", cost: 200, requires: "rep_global2", effect: { kind: "globalMult", value: 0.3 } },
  ] satisfies ReputationPerk[],
};
