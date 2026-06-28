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
  ] satisfies CharterDef[],
};
