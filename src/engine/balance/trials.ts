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
 *  enforced — you honor it, the ship checks it). "solo" = an empty staff roster;
 *  "hot" = regulatory Heat at/above the threshold at ship; "neutral" = alignment
 *  still within the faction band (you never committed to either side). */
export type TrialCondition = "solo" | "hot" | "neutral";

/** Thresholds for the condition Trials above (single-sourced so engine checks and
 *  UI copy can't drift). */
export const CONDITION_THRESHOLDS: { hot: number; neutralBand: number } = {
  hot: 60,
  neutralBand: 0.4,
};

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
  /** The ladder this Trial belongs to — always the base Trial's id, so rung I's
   *  ladder is itself. Every Trial is on a ladder; most ladders are one rung long. */
  ladder: string;
  /** 1 for the base Trial, 2+ for a generated rung. */
  rung: number;
  /** The rung below, which must be BANKED before this one can be attempted. Absent on
   *  rung I. */
  requires?: string;
}

const BASE_TRIALS: TrialDef[] = ((defs) => defs.map((d) => ({ ...d, ladder: d.id, rung: 1 })))([
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
    // Depth batch 2026-08 (trial variety): two more condition Trials extend the
    // "this generation feels different" arc past ship 11. Curve-safe as ever — the
    // sim never opts in.
    { id: "trial_hot", name: "Running Hot", desc: "Ship a generation while regulatory Heat reads 60 or higher — live dangerously, then bank +12% Compute, permanently.", unlockShips: 13, condition: "hot", reward: { lane: "compute", value: 0.12 } },
    { id: "trial_neutral", name: "Apolitician", desc: "Ship a generation without committing to either faction (alignment inside ±0.4 of center) — then bank +12% Data, permanently.", unlockShips: 15, condition: "neutral", reward: { lane: "data", value: 0.12 } },
] satisfies Omit<TrialDef, "ladder" | "rung">[]);

/**
 * Trial Ladders (2026-08 depth pass). The seven Trials above are each one-and-done,
 * so a veteran past ship ~15 has banked them all and the constrained-run chase is
 * simply over — the system that exists to make a generation feel DIFFERENT stops
 * having anything to say exactly when generations start blurring together.
 *
 * A ladder re-opens it: the same discipline, tightened. Rung II halves what rung I
 * left you; rung III leaves a fifth. The reward escalates with it, and each rung is
 * still one-time, so the chase is finite per ladder but reaches much further out.
 *
 * Deliberately NOT a new persisted field: each rung is its own Trial id, so
 * `trialsDone: string[]`, `TRIAL_IDS`, the save sanitizer's known-id filter and the
 * achievement counters all carry ladders with no migration and no new save surface.
 *
 * Curve safety is unchanged and structural: the sim ships the default mode and never
 * opts into a Trial, so every rung is identity for it — same argument as the base
 * seven, and rungs are gated behind banking the rung below, which the sim also can
 * never do.
 */
const RUNG_NUMERAL = ["", "I", "II", "III"] as const;

/** Per-ladder escalation, keyed by the base Trial's id. Only handicap Trials ladder:
 *  a condition is a binary rule, so "tighter" has no meaning for it — Solo Run cannot
 *  be more solo than an empty roster. */
const LADDERS: Record<string, { unlockShips: number; factor: number; value: number }[]> = {
  // Endure a harder scarcity in the same lane you already mastered.
  trial_ablation: [
    { unlockShips: 14, factor: 0.35, value: 0.15 },
    { unlockShips: 22, factor: 0.2, value: 0.22 },
  ],
  trial_lean: [
    { unlockShips: 16, factor: 0.35, value: 0.15 },
    { unlockShips: 24, factor: 0.2, value: 0.22 },
  ],
  trial_scarcity: [
    { unlockShips: 18, factor: 0.35, value: 0.15 },
    { unlockShips: 26, factor: 0.2, value: 0.22 },
  ],
  // The cross-lane chase runs one rung deeper out, not two — it is the hardest shape
  // in the set (starve one lane to pay another) and a third rung would sit past any
  // ship count a real save reaches.
  trial_overclock: [{ unlockShips: 28, factor: 0.3, value: 0.2 }],
};

const LANE_WORD: Record<string, string> = { compute: "Compute", data: "Data", money: "Money" };

/** Build a ladder rung from its base Trial. Copy is DERIVED from the numbers so the
 *  card can never claim a handicap or a reward the engine doesn't apply. */
function rungOf(base: TrialDef, spec: { unlockShips: number; factor: number; value: number }, rung: number): TrialDef {
  const lane = base.handicap!.lane;
  const left = Math.round(spec.factor * 100);
  return {
    id: `${base.id}_r${rung}`,
    name: `${base.name} ${RUNG_NUMERAL[rung]}`,
    desc: `Run a whole generation on ${left}% ${LANE_WORD[lane]} — then bank +${Math.round(spec.value * 100)}% ${LANE_WORD[base.reward.lane]}, permanently.`,
    unlockShips: spec.unlockShips,
    handicap: { lane, factor: spec.factor },
    reward: { lane: base.reward.lane, value: spec.value },
    ladder: base.id,
    rung,
    requires: rung === 2 ? base.id : `${base.id}_r${rung - 1}`,
  };
}

/** The base seven, each rung I of its own ladder, followed by every generated rung in
 *  ladder order. Order matters only for display; the panel collapses each ladder to
 *  its current rung. */
function buildTrials(): TrialDef[] {
  const out: TrialDef[] = [];
  for (const base of BASE_TRIALS) {
    out.push(base);
    const specs = LADDERS[base.id] ?? [];
    specs.forEach((spec, i) => out.push(rungOf(base, spec, i + 2)));
  }
  return out;
}

export const trials = {
  enabled: true,
  list: buildTrials(),
};
