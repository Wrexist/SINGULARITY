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

/** A legacy perk's effect. Either a flat lane bias (the original tree) OR an
 *  UNLOCK that gates real content (a new product slot, …) — the "constellation"
 *  direction from the 2026-07 audit. New unlock kinds slot in here without
 *  touching the lane-bias fold. */
export type LegacyEffect =
  | { lane: "compute" | "data" | "money"; value: number }
  | { unlock: "productSlot"; value: number };

export interface LegacyPerkDef {
  id: string;
  name: string;
  desc: string;
  /** Weights spent to buy it (also removed from the global-multiplier pool). */
  cost: number;
  /** Optional prerequisite perk id. */
  requires?: string;
  effect: LegacyEffect;
}

export const legacyTree = {
  enabled: true,
  perks: [
    // Tier 1 — pick a lane to lean into.
    { id: "leg_compute1", name: "Compute Specialist", desc: "+20% Compute, every run.", cost: 12, effect: { lane: "compute", value: 0.2 } },
    { id: "leg_data1", name: "Data Specialist", desc: "+20% Data, every run.", cost: 12, effect: { lane: "data", value: 0.2 } },
    { id: "leg_money1", name: "Revenue Specialist", desc: "+20% Money, every run.", cost: 12, effect: { lane: "money", value: 0.2 } },
    // Tier 2 — double down (requires the tier-1 of that lane). All three lanes have a
    // mastery node so no lane is a dead-end (the data lane was previously un-masterable).
    { id: "leg_compute2", name: "Compute Mastery", desc: "+35% more Compute.", cost: 40, requires: "leg_compute1", effect: { lane: "compute", value: 0.35 } },
    { id: "leg_data2", name: "Data Mastery", desc: "+35% more Data.", cost: 40, requires: "leg_data1", effect: { lane: "data", value: 0.35 } },
    { id: "leg_money2", name: "Revenue Mastery", desc: "+35% more Money.", cost: 40, requires: "leg_money1", effect: { lane: "money", value: 0.35 } },
    // Tier 3 — "Frontier": the long-horizon chase. At 120 weights each, fully
    // committing a lane costs 172 weights (12+40+120), so this stays out of reach
    // for many ships and gives deep-run players a standing goal to grind toward —
    // the audit's "tall, not just wide" gap, addressed the curve-safest way (pure
    // Legacy-Weight spend; the balance sim never earns or spends weights, so nothing
    // owned by default = identity multiplier and the tuned curve is untouched).
    { id: "leg_compute3", name: "Compute Frontier", desc: "+50% more Compute.", cost: 120, requires: "leg_compute2", effect: { lane: "compute", value: 0.5 } },
    { id: "leg_data3", name: "Data Frontier", desc: "+50% more Data.", cost: 120, requires: "leg_data2", effect: { lane: "data", value: 0.5 } },
    { id: "leg_money3", name: "Revenue Frontier", desc: "+50% more Money.", cost: 120, requires: "leg_money2", effect: { lane: "money", value: 0.5 } },
    // Unlock node — the first "constellation" reward that gates CONTENT, not a %:
    // a fourth concurrent product line, gated behind Revenue Mastery (a mature
    // commercial operation earns the right to run one more). Curve-safe: the sim
    // never launches products, so a slot it can't use never shifts the tuned curve.
    { id: "leg_slot", name: "Product Division", desc: "Unlock a +1 concurrent product slot, every run.", cost: 80, requires: "leg_money2", effect: { unlock: "productSlot", value: 1 } },
  ] satisfies LegacyPerkDef[],
};
