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
  /** Where this shows in the UI. Dark-web tools live in the Data Bazaar. */
  market?: "hardware" | "darkweb";
  effect:
    | { kind: "computeFlat"; perLevel: number }
    | { kind: "computeMult"; perLevel: number }
    | { kind: "dataMult"; perLevel: number }
    | { kind: "moneyMult"; perLevel: number }
    | { kind: "runSpeedMult"; perLevel: number }
    | { kind: "dataPerSec"; perLevel: number }
    | { kind: "autoClaim" }
    | { kind: "autoTrain" };
}

/**
 * A repeatable Money → Data purchase. Legit vendors are safe but pricey; the
 * dark-web Bazaar is cheaper but carries a `risk` profile — a passed-in roll
 * decides whether the batch is clean, poisoned (mostly garbage), or raided
 * (you eat a fine). Satire, not instruction: the comedy IS the risk.
 */
export interface DataOffer {
  id: string;
  vendor: string;
  name: string;
  desc: string;
  /** Money cost per purchase (flat — it's a market, buy as much as you like). */
  cost: number;
  /** Base Data delivered on a clean purchase. */
  data: number;
  shady: boolean;
  risk?: {
    /** P(raided): pay a fine, get a fraction of the data. */
    raidChance: number;
    fine: number;
    raidDataFactor: number;
    /** P(poisoned): get a fraction of the data, no fine. */
    poisonChance: number;
    poisonDataFactor: number;
  };
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
    // --- Dark-web tools (sold in the Data Bazaar, not the hardware shelf) ---
    {
      id: "web_scraper",
      name: "Web Scraper Bot",
      desc: "+1 Data/sec. Reads the whole internet. Doesn't ask first.",
      cost: { resource: "money", base: 400, growth: 1.25 },
      max: Infinity,
      market: "darkweb",
      effect: { kind: "dataPerSec", perLevel: 1 },
    },
    {
      id: "captcha_farm",
      name: "Captcha Farm",
      desc: "+4 Data/sec. Definitely real humans clicking traffic lights.",
      cost: { resource: "money", base: 2600, growth: 1.28 },
      max: Infinity,
      market: "darkweb",
      effect: { kind: "dataPerSec", perLevel: 4 },
    },
    {
      id: "botnet",
      name: "Botnet Cluster",
      desc: "+18 Data/sec. A 'distributed crowdsourcing network.' Ahem.",
      cost: { resource: "money", base: 18000, growth: 1.3 },
      max: Infinity,
      market: "darkweb",
      effect: { kind: "dataPerSec", perLevel: 18 },
    },
  ] satisfies UpgradeDef[],

  /** Money → Data marketplace. Legit (safe, pricey) vs. dark web (cheap, risky). */
  dataMarket: [
    {
      id: "meta_dump",
      vendor: "Meta",
      name: "Public Posts Bundle",
      desc: "A decade of vacation photos and arguments. Fully licensed™.",
      cost: 200,
      data: 180,
      shady: false,
    },
    {
      id: "goggle_logs",
      vendor: "Goggle",
      name: "Search Logs (Anonymized)",
      desc: "What everyone secretly asks at 3am. 'Anonymized.'",
      cost: 1500,
      data: 1500,
      shady: false,
    },
    {
      id: "closedai_synth",
      vendor: "ClosedAI",
      name: "Synthetic Dataset",
      desc: "Premium model-generated data. Best ratio at scale, naturally.",
      cost: 12000,
      data: 16000,
      shady: false,
    },
    {
      id: "bazaar_pack",
      vendor: "ShadyByte Bazaar",
      name: "Scraped Data Pack",
      desc: "'Ethically sourced.' Cheaper per byte. No refunds, no questions.",
      cost: 120,
      data: 220,
      shady: true,
      risk: {
        raidChance: 0.12,
        fine: 300,
        raidDataFactor: 0.4,
        poisonChance: 0.28,
        poisonDataFactor: 0.12,
      },
    },
    {
      id: "bazaar_leak",
      vendor: "ShadyByte Bazaar",
      name: "Bulk Corporate Leak",
      desc: "A whole company's data 'fell off a truck.' Huge if it's clean.",
      cost: 2000,
      data: 4200,
      shady: true,
      risk: {
        raidChance: 0.2,
        fine: 4000,
        raidDataFactor: 0.3,
        poisonChance: 0.3,
        poisonDataFactor: 0.1,
      },
    },
  ] satisfies DataOffer[],

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
