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

export interface TrialDef {
  id: string;
  name: string;
  desc: string;
  /** Ships required before this Trial can be attempted. */
  unlockShips: number;
  /** Production handicap ACTIVE during the constrained run (factor < 1). */
  handicap: { lane: "compute" | "data" | "money"; factor: number };
  /** Permanent lane bonus banked on completion (additive: mult = 1 + value). */
  reward: { lane: "compute" | "data" | "money"; value: number };
}

export const trials = {
  enabled: true,
  list: [
    { id: "trial_ablation", name: "Ablation Study", desc: "Run a whole generation at HALF Compute — then bank +10% Compute, permanently.", unlockShips: 3, handicap: { lane: "compute", factor: 0.5 }, reward: { lane: "compute", value: 0.1 } },
    { id: "trial_lean", name: "Lean Budget", desc: "Run a whole generation at HALF Revenue — then bank +10% Money, permanently.", unlockShips: 4, handicap: { lane: "money", factor: 0.5 }, reward: { lane: "money", value: 0.1 } },
    { id: "trial_scarcity", name: "Data Scarcity", desc: "Run a whole generation at HALF Data — then bank +10% Data, permanently.", unlockShips: 5, handicap: { lane: "data", factor: 0.5 }, reward: { lane: "data", value: 0.1 } },
  ] satisfies TrialDef[],
};
