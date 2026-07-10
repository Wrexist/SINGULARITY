/**
 * Lab Objectives (IDEAS #B) — an early/mid engagement layer: a rotating board of quick,
 * varied tasks that drip a reward each. Distinct from Contracts (the curated Reputation
 * ladder): objectives reward IMMEDIATE juice — a short output boost or a self-scaling
 * resource windfall — so the moment-to-moment early/mid grind always has a next payoff.
 *
 * CURVE-SAFE: the reward only lands on an explicit Claim, which the balance sim never does
 * (it only buys research/racks and ships `deploy`). Boosts are temporary and windfalls are
 * a bounded slice of CURRENT income, so neither inflates the permanent tuned curve.
 */

export type ObjectiveMetric =
  | "lifetimeMoney"
  | "compute"
  | "research"
  | "racks"
  | "ships"
  | "products"
  | "employees"
  | "mau"
  | "mrr"
  | "events"
  | "contracts";

/** Objectives reward a short OUTPUT BOOST — always meaningful (it multiplies whatever you
 *  produce right now), self-scaling, and temporary, so it never inflates the permanent
 *  curve. Variety comes from lane + magnitude + duration. */
export interface ObjectiveReward {
  target: "computeMult" | "dataMult" | "moneyMult";
  factor: number;
  durationSec: number;
}

export interface Objective {
  id: string;
  desc: string;
  metric: ObjectiveMetric;
  target: number;
  reward: ObjectiveReward;
}

const boost = (target: ObjectiveReward["target"], factor: number, durationSec: number): ObjectiveReward =>
  ({ target, factor, durationSec });

export const objectives = {
  enabled: true,
  /** How many objectives sit on the board at once (the first N uncompleted). */
  slots: 3,
  /**
   * The ladder, interleaved by metric so the 3 on the board are always varied. Targets and
   * rewards escalate; the whole pool spans the early game through the mid game.
   */
  pool: [
    { id: "o_run1", desc: "Earn your first $100.", metric: "lifetimeMoney", target: 100, reward: boost("moneyMult", 2, 60) },
    { id: "o_cmp1", desc: "Reach 40 Compute/sec.", metric: "compute", target: 40, reward: boost("computeMult", 2, 60) },
    { id: "o_res1", desc: "Unlock your first research node.", metric: "research", target: 1, reward: boost("dataMult", 2, 60) },
    { id: "o_rack1", desc: "Run 5 GPU racks.", metric: "racks", target: 5, reward: boost("computeMult", 1.8, 60) },
    { id: "o_money2", desc: "Earn $2,000 lifetime.", metric: "lifetimeMoney", target: 2_000, reward: boost("moneyMult", 2.2, 70) },
    { id: "o_res2", desc: "Own 3 research nodes.", metric: "research", target: 3, reward: boost("dataMult", 2.2, 70) },
    { id: "o_ship1", desc: "Ship your first model.", metric: "ships", target: 1, reward: boost("computeMult", 2.5, 75) },
    { id: "o_cmp2", desc: "Reach 400 Compute/sec.", metric: "compute", target: 400, reward: boost("computeMult", 2.2, 75) },
    { id: "o_rack2", desc: "Run 12 GPU racks.", metric: "racks", target: 12, reward: boost("dataMult", 2.3, 75) },
    { id: "o_prod1", desc: "Launch your first product.", metric: "products", target: 1, reward: boost("moneyMult", 2.5, 75) },
    { id: "o_money3", desc: "Earn $50,000 lifetime.", metric: "lifetimeMoney", target: 50_000, reward: boost("computeMult", 2.4, 80) },
    { id: "o_emp1", desc: "Hire your first specialist.", metric: "employees", target: 1, reward: boost("dataMult", 2.4, 80) },
    { id: "o_res3", desc: "Own 6 research nodes.", metric: "research", target: 6, reward: boost("moneyMult", 2.4, 80) },
    { id: "o_mau1", desc: "Reach 10,000 total users.", metric: "mau", target: 10_000, reward: boost("moneyMult", 2.5, 90) },
    { id: "o_cmp3", desc: "Reach 5,000 Compute/sec.", metric: "compute", target: 5_000, reward: boost("computeMult", 2.5, 90) },
    { id: "o_ship2", desc: "Ship 3 models.", metric: "ships", target: 3, reward: boost("dataMult", 2.6, 90) },
    { id: "o_rack3", desc: "Run 25 GPU racks.", metric: "racks", target: 25, reward: boost("computeMult", 2.6, 90) },
    { id: "o_mrr1", desc: "Reach $100/sec product revenue.", metric: "mrr", target: 100, reward: boost("moneyMult", 2.6, 90) },
    { id: "o_emp2", desc: "Employ 4 specialists.", metric: "employees", target: 4, reward: boost("dataMult", 2.6, 95) },
    { id: "o_money4", desc: "Earn $1,000,000 lifetime.", metric: "lifetimeMoney", target: 1_000_000, reward: boost("moneyMult", 2.7, 100) },
    { id: "o_events1", desc: "Resolve 5 world events.", metric: "events", target: 5, reward: boost("dataMult", 2.7, 100) },
    { id: "o_prod2", desc: "Run 2 live products.", metric: "products", target: 2, reward: boost("moneyMult", 2.8, 100) },
    { id: "o_cmp4", desc: "Reach 100,000 Compute/sec.", metric: "compute", target: 100_000, reward: boost("computeMult", 2.8, 100) },
    { id: "o_contract1", desc: "Complete 3 contracts.", metric: "contracts", target: 3, reward: boost("computeMult", 2.8, 105) },
    { id: "o_mau2", desc: "Reach 1,000,000 total users.", metric: "mau", target: 1_000_000, reward: boost("moneyMult", 2.9, 110) },
    { id: "o_ship3", desc: "Ship 8 models.", metric: "ships", target: 8, reward: boost("computeMult", 3, 110) },
    { id: "o_mrr2", desc: "Reach $2,000/sec product revenue.", metric: "mrr", target: 2_000, reward: boost("moneyMult", 3, 115) },
    { id: "o_money5", desc: "Earn $100,000,000 lifetime.", metric: "lifetimeMoney", target: 100_000_000, reward: boost("dataMult", 3, 120) },
    // Mid-game continuation (IDEAS #B, wave 2): the ship 9–15 window used to open a
    // "desert" — every system finishes unlocking by ship 6 and the old ladder topped out
    // at ship 8, so a ship-focused player ran out of varied objectives right there. These
    // higher rungs keep the board full and interleaved (ships, compute, staff, product,
    // revenue, users, contracts) through the mid game. Still claim-only temp boosts, so
    // curve-safe. Escalating factor/duration continues the existing ramp.
    { id: "o_ship4", desc: "Ship 12 models.", metric: "ships", target: 12, reward: boost("computeMult", 3.1, 120) },
    { id: "o_cmp5", desc: "Reach 2,000,000 Compute/sec.", metric: "compute", target: 2_000_000, reward: boost("computeMult", 3.1, 120) },
    { id: "o_emp3", desc: "Employ 8 specialists.", metric: "employees", target: 8, reward: boost("dataMult", 3.1, 125) },
    { id: "o_prod3", desc: "Run 3 live products.", metric: "products", target: 3, reward: boost("moneyMult", 3.2, 125) },
    { id: "o_mrr3", desc: "Reach $20,000/sec product revenue.", metric: "mrr", target: 20_000, reward: boost("moneyMult", 3.2, 130) },
    { id: "o_ship5", desc: "Ship 15 models.", metric: "ships", target: 15, reward: boost("computeMult", 3.3, 130) },
    { id: "o_contract2", desc: "Complete 8 contracts.", metric: "contracts", target: 8, reward: boost("computeMult", 3.3, 135) },
    { id: "o_money6", desc: "Earn $10,000,000,000 lifetime.", metric: "lifetimeMoney", target: 10_000_000_000, reward: boost("dataMult", 3.3, 135) },
    { id: "o_mau3", desc: "Reach 20,000,000 total users.", metric: "mau", target: 20_000_000, reward: boost("moneyMult", 3.4, 140) },
    // Late-game continuation (IDEAS #B, wave 3): past o_mau3 the board would empty again for
    // the deep ship-focused player. These push each metric one tier deeper (ships, staff,
    // compute, revenue, contracts, lifetime money) and keep the ramp going. Still claim-only
    // temp boosts, so curve-safe; factor/duration continue the existing escalation.
    { id: "o_ship6", desc: "Ship 20 models.", metric: "ships", target: 20, reward: boost("computeMult", 3.5, 145) },
    { id: "o_emp4", desc: "Employ 16 specialists.", metric: "employees", target: 16, reward: boost("dataMult", 3.5, 148) },
    { id: "o_cmp6", desc: "Reach 50,000,000 Compute/sec.", metric: "compute", target: 50_000_000, reward: boost("computeMult", 3.6, 150) },
    { id: "o_mrr4", desc: "Reach $200,000/sec product revenue.", metric: "mrr", target: 200_000, reward: boost("moneyMult", 3.6, 153) },
    { id: "o_contract3", desc: "Complete 15 contracts.", metric: "contracts", target: 15, reward: boost("computeMult", 3.7, 156) },
    { id: "o_money7", desc: "Earn $1,000,000,000,000 lifetime.", metric: "lifetimeMoney", target: 1_000_000_000_000, reward: boost("dataMult", 3.8, 160) },
  ] as Objective[],
};

/** Short lane name for a boost target. */
export function laneLabel(t: ObjectiveReward["target"]): string {
  return t === "computeMult" ? "Compute" : t === "dataMult" ? "Data" : "Revenue";
}

/** Short label for a specific reward option (lane + strength), for a lane button. */
export function objectiveRewardLabel(r: ObjectiveReward): string {
  return `×${r.factor} ${laneLabel(r.target)} · ${r.durationSec}s`;
}

/** Lane-agnostic strength for the not-yet-claimed card — the lane is the player's pick. */
export function objectiveRewardStrength(r: ObjectiveReward): string {
  return `×${r.factor} · ${r.durationSec}s`;
}

/**
 * The reward lanes a claim offers: the objective's headline lane plus the NEXT lane in the
 * Compute→Data→Revenue cycle. Both options share the same factor and duration, so the pick
 * is a PLACEMENT choice (where do I want this boost right now?), never a power choice — the
 * reward strength is identical either way, so it stays curve-safe. Turns a passive auto-claim
 * into a small, recurring decision without inflating anything.
 */
const LANE_CYCLE: ObjectiveReward["target"][] = ["computeMult", "dataMult", "moneyMult"];
export function nextLane(t: ObjectiveReward["target"]): ObjectiveReward["target"] {
  return LANE_CYCLE[(LANE_CYCLE.indexOf(t) + 1) % LANE_CYCLE.length]!;
}
export function objectiveRewardOptions(r: ObjectiveReward): ObjectiveReward[] {
  return [r, { ...r, target: nextLane(r.target) }];
}
