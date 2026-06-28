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

/** The flavored ways to ship (GDD §4). `deploy` is the balanced default. */
export type ShipMode = keyof typeof balance.prestige.shipModes;

/** Can the player ship yet? Gated on having built a deployable model. */
export function canPrestige(state: GameState): boolean {
  return state.research.includes(balance.prestige.capabilityResearch);
}

/** Legacy Weights a given ship mode would actually bank (base × the mode's mult). */
export function legacyWeightsForMode(state: GameState, mode: ShipMode): Big {
  const base = legacyWeightsGain(state);
  if (!canPrestige(state)) return base;
  return base.mul(balance.prestige.shipModes[mode].legacyMult).floor().max(1);
}

/** The permanent AGI-ascension output multiplier (1 = none). Single source of truth
 *  for derive's lane boost AND the UI displays, so they can never diverge. */
export function ascensionMultiplier(state: GameState): number {
  return 1 + state.stats.ascensions * balance.eras.agi.bonusPerAscension;
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
export function prestige(state: GameState, mode: ShipMode = "deploy"): GameState {
  if (!canPrestige(state)) return state;
  const modeDef = balance.prestige.shipModes[mode];
  const gained = legacyWeightsForMode(state, mode);
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
  // Deploy keeps the flagship as a commercialisable draft; open-source/sell give
  // the model away, so no new draft lands in the Products tab.
  const draft: DraftModel = {
    id: `draft-${ships}`,
    quality: Math.max(1, state.products.frontier),
    ships,
  };
  const drafts = modeDef.keepsDraft
    ? [...state.products.drafts, draft].slice(-P.maxDrafts)
    : state.products.drafts;

  // Selling to a hyperscaler hands you cash to bootstrap the fresh run (bounded
  // by ship count so it can't snowball). Other modes start from the clean slate.
  const kickstart = modeDef.moneyKickstartPerShip * ships;

  // Open-source "community momentum": some ship modes leave the next run with a
  // short, temporary all-lane buff (the community iterating on your release).
  // Temporary modifiers can't inflate the permanent curve; only open-source sets one.
  const momentum = modeDef.momentum;
  const momentumMods: GameState["modifiers"] = momentum
    ? (["computeMult", "dataMult", "moneyMult"] as const).map((target) => ({
        id: `momentum_${target}`,
        target,
        factor: momentum.factor,
        remainingSec: momentum.durationSec,
        label: `Community momentum ×${momentum.factor}`,
        tone: "good" as const,
      }))
    : fresh.modifiers;

  return {
    ...fresh,
    modifiers: momentumMods,
    resources: kickstart > 0
      ? { ...fresh.resources, money: fresh.resources.money.add(kickstart) }
      : fresh.resources,
    prestige: {
      legacyWeights: state.prestige.legacyWeights.add(gained),
      ships,
    },
    // Phase 3 — released products are your standing business; they survive the
    // reset and keep earning Money into the next run (the meta-reward for shipping).
    // A "hard" ship leaps the competitive frontier so carried products start behind.
    products: { ...state.products, drafts, frontier: state.products.frontier + modeDef.frontierPenalty },
    // Your team stays with you across a ship (they're employed by the company,
    // not the run) — but their product assignments reset since the lab is fresh.
    employees: state.employees.map((e) => ({ ...e, assignedProductId: null })),
    // Lifetime stats persist across the ship; the ship itself bumps its counters.
    stats: {
      ...state.stats,
      totalShips: state.stats.totalShips + 1,
      totalLegacy: newTotalLegacy,
      ascensions: state.stats.ascensions + (isAscension ? 1 : 0),
      // Open-sourcing earns community goodwill → Lab Reputation (via earnedReputation).
      openSourceShips: state.stats.openSourceShips + (modeDef.reputationBonus > 0 ? 1 : 0),
    },
    // Achievements are a permanent collection — they survive the reset.
    achievements: state.achievements,
    // Lab Reputation (points + bought perks) is permanent meta-progression.
    reputation: state.reputation,
    // Contracts completed are career progress (and feed Reputation) — they persist.
    contracts: state.contracts,
    // Legacy Investments are permanent prestige-tree progress — they persist.
    legacyInvestments: state.legacyInvestments,
  };
}
