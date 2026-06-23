import type { Big } from "./math/Big";

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
}
