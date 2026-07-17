import { Big } from "./math/Big";
import { challenges as C, type GrandChallenge } from "./balance/challenges";
import type { GameState } from "./types";

/**
 * Grand Challenges engine (IDEAS #A) — pure & deterministic. The player pours
 * Compute/Data/Money into a moonshot over long horizons; completing it grants a
 * PERMANENT global reward that folds into `derive` exactly like Legacy/Ascension
 * multipliers. Progress persists across prestige (a career-spanning grind).
 *
 * Curve-safe: the balance sim never funds a challenge, so `completed` stays empty
 * and `challengeMods` is identity (all ×1) in the tuned economy.
 */

const BY_ID = new Map(C.list.map((c) => [c.id, c]));
const zeroFund = () => ({ compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO });

/** True once the whole system reveals (deep enough that the sim is well clear of it). */
export function challengesUnlocked(state: GameState): boolean {
  return C.enabled && state.prestige.ships >= C.revealAtShips;
}

/** The challenges visible right now (staggered by ship count), completed ones included. */
export function visibleChallenges(state: GameState): GrandChallenge[] {
  if (!C.enabled) return [];
  return C.list.filter((c) => state.prestige.ships >= c.unlockShips);
}

export interface ChallengeView {
  def: GrandChallenge;
  funded: { compute: Big; data: Big; money: Big };
  cost: { compute: Big; data: Big; money: Big };
  /** Per-resource "fully funded" flags. */
  done: { compute: boolean; data: boolean; money: boolean };
  /** 0..1 overall — the least-funded resource gates it, so it hits 1 exactly on completion. */
  progress: number;
  complete: boolean;
}

function costOf(def: GrandChallenge) {
  return { compute: Big.of(def.cost.compute), data: Big.of(def.cost.data), money: Big.of(def.cost.money) };
}

export function challengeView(state: GameState, id: string): ChallengeView | null {
  const def = BY_ID.get(id);
  if (!def) return null;
  const complete = state.challenges.completed.includes(id);
  const f = state.challenges.funded[id] ?? zeroFund();
  const cost = costOf(def);
  const frac = (a: Big, b: Big) => (b.gt(0) ? Math.max(0, Math.min(1, a.div(b).toNumber())) : 1);
  return {
    def,
    funded: f,
    cost,
    done: { compute: f.compute.gte(cost.compute), data: f.data.gte(cost.data), money: f.money.gte(cost.money) },
    progress: complete ? 1 : Math.min(frac(f.compute, cost.compute), frac(f.data, cost.data), frac(f.money, cost.money)),
    complete,
  };
}

/** Is there anything to contribute right now (an unmet resource the player has some of)? */
export function canFundChallenge(state: GameState, id: string): boolean {
  const def = BY_ID.get(id);
  if (!def || state.challenges.completed.includes(id)) return false;
  const f = state.challenges.funded[id] ?? zeroFund();
  const cost = costOf(def);
  const r = state.resources;
  return (
    (f.compute.lt(cost.compute) && r.compute.gt(0)) ||
    (f.data.lt(cost.data) && r.data.gt(0)) ||
    (f.money.lt(cost.money) && r.money.gt(0))
  );
}

/**
 * Contribute every affordable resource toward a challenge's unmet portions (spends them,
 * capped at the remaining need). Pure. Returns the new state and whether THIS call
 * completed the challenge (so the UI can fire the fanfare exactly once).
 */
export function fundChallenge(state: GameState, id: string): { state: GameState; justCompleted: boolean } {
  const def = BY_ID.get(id);
  if (!def || state.challenges.completed.includes(id)) return { state, justCompleted: false };
  const cur = state.challenges.funded[id] ?? zeroFund();
  const cost = costOf(def);
  const r = state.resources;
  // Give min(available, remaining need) of each resource.
  const give = {
    compute: r.compute.min(cost.compute.sub(cur.compute).max(Big.ZERO)),
    data: r.data.min(cost.data.sub(cur.data).max(Big.ZERO)),
    money: r.money.min(cost.money.sub(cur.money).max(Big.ZERO)),
  };
  if (!(give.compute.gt(0) || give.data.gt(0) || give.money.gt(0))) return { state, justCompleted: false };

  const nextFunded = {
    compute: cur.compute.add(give.compute),
    data: cur.data.add(give.data),
    money: cur.money.add(give.money),
  };
  // The early return above already bailed on an id in `completed`, so reaching here
  // means it isn't complete yet — no need to re-check `already`.
  const complete =
    nextFunded.compute.gte(cost.compute) && nextFunded.data.gte(cost.data) && nextFunded.money.gte(cost.money);

  return {
    state: {
      ...state,
      resources: {
        ...r,
        compute: r.compute.sub(give.compute).max(Big.ZERO),
        data: r.data.sub(give.data).max(Big.ZERO),
        money: r.money.sub(give.money).max(Big.ZERO),
      },
      challenges: {
        ...state.challenges,
        funded: { ...state.challenges.funded, [id]: nextFunded },
        completed: complete ? [...state.challenges.completed, id] : state.challenges.completed,
      },
    },
    justCompleted: complete,
  };
}

/** The reward a completed challenge currently grants: the CHOSEN fork arm for a forked
 *  challenge (or none until the player picks), else the fixed reward. */
function activeReward(state: GameState, def: GrandChallenge): GrandChallenge["reward"] | null {
  if (def.forks) {
    const pickedId = state.challenges.forks[def.id];
    const arm = def.forks.find((f) => f.id === pickedId);
    return arm ? arm.reward : null; // forked but unchosen → no reward yet
  }
  return def.reward;
}

/** A completed forked challenge still awaiting the player's either/or choice. The UI
 *  shows a fork picker for these; the reward is dormant until one is chosen. */
export function pendingForkChallenge(state: GameState, id: string): boolean {
  const def = BY_ID.get(id);
  return !!def && !!def.forks && state.challenges.completed.includes(id) && !state.challenges.forks[id];
}

/** Choose a fork arm for a completed forked challenge. Pure; no-op unless the challenge
 *  is completed, forked, the arm is valid, and no arm was chosen yet (choice is final). */
export function chooseFork(state: GameState, id: string, forkId: string): GameState {
  const def = BY_ID.get(id);
  if (!def || !def.forks) return state;
  if (!state.challenges.completed.includes(id)) return state;
  if (state.challenges.forks[id]) return state; // already chosen — final
  if (!def.forks.some((f) => f.id === forkId)) return state;
  return { ...state, challenges: { ...state.challenges, forks: { ...state.challenges.forks, [id]: forkId } } };
}

/** Permanent per-lane multipliers from COMPLETED challenges (identity when none). Folded
 *  into derive like the Legacy/Ascension mults. legacyMult-kind rewards boost all lanes.
 *  A forked challenge contributes only its CHOSEN arm (nothing until the player picks). */
export function challengeMods(state: GameState): { compute: Big; data: Big; money: Big } {
  let compute = Big.ONE;
  let data = Big.ONE;
  let money = Big.ONE;
  for (const id of state.challenges.completed) {
    const def = BY_ID.get(id);
    if (!def) continue;
    const reward = activeReward(state, def);
    if (!reward) continue; // forked-but-unchosen → dormant
    const m = 1 + reward.magnitude;
    switch (reward.kind) {
      case "computeMult": compute = compute.mul(m); break;
      case "dataMult": data = data.mul(m); break;
      case "moneyMult": money = money.mul(m); break;
      case "legacyMult": compute = compute.mul(m); data = data.mul(m); money = money.mul(m); break;
    }
  }
  return { compute, data, money };
}

export { BY_ID as challengeById };
