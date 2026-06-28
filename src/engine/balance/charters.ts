/**
 * Lab Charters (R6.1) — a per-run modifier the player picks at the start of each
 * generation (after the first ship). Each charter tilts the Compute/Data/Money
 * triangle a different way, so runs feel different instead of "the same tree,
 * faster". A charter is a set of flat lane multipliers folded into derive; "None"
 * (null) is neutral. The first run has no charter (you haven't shipped yet), so
 * the tuned first-prestige curve is untouched.
 */

export interface CharterDef {
  id: string;
  name: string;
  blurb: string;
  /** Additive lane tilts: +0.35 = ×1.35, −0.2 = ×0.8. Omitted = neutral on that lane. */
  computeMult?: number;
  dataMult?: number;
  moneyMult?: number;
}

export const charters = {
  enabled: true,
  /** Charters unlock once you've shipped at least this many models. */
  unlockAtShips: 1,
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
  ] satisfies CharterDef[],
};
