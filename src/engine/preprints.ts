import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Frontier preprints (IDEAS #10) — pure/deterministic. Once the run's research
 * tree is COMPLETE, the panel offers a repeatable "publish a preprint" node:
 * escalating Compute+Data cost, a small all-lane boost per paper, hard-capped
 * per run, reset by prestige (state.preprints lives outside `research` but
 * follows the same lifecycle). The end-of-run dead zone becomes a real
 * spend-vs-ship decision.
 *
 * Curve-safety: preprintMult is EXACTLY 1 at zero papers, the balance sim's
 * greedy player only buys `balance.research` nodes, and the per-run cap bounds
 * the compounding ceiling (perLevelMult^maxPerRun ≈ ×1.22).
 */

const P = balance.preprints;

/** All-lane multiplier from published preprints (1 at zero — identity). */
export function preprintMult(state: GameState): Big {
  return state.preprints > 0 ? Big.of(P.perLevelMult).pow(state.preprints) : Big.ONE;
}

/** Exclusive-fork lockout, mirrored from actions.ts — importing it would cycle
 *  (derive → preprints → actions → derive), so the 3-line check lives here too. */
function lockedOut(state: GameState, id: string): boolean {
  const def = balance.research.find((r) => r.id === id);
  if (!def?.exclusiveGroup || state.research.includes(id)) return false;
  return balance.research.some(
    (r) => r.id !== id && r.exclusiveGroup === def.exclusiveGroup && state.research.includes(r.id),
  );
}

/** Every node owned or locked out by a chosen exclusive sibling. */
export function treeComplete(state: GameState): boolean {
  return balance.research.every((d) => state.research.includes(d.id) || lockedOut(state, d.id));
}

/** Preprints only open once the tree is done (they're the tree's coda). */
export function preprintsUnlocked(state: GameState): boolean {
  return P.enabled && treeComplete(state);
}

/** Cost of the NEXT paper: base × growth^published × the difficulty cost knob
 *  (same knob research pays, so preprints scale with any future retune). */
export function preprintCost(state: GameState): { compute: Big; data: Big } {
  const g = Math.pow(P.growth, state.preprints) * balance.difficulty.costMult;
  return { compute: Big.of(P.cost.compute).mul(g), data: Big.of(P.cost.data).mul(g) };
}

export function canBuyPreprint(state: GameState): boolean {
  if (!preprintsUnlocked(state) || state.preprints >= P.maxPerRun) return false;
  const c = preprintCost(state);
  return state.resources.compute.gte(c.compute) && state.resources.data.gte(c.data);
}

/** Publish: spend the Compute+Data, bank the paper. Same-ref no-op otherwise. */
export function buyPreprint(state: GameState): GameState {
  if (!canBuyPreprint(state)) return state;
  const c = preprintCost(state);
  return {
    ...state,
    resources: {
      ...state.resources,
      compute: state.resources.compute.sub(c.compute),
      data: state.resources.data.sub(c.data),
    },
    preprints: state.preprints + 1,
  };
}

/** The next paper's rotating satirical title. */
export function preprintTitle(level: number): string {
  return P.titles[((level % P.titles.length) + P.titles.length) % P.titles.length]!;
}
