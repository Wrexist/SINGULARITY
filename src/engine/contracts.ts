import { contracts as C, type ContractDef } from "./balance/contracts";
import { totalRacks } from "./hall";
import type { GameState } from "./types";

/**
 * Contracts engine (Phase 4) — pure/deterministic. The board is derived from the
 * `completed` list (the first `slots` uncompleted pool entries), so there is no
 * stored board to migrate or desync. Claiming a ready contract just appends its
 * id to `completed`; the Reputation reward flows automatically through
 * `earnedReputation` (which sums completed-contract rewards), mirroring how
 * achievements feed Reputation.
 */

export { C as contractsBalance };

const DEF_BY_ID = new Map(C.pool.map((d) => [d.id, d]));

/** Current value of a contract's metric, read straight from state/stats. */
export function contractMetric(state: GameState, metric: ContractDef["metric"]): number {
  switch (metric) {
    case "peakComputePerSec": return state.stats.peakComputePerSec.toNumber();
    case "totalMoney": return state.stats.totalMoney.toNumber();
    case "totalRacks": return totalRacks(state);
    case "productsActive": return state.products.active.length;
    case "employees": return state.employees.length;
    case "ships": return state.prestige.ships;
    case "research": return Math.max(state.research.length, state.stats.peakResearchCount);
    case "peakMrr": return state.stats.peakMrr;
    case "peakMau": return state.stats.peakMau;
    case "ascensions": return state.stats.ascensions;
  }
}

export function contractDone(state: GameState, def: ContractDef): boolean {
  return contractMetric(state, def.metric) >= def.target;
}

/** The board: the first `slots` pool contracts not yet completed, in order. */
export function activeContracts(state: GameState): ContractDef[] {
  if (!C.enabled) return [];
  const done = new Set(state.contracts.completed);
  return C.pool.filter((d) => !done.has(d.id)).slice(0, C.slots);
}

/** True when a contract is on the board, met, and not yet claimed. */
export function contractReady(state: GameState, id: string): boolean {
  if (state.contracts.completed.includes(id)) return false;
  if (!activeContracts(state).some((d) => d.id === id)) return false;
  const def = DEF_BY_ID.get(id);
  return !!def && contractDone(state, def);
}

/** Claim a ready contract: record completion (Reputation follows via earned). */
export function claimContract(state: GameState, id: string): GameState {
  if (!contractReady(state, id)) return state;
  return { ...state, contracts: { completed: [...state.contracts.completed, id] } };
}

/** Total Reputation earned from completed contracts (summed into earnedReputation). */
export function contractsReputation(state: GameState): number {
  let pts = 0;
  for (const id of state.contracts.completed) pts += DEF_BY_ID.get(id)?.rep ?? 0;
  return pts;
}

export interface ContractView {
  def: ContractDef;
  value: number;
  /** 0..1 progress toward the target. */
  progress: number;
  ready: boolean;
}

/** The board with live progress, for the UI. */
export function contractBoard(state: GameState): ContractView[] {
  const completed = new Set(state.contracts.completed);
  return activeContracts(state).map((def) => {
    const value = contractMetric(state, def.metric);
    return {
      def,
      value,
      progress: def.target > 0 ? Math.min(1, value / def.target) : 1,
      ready: value >= def.target && !completed.has(def.id),
    };
  });
}

/** How many contracts are ready to claim (drives a tab/board badge). */
export function contractsReadyCount(state: GameState): number {
  return activeContracts(state).filter((d) => contractReady(state, d.id)).length;
}
