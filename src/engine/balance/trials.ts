/**
 * Prestige Trials (2026-07 depth pass) — opt-in "constrained training runs" that
 * make a generation feel DIFFERENT, not just faster. You commit to a Trial early in
 * a run (before you have a deployable model), endure its handicap for the whole
 * generation, and complete it by shipping — banking a small PERMANENT reward.
 *
 * Curve-safe by construction: the balance sim always ships the default mode and
 * never opts into a Trial, so `activeTrial` stays null and `trialsDone` stays empty
 * through the entire tuned run — every handicap and reward is identity there. Rewards
 * are one-time (each Trial completes once), claim-gated, and meta — they can't move
 * the tuned curve.
 *
 * The self-improvement arc is deliberate: you master scarcity in a lane, then you're
 * permanently better at that lane. "Ablation study" framing = dead-on AI-lab flavor.
 */

/** A run CONDITION some Trials require to hold at ship time to complete (read, not
 *  enforced — you honor it, the ship checks it). "solo" = an empty staff roster. */
export type TrialCondition = "solo";

export interface TrialDef {
  id: string;
  name: string;
  desc: string;
  /** Ships required before this Trial can be attempted. */
  unlockShips: number;
  /** Production handicap ACTIVE during the constrained run (factor < 1). Optional:
   *  a condition-only Trial has no production penalty — the constraint IS the rule. */
  handicap?: { lane: "compute" | "data" | "money"; factor: number };
  /** A run condition that must hold at ship time to bank the reward. Optional. */
  condition?: TrialCondition;
  /** Permanent lane bonus banked on completion (additive: mult = 1 + value). May be a
   *  DIFFERENT lane than the handicap — mastering scarcity in one lane can pay another. */
  reward: { lane: "compute" | "data" | "money"; value: number };
}

export const trials = {
  enabled: true,
  list: [
    // Reveal cadence (2026-07 pacing pass): spread across 3/5/7/9/11 instead of bunching
    // at 3-7. Five same-flavoured boards arriving together blurred into one wall, then
    // ships 8-12 went thin; spacing them drips one fresh Trial into the mid-game gap —
    // and, crucially, gives a slower player who reaches ship 9-11 WITHOUT ascending
    // something new. Curve-safe: the sim never opts in, so unlock timing can't move it.
    { id: "trial_ablation", name: "Ablation Study", desc: "Run a whole generation at HALF Compute — then bank +10% Compute, permanently.", unlockShips: 3, handicap: { lane: "compute", factor: 0.5 }, reward: { lane: "compute", value: 0.1 } },
    { id: "trial_lean", name: "Lean Budget", desc: "Run a whole generation at HALF Revenue — then bank +10% Money, permanently.", unlockShips: 5, handicap: { lane: "money", factor: 0.5 }, reward: { lane: "money", value: 0.1 } },
    { id: "trial_scarcity", name: "Data Scarcity", desc: "Run a whole generation at HALF Data — then bank +10% Data, permanently.", unlockShips: 7, handicap: { lane: "data", factor: 0.5 }, reward: { lane: "data", value: 0.1 } },
    // Condition Trial (reads a run rule, no production handicap): ship with an EMPTY
    // staff roster. The lean discipline pays out in cash efficiency.
    { id: "trial_solo", name: "Solo Run", desc: "Ship a whole generation with NO staff on the roster — then bank +12% Money, permanently.", unlockShips: 9, condition: "solo", reward: { lane: "money", value: 0.12 } },
    // Cross-lane handicap: starve one lane, master another. A tougher, later chase.
    { id: "trial_overclock", name: "Overclocked", desc: "Run a whole generation at HALF Data — then bank +12% Compute, permanently.", unlockShips: 11, handicap: { lane: "data", factor: 0.5 }, reward: { lane: "compute", value: 0.12 } },
  ] satisfies TrialDef[],
};
