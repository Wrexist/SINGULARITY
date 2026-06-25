import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { products as P } from "./balance/products";
import { createInitialState } from "./state";
import type { DraftModel, GameState } from "./types";

/**
 * "Ship the Model" — the retention engine (GDD §4). Reset the run, keep Legacy
 * Weights as a permanent global multiplier. The first ship must land while the
 * player is still engaged, so the requirement/formula live in balance and get
 * tuned against the sim, never hand-guessed.
 */

/** Can the player ship yet? Gated on having built a deployable model. */
export function canPrestige(state: GameState): boolean {
  return state.research.includes(balance.prestige.capabilityResearch);
}

/**
 * Legacy Weights shipping now would grant: max(1, floor((money/scale)^exp)).
 * Computed Big-native (no .toNumber() round-trip) so it never overflows to
 * Infinity past ~1e308 and poisons the permanent multiplier — the entire reason
 * the Big abstraction exists (LEARNINGS: idle curves hit 1e308 within hours).
 */
export function legacyWeightsGain(state: GameState): Big {
  if (!canPrestige(state)) return Big.ZERO;
  const ratio = state.lifetimeMoney.div(balance.prestige.scale);
  return ratio.pow(balance.prestige.exponent).floor().max(1);
}

/**
 * Perform the ship: reset Compute/Data/Money, racks, and research; carry over
 * Legacy Weights (added to existing) and ship count. Cosmetics/achievements
 * would persist here too (stubbed for Phase 0). No-op if not yet eligible.
 */
export function prestige(state: GameState): GameState {
  if (!canPrestige(state)) return state;
  const gained = legacyWeightsGain(state);
  const fresh = createInitialState();
  const ships = state.prestige.ships + 1;

  // AGI ascension: this ship counts as an ascension if it lands you in the
  // Post-Singularity era (by ship count) AND your lifetime Legacy clears the floor.
  // Hard-gated so it stays 0 through the whole early/mid game (no curve impact).
  const newTotalLegacy = state.stats.totalLegacy.add(gained);
  const isAscension =
    ships >= balance.eras.agiAtShips &&
    newTotalLegacy.gte(Big.of(balance.eras.agi.legacyThreshold));

  // Shipping deposits the flagship you just trained as a "raw model" draft in the
  // Products tab — the player commercialises it (pick a type + name, pay to launch)
  // into a standing business. Its strength = the competitive frontier at ship time,
  // so a longer run yields a stronger starting product. Oldest drafts drop off the cap.
  const draft: DraftModel = {
    id: `draft-${ships}`,
    quality: Math.max(1, state.products.frontier),
    ships,
  };
  const drafts = [...state.products.drafts, draft].slice(-P.maxDrafts);

  return {
    ...fresh,
    prestige: {
      legacyWeights: state.prestige.legacyWeights.add(gained),
      ships,
    },
    // Phase 3 — released products are your standing business; they survive the
    // reset and keep earning Money into the next run (the meta-reward for shipping).
    products: { ...state.products, drafts },
    // Your team stays with you across a ship (they're employed by the company,
    // not the run) — but their product assignments reset since the lab is fresh.
    employees: state.employees.map((e) => ({ ...e, assignedProductId: null })),
    // Lifetime stats persist across the ship; the ship itself bumps its counters.
    stats: {
      ...state.stats,
      totalShips: state.stats.totalShips + 1,
      totalLegacy: newTotalLegacy,
      ascensions: state.stats.ascensions + (isAscension ? 1 : 0),
    },
    // Achievements are a permanent collection — they survive the reset.
    achievements: state.achievements,
    // Lab Reputation (points + bought perks) is permanent meta-progression.
    reputation: state.reputation,
  };
}
