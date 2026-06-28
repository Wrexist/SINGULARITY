/**
 * Legacy Investments (R5.4) — a small prestige skill tree spent with Legacy
 * Weights. Turns the flat "weights → one global multiplier" into a build choice:
 * you can SPEND weights to specialise a lane, at the cost of the spent weights no
 * longer feeding the global multiplier. So it's a genuine focus-vs-breadth
 * trade-off — concentrate on Compute, or keep the broad multiplier.
 *
 * Curve-safe by construction: nothing is spent by default, so the available-weight
 * pool equals total weights and the global multiplier (and the whole tuned curve /
 * sim) are unchanged until the PLAYER chooses to invest.
 */

export interface LegacyPerkDef {
  id: string;
  name: string;
  desc: string;
  /** Weights spent to buy it (also removed from the global-multiplier pool). */
  cost: number;
  /** Optional prerequisite perk id. */
  requires?: string;
  /** A flat lane bias (+value to that lane), permanent across runs. */
  effect: { lane: "compute" | "data" | "money"; value: number };
}

export const legacyTree = {
  enabled: true,
  perks: [
    // Tier 1 — pick a lane to lean into.
    { id: "leg_compute1", name: "Compute Specialist", desc: "+20% Compute, every run.", cost: 12, effect: { lane: "compute", value: 0.2 } },
    { id: "leg_data1", name: "Data Specialist", desc: "+20% Data, every run.", cost: 12, effect: { lane: "data", value: 0.2 } },
    { id: "leg_money1", name: "Revenue Specialist", desc: "+20% Money, every run.", cost: 12, effect: { lane: "money", value: 0.2 } },
    // Tier 2 — double down (requires the tier-1 of that lane).
    { id: "leg_compute2", name: "Compute Mastery", desc: "+35% more Compute.", cost: 40, requires: "leg_compute1", effect: { lane: "compute", value: 0.35 } },
    { id: "leg_money2", name: "Revenue Mastery", desc: "+35% more Money.", cost: 40, requires: "leg_money1", effect: { lane: "money", value: 0.35 } },
  ] satisfies LegacyPerkDef[],
};
