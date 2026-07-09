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
  ] as Objective[],
};

/** Short label for a reward, for the card. */
export function objectiveRewardLabel(r: ObjectiveReward): string {
  const lane = r.target === "computeMult" ? "Compute" : r.target === "dataMult" ? "Data" : "revenue";
  return `×${r.factor} ${lane} · ${r.durationSec}s`;
}
