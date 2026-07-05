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

/** Total Reputation earned from completed contracts (summed into earnedReputation).
 *  Sponsor completions (`sponsor_<dayKey>`) pay the flat sponsor rate. */
export function contractsReputation(state: GameState): number {
  let pts = 0;
  for (const id of state.contracts.completed) {
    if (SPONSOR_ID_RE.test(id)) pts += C.sponsor.rep;
    else pts += DEF_BY_ID.get(id)?.rep ?? 0;
  }
  return pts;
}

// ---------- IDEAS #9 — rotating daily sponsor contracts (post-ladder) ----------

/** Completed-sponsor id format: sponsor_<local days-since-epoch>. */
export const SPONSOR_ID_RE = /^sponsor_\d{1,7}$/;

export const sponsorIdFor = (dayKey: number): string => `sponsor_${dayKey}`;

/** Small deterministic day hash (Knuth multiplicative). */
const dayHash = (dayKey: number): number => (dayKey * 2654435761) >>> 0;

/**
 * Roll (or clear) today's sponsor objective. Deterministic in (state, dayKey);
 * same-ref no-op when nothing changes. Only offered once the base ladder is
 * fully cleared; the target is anchored to the CURRENT stat at roll time so
 * it stays a fixed, beatable goal for the day. The store passes the local
 * day number in — the engine stays clockless.
 */
export function rollSponsor(state: GameState, dayKey: number): GameState {
  const S = C.sponsor;
  if (!C.enabled || !S.enabled || activeContracts(state).length > 0) {
    return state.sponsor === null ? state : { ...state, sponsor: null };
  }
  if (state.sponsor?.dayKey === dayKey) return state;
  const h = dayHash(dayKey);
  const lane = S.lanes[h % S.lanes.length]!;
  const current = contractMetric(state, lane.metric);
  const mult = S.mults[(h >>> 4) % S.mults.length]!;
  const target = Math.max(lane.floor, Math.ceil(current * mult));
  const title = S.sponsors[(h >>> 8) % S.sponsors.length]!;
  return {
    ...state,
    sponsor: {
      dayKey,
      metric: lane.metric,
      target,
      rep: S.rep,
      title,
      desc: `Today's objective: push your ${lane.noun} past the sponsor's bar. No deadline pressure — miss it and nothing is lost.`,
    },
  };
}

/** Live view of today's sponsor objective (null when none rolled). */
export function sponsorView(state: GameState): (ContractView & { claimed: boolean }) | null {
  const sp = state.sponsor;
  if (!sp) return null;
  const metric = sp.metric as ContractDef["metric"];
  const value = contractMetric(state, metric);
  const claimed = state.contracts.completed.includes(sponsorIdFor(sp.dayKey));
  return {
    def: { id: sponsorIdFor(sp.dayKey), title: sp.title, desc: sp.desc, metric, target: sp.target, rep: sp.rep },
    value,
    progress: sp.target > 0 ? Math.min(1, value / sp.target) : 1,
    ready: !claimed && value >= sp.target,
    claimed,
  };
}

/** Claim today's met sponsor objective (records `sponsor_<dayKey>`). */
export function claimSponsor(state: GameState): GameState {
  const v = sponsorView(state);
  if (!v || !v.ready) return state;
  return { ...state, contracts: { completed: [...state.contracts.completed, sponsorIdFor(state.sponsor!.dayKey)] } };
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
