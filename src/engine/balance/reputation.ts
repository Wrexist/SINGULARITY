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
  /** Bonus points per ship taken while committed to safety (doomer). Rewards a
   *  principled meta-strategy; 0 through the tuned curve (first ship is neutral). */
  perSafetyShip: 3,

  /** Floor for stacked research-cost discounts (research can get cheap, never free). */
  researchDiscountFloor: 0.25,

  /** Endgame Reputation Endowment (post-AGI depth). Once the ENTIRE finite perk tree
   *  is owned, Reputation would otherwise dead-end — the currency keeps accruing (and
   *  the daily sponsor pays it) with nothing to buy. The Endowment is the infinite home:
   *  a repeatable buy with escalating cost and a small PERMANENT all-lane boost per
   *  level, so surplus Reputation always has a sink and the day-7 faucet stays alive.
   *  Curve-safe: it can't be touched until every perk (516 pts) is owned — a deep-
   *  endgame state a fresh run / the sim never reaches. */
  endowment: {
    enabled: true,
    /** Reputation cost of level 1; each level costs ×growth more (cheap early, then
     *  a long grind) — a genuine "where does my surplus go" decision, not a wall. */
    baseCost: 40,
    growth: 1.18,
    /** Permanent all-lane boost per level (additive: mult = 1 + level × perLevel). */
    perLevel: 0.02,
    /** Finite safety bound (a crafted save can't drive the cost sum / boost to
     *  Infinity). Astronomically expensive to reach legitimately, so never a real cap. */
    maxLevel: 2000,
    /** Endowment DIRECTIVES (2026-07 depth pass): the flat all-lane boost is
     *  decisionless, so every `interval` levels the player also earns ONE Directive
     *  pick — a permanent lane doctrine. This turns "endow the next level" into a
     *  build choice (lean Compute, diversify, go all-in Revenue) that repeats across
     *  the deep endgame. Picks are FREE (a reward of levelling, not a Reputation
     *  spend), so no cost reconciliation is needed. Curve-safe: repEndowment is 0
     *  through the whole tuned game (the Endowment can't unlock until every perk is
     *  owned), so no tier is ever earned and no directive is ever applied in the sim.
     *  The same doctrine may be picked more than once to stack a lane. */
    directives: {
      /** One Directive pick per this many endowment levels. */
      interval: 10,
      defs: [
        { id: "dir_compute", name: "Compute Doctrine", lane: "compute", value: 0.3, desc: "+30% Compute, permanently." },
        { id: "dir_data", name: "Research Doctrine", lane: "data", value: 0.3, desc: "+30% Data, permanently." },
        { id: "dir_money", name: "Commercial Doctrine", lane: "money", value: 0.3, desc: "+30% Money, permanently." },
      ],
    },
  },

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
