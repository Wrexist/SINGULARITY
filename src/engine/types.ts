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
}
