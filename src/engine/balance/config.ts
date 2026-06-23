/**
 * ALL tunable values live here as data (CLAUDE.md hard rule). Logic never
 * hardcodes a curve number. Expect to retune this file hundreds of times during
 * the balance pass — that's the point of keeping it isolated from logic.
 */

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: { resource: "money" | "data" | "compute"; base: number; growth: number };
  /** Max purchasable levels (automations are one-shot → 1). */
  max: number;
  effect:
    | { kind: "computeFlat"; perLevel: number }
    | { kind: "computeMult"; perLevel: number }
    | { kind: "dataMult"; perLevel: number }
    | { kind: "moneyMult"; perLevel: number }
    | { kind: "runSpeedMult"; perLevel: number }
    | { kind: "autoClaim" }
    | { kind: "autoTrain" };
}

export interface ResearchDef {
  id: string;
  name: string;
  desc: string;
  requires: string[];
  cost: { compute: number; data: number };
  effect:
    | { kind: "computeMult"; factor: number }
    | { kind: "dataMult"; factor: number }
    | { kind: "moneyMult"; factor: number }
    | { kind: "runSpeed"; factor: number }
    | { kind: "unlockPassiveMoney"; perSec: number };
}

export const balance = {
  /** The rented server closet generates a trickle of Compute for free. */
  baseComputePerSec: 1,

  run: {
    /**
     * A run invests `costSeconds` worth of current Compute *production* (floored
     * at minCompute early game), then pays out Data/Money proportional to the
     * Compute invested. This couples money to the size of your operation — the
     * whole point of the three-resource triangle (GDD §2.1).
     */
    costSeconds: 2,
    minCompute: 10,
    durationSec: 5,
    dataPerCompute: 0.35,
    moneyPerCompute: 0.6,
  },

  prestige: {
    /**
     * You can Ship once you've built a deployable model — i.e. researched this
     * capability (GDD §4: "reach a capability threshold"). This guarantees the
     * player climbs the research tree to its payoff before learning the reset.
     */
    capabilityResearch: "inference_api",
    /** legacyWeightsGained = max(1, floor((lifetimeMoney / scale) ^ exponent)). */
    scale: 1e4,
    exponent: 0.5,
    /** Each Legacy Weight grants this much permanent global production. */
    multiplierPerPoint: 0.05,
  },

  offline: {
    /** Cap accrued offline time so it's a reward, not an exploit (LEARNINGS). */
    maxHours: 8,
  },

  upgrades: [
    {
      id: "rack_basic",
      name: "Consumer GPU Rack",
      desc: "+2 Compute/sec. A shelf of gaming cards. It hums.",
      cost: { resource: "money", base: 15, growth: 1.15 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 2 },
    },
    {
      id: "rack_server",
      name: "Server GPU Rack",
      desc: "+12 Compute/sec. Proper datacenter silicon.",
      cost: { resource: "money", base: 220, growth: 1.16 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 12 },
    },
    {
      id: "rack_tpu",
      name: "TPU Pod",
      desc: "+80 Compute/sec. Tensor cores, allegedly.",
      cost: { resource: "money", base: 3500, growth: 1.17 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 80 },
    },
    {
      id: "overclock",
      name: "Overclock Firmware",
      desc: "+8% total Compute production per level.",
      cost: { resource: "money", base: 600, growth: 1.5 },
      max: 25,
      effect: { kind: "computeMult", perLevel: 0.08 },
    },
    {
      id: "data_pipeline",
      name: "Data Pipeline",
      desc: "+20% Data per run, per level.",
      cost: { resource: "money", base: 120, growth: 1.4 },
      max: 25,
      effect: { kind: "dataMult", perLevel: 0.2 },
    },
    {
      id: "monetize",
      name: "Monetization Layer",
      desc: "+20% Money per run, per level. ('Synergy.')",
      cost: { resource: "money", base: 150, growth: 1.4 },
      max: 25,
      effect: { kind: "moneyMult", perLevel: 0.2 },
    },
    {
      id: "batching",
      name: "Batch Scheduler",
      desc: "-6% run duration per level. Trains faster.",
      cost: { resource: "data", base: 40, growth: 1.6 },
      max: 12,
      effect: { kind: "runSpeedMult", perLevel: 0.06 },
    },
    {
      id: "auto_claim",
      name: "Auto-Claim Daemon",
      desc: "Finished runs claim themselves. Stop tapping.",
      cost: { resource: "data", base: 200, growth: 1 },
      max: 1,
      effect: { kind: "autoClaim" },
    },
    {
      id: "auto_train",
      name: "Auto-Train Orchestrator",
      desc: "Runs restart themselves. The lab runs itself.",
      cost: { resource: "data", base: 800, growth: 1 },
      max: 1,
      effect: { kind: "autoTrain" },
    },
  ] satisfies UpgradeDef[],

  research: [
    {
      id: "backprop",
      name: "Backprop Refactor",
      desc: "Someone finally read the paper. ×1.5 Compute.",
      requires: [],
      cost: { compute: 500, data: 0 },
      effect: { kind: "computeMult", factor: 1.5 },
    },
    {
      id: "curated_data",
      name: "Curated Dataset",
      desc: "Less garbage in. ×1.6 Data per run.",
      requires: ["backprop"],
      cost: { compute: 0, data: 120 },
      effect: { kind: "dataMult", factor: 1.6 },
    },
    {
      id: "distributed",
      name: "Distributed Training",
      desc: "Many machines, one loss curve. ×1.8 Money per run.",
      requires: ["curated_data"],
      cost: { compute: 4000, data: 300 },
      effect: { kind: "moneyMult", factor: 1.8 },
    },
    {
      id: "distillation",
      name: "Model Distillation",
      desc: "Smaller, faster, mostly the same. -25% run duration.",
      requires: ["distributed"],
      cost: { compute: 12000, data: 800 },
      effect: { kind: "runSpeed", factor: 0.75 },
    },
    {
      id: "inference_api",
      name: "Ship: Inference API",
      desc: "Deploy the model as a product. Passive Money that scales with Compute.",
      requires: ["distillation"],
      cost: { compute: 40000, data: 2500 },
      // Money/sec per unit of Compute/sec — a fraction of throughput becomes revenue.
      effect: { kind: "unlockPassiveMoney", perSec: 0.3 },
    },
  ] satisfies ResearchDef[],
};

export type Balance = typeof balance;
