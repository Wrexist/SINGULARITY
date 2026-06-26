import type { Big } from "./math/Big";
import type { ProductTypeId } from "./balance/products";

export type ResourceId = "compute" | "data" | "money";

export interface Resources {
  compute: Big;
  data: Big;
  money: Big;
}

/** A single training run: assign compute, watch the bar, claim Data + Money. */
export interface TrainingRun {
  active: boolean;
  /** 0..1 fill of the current run. */
  progress: number;
  /** Completed and awaiting a claim (the dopamine beat). */
  readyToClaim: boolean;
}

export interface PrestigeState {
  legacyWeights: Big;
  /** Number of models shipped (prestiges performed). */
  ships: number;
}

export type ModifierTarget = "computeMult" | "dataMult" | "moneyMult";

/** A time-limited global multiplier granted by a world event. Ticks down. */
export interface ActiveModifier {
  id: string;
  target: ModifierTarget;
  factor: number;
  remainingSec: number;
  label: string;
  tone: "good" | "bad";
}

export interface GameState {
  version: number;
  resources: Resources;
  /** Owned count per upgrade id. */
  upgrades: Record<string, number>;
  /** Owned research node ids. */
  research: string[];
  run: TrainingRun;
  prestige: PrestigeState;
  /** Lifetime money earned this run — feeds the prestige capability gate. */
  lifetimeMoney: Big;
  /** Regulatory Heat (0..100). Rises with dark-web use, cools over time. */
  heat: number;
  /** Active time-limited modifiers from world events. */
  modifiers: ActiveModifier[];
  /** Faction stance (Phase 2): −1 doomer … +1 accelerationist. Moved by event choices. */
  alignment: number;
  /**
   * Auto-train focus 0..1 (1 = spend Compute on runs aggressively; lower = reserve
   * more Compute so the bank can climb toward expensive research). 0 = hold (no
   * auto-train). Only gates auto-train; manual runs always fire when affordable.
   */
  computeFocus: number;
  /** Phase 3 — released AI products (persist across prestige). */
  products: ProductsState;
  /** Phase 3 — individual employees (people, not counts). Persist across prestige. */
  employees: Employee[];
  /** Phase 3 — lifetime stats that accumulate across ALL runs (survive prestige).
   *  The data backbone for achievements, the AGI gate, and lab reputation. */
  stats: LifetimeStats;
  /** Phase 3 — unlocked achievement ids (a collection; survives prestige). */
  achievements: string[];
  /** Phase 3 — Lab Reputation: a meta-currency spent on permanent perks. Points are
   *  earned − spent (earned is derived from achievements/ships/ascensions). Survives
   *  prestige AND ascension. */
  reputation: { spent: number; perks: string[] };
}

/**
 * Cross-run, monotonic progress counters (Phase 3). Continuous fields (peaks,
 * totals, playtime) accrue each tick; discrete counters bump at their event site
 * (ship, launch, hire, event). Never decrease. Survive prestige and AGI ascension.
 */
export interface LifetimeStats {
  /** Money earned across all runs (cumulative). */
  totalMoney: Big;
  /** Best Compute/sec ever reached. */
  peakComputePerSec: Big;
  /** Best total product MRR/s ever reached. */
  peakMrr: number;
  /** Best total product MAU ever reached. */
  peakMau: number;
  /** Most research nodes owned in a single run (research resets each run). */
  peakResearchCount: number;
  /** Models shipped (mirrors prestige.ships; kept here for symmetry + secrets). */
  totalShips: number;
  /** Total Legacy Weights ever gained. */
  totalLegacy: Big;
  /** Products launched across all runs. */
  productsLaunched: number;
  /** Employees hired across all runs. */
  employeesHired: number;
  /** World events resolved (a choice made). */
  worldEventsResolved: number;
  /** Total play time, seconds (accrued each tick). */
  playtimeSec: number;
  /** AGI ascensions — ships taken in the Post-Singularity era past the Legacy floor.
   *  Each grants a permanent compounding boost (derive's ascensionMult). */
  ascensions: number;
}

/** An individual employee. roleId names a job (balance.staff.roles); the person's
 *  output = that role's effect × their level × trait. Product-team people can be
 *  assigned to one product (focus bonus); infra people always work on the lab. */
export interface Employee {
  id: string;
  name: string;
  roleId: string;
  /** Seniority level (1 = junior). Raised by completing training. */
  level: number;
  /** Personality/specialty trait id, or null. */
  trait: string | null;
  /** Product this person is focused on, or null = global (bench/lab). */
  assignedProductId: string | null;
  /** In-progress timed training, or null. On completion: level + 1. */
  training: { remainingSec: number; totalSec: number } | null;
}

/** A released AI product (Phase 3). Economic fields are plain numbers; net margin
 *  flows into Money (Big) in tick. quality = the competitor frontier at last (re)launch. */
export interface ProductState {
  id: string;
  name: string;
  type: ProductTypeId;
  version: number;
  quality: number;
  /** Pro-tier pricing strategy (×ARPU; higher = more $/user, less conversion). */
  priceMult: number;
  /** Whether the premium Enterprise tier is offered (unlocks with ship count). */
  enterprise: boolean;
  /** Enterprise-tier price dial (×, applied to its premium ARPU). */
  enterprisePrice: number;
  /** Player marketing budget, Money/sec (split across channels by channelMix). */
  marketingPerSec: number;
  /** Relative budget weights per marketing channel (normalized in the sim). */
  channelMix: Record<string, number>;
  /** Live monthly-active users and paying subscribers. */
  mau: number;
  paid: number;
  /** Remaining launch-buzz seconds (acquisition spike + churn cut). */
  buzzSec: number;
  /** An in-progress timed version upgrade (research), or null. The model keeps
   *  earning at its current quality until the upgrade completes. */
  upgrade: UpgradeState | null;
  /** Ids of purchased per-product features (perks that tune this product's economics). */
  features: string[];
}

/** A version upgrade in flight: pay an upfront chunk to start, then it drains the
 *  remainder of the Compute+Data cost over a research duration. On completion the
 *  product jumps to the current frontier and fires launch buzz. Stalls (no progress)
 *  on any tick the player can't afford the drain. */
export interface UpgradeState {
  /** Version the product becomes when this completes. */
  targetVersion: number;
  /** Compute still to be drained before completion. */
  remainingCompute: number;
  /** Data still to be drained before completion. */
  remainingData: number;
  /** Research seconds left (drives the progress bar + ETA). */
  remainingSec: number;
  /** Total research seconds (for the progress %). */
  totalSec: number;
}

/** A "raw model" deposited in the Products tab each time you Ship the Model. The
 *  player commercialises it (pick a type + name, pay the launch cost) → a product. */
export interface DraftModel {
  id: string;
  /** Strength of the shipped model → the product's starting quality. */
  quality: number;
  /** Which ship produced it (flavor + ordering). */
  ships: number;
}

export interface ProductsState {
  active: ProductState[];
  /** Unlaunched "raw models" from shipping, awaiting commercialisation. */
  drafts: DraftModel[];
  /** Global competitor capability; drifts up over time. */
  frontier: number;
  /** Lifetime count of products sold/retired (a badge stat; survives prestige). */
  sold: number;
  /** Ids of achieved product milestones (a collection; survives prestige). */
  milestones: string[];
}

/** Everything the sim and UI read each frame, folded from upgrades + research + prestige. */
export interface Derived {
  computePerSec: Big;
  dataMult: Big;
  moneyMult: Big;
  runDurationSec: number;
  passiveMoneyPerSec: Big;
  /** Passive Data/sec from dark-web tools (web scrapers, botnets…). */
  dataPerSec: Big;
  autoClaim: boolean;
  autoTrain: boolean;
  /** Compute cost to start one training run. */
  runComputeCost: Big;
  /** Base Data/Money payout of one run, before mults. */
  runDataYield: Big;
  runMoneyYield: Big;
  /** Global multiplier from Legacy Weights (1 + weights * perPoint). */
  legacyMult: Big;
  /** Ongoing staff payroll drained from Money each second (Phase 2). */
  payrollPerSec: Big;
  /** Global product-team buffs from UNASSIGNED staff (shown on the Employees page). */
  productMods: ProductMods;
  /** Effective per-product buffs (global unassigned + that product's focused assignees).
   *  Keyed by product id; the sim reads this so each product can differ. */
  productModsById: Record<string, ProductMods>;
  /** Staff hire-cost multiplier from Recruiters (≤ 1; cheaper hires). */
  hireDiscount: number;
}

/** Aggregate product-team multipliers from employees. Neutral = all 1. */
export interface ProductMods {
  /** Version-research speed (>1 = faster upgrades). */
  upgradeSpeed: number;
  /** Serving-cost multiplier (<1 = cheaper to serve). */
  serveCost: number;
  /** Churn multiplier (<1 = stickier). */
  churn: number;
  /** Acquisition multiplier (>1 = more users in). */
  acq: number;
  /** ARPU multiplier (>1 = more revenue per paying user). */
  arpu: number;
  /** Product Heat-generation multiplier (<1 = less Regulatory Heat). */
  heat: number;
}
