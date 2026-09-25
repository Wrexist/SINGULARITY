/**
 * Lab Charters (R6.1) — a per-run modifier the player picks at the start of each
 * generation (after the first ship). Each charter tilts the Compute/Data/Money
 * triangle a different way, so runs feel different instead of "the same tree,
 * faster". A charter is a set of flat lane multipliers folded into derive; "None"
 * (null) is neutral. The first run has no charter (you haven't shipped yet), so
 * the tuned first-prestige curve is untouched.
 */

/** A charter that changes a RULE rather than (only) tilting a lane. Every field is a
 *  multiplier; omitted = ×1. */
export interface CharterRule {
  /** Research nodes' Compute cost. */
  researchCompute?: number;
  /** Research nodes' Data cost. */
  researchData?: number;
  /** Product revenue per paying user (ARPU), every product. */
  productArpu?: number;
  /** How far a faction world-event choice moves your alignment. */
  factionShift?: number;
}

export interface CharterDef {
  id: string;
  name: string;
  blurb: string;
  /** Additive lane tilts: +0.35 = ×1.35, −0.2 = ×0.8. Omitted = neutral on that lane. */
  computeMult?: number;
  dataMult?: number;
  moneyMult?: number;
  /** Rule-changer charters only (see `rule`); lane charters leave it out. */
  rule?: CharterRule;
  /** Dealt only from this many ships on. Omitted = from the charter unlock. */
  minShips?: number;
}

/**
 * The Charter Draft (2026-09 generations audit). All seven charters used to sit on
 * screen every run, so the pick settled into one habit by ship 3 and the card list
 * pushed the rest of the Build tab down. Each ship now DEALS a hand of three:
 *  - the charter you last flew, so a conviction streak can always continue;
 *  - from ship 6, one rule-changer "wild card" (research, products or factions work
 *    differently for the run);
 *  - lane charters to fill the hand.
 * The deal is a pure function of the ship count and `lastCharter`, both already
 * saved, so there is no new field. Curve-safe: the sim never sets a charter, and
 * every rule is ×1 with none set.
 */
export const charters = {
  enabled: true,
  /** Charters unlock once you've shipped at least this many models. */
  unlockAtShips: 1,
  /** Cards dealt per ship. */
  handSize: 3,
  /**
   * The Research Director's grace, in seconds of engine run time (playtime since this
   * run's ship). The start-of-run window (charter + stance) normally closes at the
   * first research node, but the Director buys research from tick() — in the deep
   * endgame within 0.2 s of a ship, while the celebration is still on screen — so
   * for a Director owner the window instead stays open for this long whatever gets
   * researched, then closes at the first node as usual. The Director itself never
   * waits, so a player who ignores charters loses nothing. The sim never owns the
   * Director, so this is inert for the tuned curve.
   */
  directorGraceSec: 60,
  list: [
    {
      id: "open_source",
      name: "Open-Source Crusade",
      blurb: "Give it away. The data floods in; the money doesn't.",
      dataMult: 0.4,
      moneyMult: -0.2,
    },
    {
      id: "bootstrapped",
      name: "Bootstrapped",
      blurb: "Revenue first, vibes later. Rich and cautious — and a little slow.",
      moneyMult: 0.35,
      computeMult: -0.15,
    },
    {
      id: "moonshot",
      name: "Moonshot",
      blurb: "Scale compute at all costs. Who needs a balanced diet of data?",
      computeMult: 0.35,
      dataMult: -0.15,
    },
    {
      id: "data_monopoly",
      name: "Data Monopoly",
      blurb: "Own the corpus, own the future. Compute can wait its turn.",
      dataMult: 0.5,
      computeMult: -0.2,
    },
    {
      id: "cash_machine",
      name: "Cash Machine",
      blurb: "Monetize everything that moves. The data team will understand.",
      moneyMult: 0.5,
      dataMult: -0.25,
    },
    {
      id: "mad_science",
      name: "Mad Science",
      blurb: "All gas, no brakes, no revenue model. The compute is glorious.",
      computeMult: 0.45,
      moneyMult: -0.25,
    },
    {
      id: "frugal_genius",
      name: "Frugal Genius",
      blurb: "Do more with less — except data, you're chronically short on that.",
      computeMult: 0.2,
      moneyMult: 0.2,
      dataMult: -0.3,
    },
    // Rule-changers — the wild card in every hand from ship 6.
    {
      id: "research_sprint",
      name: "Research Sprint",
      blurb: "Throw people at the papers. Every breakthrough costs half the Compute — and nearly twice the Data.",
      rule: { researchCompute: 0.5, researchData: 1.8 },
      minShips: 6,
    },
    {
      id: "product_company",
      name: "Product Company",
      blurb: "Forget the frontier; ship features. Products earn far more, the lab's own runs far less.",
      moneyMult: -0.4,
      rule: { productArpu: 2.5 },
      minShips: 6,
    },
    {
      id: "true_believers",
      name: "True Believers",
      blurb: "Every decision is a manifesto. Faction choices move your stance twice as far.",
      dataMult: 0.15,
      rule: { factionShift: 2 },
      minShips: 6,
    },
  ] satisfies CharterDef[],
};
