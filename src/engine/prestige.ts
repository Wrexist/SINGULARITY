import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { products as P } from "./balance/products";
import { createInitialState } from "./state";
import { carryEarnedComponents } from "./components";
import { startingRacks } from "./reputation";
import { hallCapacity } from "./hall";
import { currentEra } from "./eras";
import { trialConditionMet } from "./trials";
import { advanceFlagship } from "./flagship";
import { resolveStakeOutcome } from "./market";
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

/** Charter-conviction multiplier (B1, escalated in the depth batch): shipping with
 *  the SAME charter as previous consecutive runs rewards commitment on a ladder —
 *  ×1.15 → ×1.25 → ×1.40 capped. 1 when no charter / different / first runs.
 *  The streak counts consecutive ships ENDING with this one that used this charter;
 *  it's carried on state (persisted) and updated by prestige() at each ship. Pure. */
export function charterConvictionMult(state: GameState): number {
  if (state.charter == null || state.charter !== state.lastCharter) return 1;
  const ladder = balance.prestige.charterConvictionLadder;
  const idx = Math.min(ladder.length - 1, Math.max(0, (state.charterStreak ?? 0) + 1 - 2));
  return ladder[idx]!;
}

/** Legacy Weights a given ship mode would actually bank (base × mode mult × conviction). */
export function legacyWeightsForMode(state: GameState, mode: ShipMode): Big {
  const base = legacyWeightsGain(state);
  if (!canPrestige(state)) return base;
  return base
    .mul(balance.prestige.shipModes[mode].legacyMult)
    .mul(charterConvictionMult(state))
    .floor()
    .max(1);
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

  // Founder's Stockpile (reputation perk): begin the fresh run with some basic racks
  // already humming — bounded by the starting floor so it never breaks the capacity
  // rule. Zero with no perk owned, so the first run's cold open is byte-identical.
  const freeRacks = Math.min(startingRacks(state), hallCapacity(fresh));
  const freshUpgrades = freeRacks > 0 ? { ...fresh.upgrades, rack_basic: freeRacks } : fresh.upgrades;

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

  // "Community momentum": some ship modes leave the next run with a short, temporary
  // all-lane buff (the community iterating on your release, or launch-week hype).
  // Temporary modifiers can't inflate the permanent curve; open-source and splash set one.
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

  // Frontier Race stakes (depth batch): resolve the active wager at ship — a win
  // banks Reputation by the rival's weight, a loss pays nothing; either way it
  // clears. The sim never stakes → repWon is 0 and this is identity.
  const stake = resolveStakeOutcome(state);

  return {
    ...fresh,
    upgrades: freshUpgrades,
    // Trophy hardware survives the ship (earned by persistent milestones); bought
    // parts go with the acquirer, and the loadout clears like the racks it fitted.
    components: carryEarnedComponents(state),
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
    // Flagship brand: if the designated product survived to this ship, its tenure grows
    // (capped); if it was retired, the brand is lost. The sim never has a flagship.
    flagship: advanceFlagship(state),
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
      // Keyed off the mode id (not `reputationBonus > 0`) so adding a future bonus-bearing
      // mode can't silently miscount this stat or the reputation it feeds.
      openSourceShips: state.stats.openSourceShips + (mode === "open_source" ? 1 : 0),
      // Shipping while committed to safety (doomer past the faction threshold) earns
      // community standing → Lab Reputation (B1). Neutral/accel ships don't count, and
      // the first ship is always neutral, so this is 0 through the tuned curve.
      safetyShips: state.stats.safetyShips + (state.alignment <= -balance.worldEvents.factionThreshold ? 1 : 0),
      // Frontier Race stake payout (depth batch): a WON wager's Reputation lands here
      // and earnedReputation folds it in. 0 unless the player staked and won.
      stakesRepEarned: state.stats.stakesRepEarned + stake.repWon,
    },
    // Achievements are a permanent collection — they survive the reset.
    achievements: state.achievements,
    // Lab Reputation (points + bought perks) is permanent meta-progression.
    reputation: state.reputation,
    // The Reputation Endowment is permanent too (survives prestige AND ascension).
    repEndowment: state.repEndowment,
    // The lane Directives chosen while levelling the Endowment are permanent as well.
    endowmentDirectives: state.endowmentDirectives,
    // Paradigm Research nodes are permanent capability unlocks — they persist too.
    paradigms: state.paradigms,
    // Doctrine perks claimed by committing to a stance are permanent progression.
    doctrines: state.doctrines,
    // The Institute's founded wings are the deepest permanent meta-progression.
    institute: state.institute,
    // Prestige Trials: shipping ends the active constrained run. Bank its reward IF
    // its run condition (if any) held — a "solo" Trial needs an empty roster, "hot"
    // needs Heat ≥ 60, "neutral" needs an uncommitted alignment. Cleared either way
    // (a failed condition just gives no reward, retry next run). trialConditionMet is
    // the single source for every condition; inlined import keeps prestige cycle-free.
    activeTrial: null,
    trialsDone: (() => {
      const id = state.activeTrial;
      if (!id || state.trialsDone.includes(id)) return state.trialsDone;
      const banks = trialConditionMet(state);
      return banks ? [...state.trialsDone, id] : state.trialsDone;
    })(),
    // Grand Challenges are a career-spanning grind — funding + completions persist.
    challenges: state.challenges,
    // Megaprojects II (the repeatable post-challenge loop) persist across ships too.
    megaprojects: state.megaprojects,
    // Lab Objectives persist too (an onboarding-grind ladder consumed once across runs).
    objectives: state.objectives,
    // Automation toggles are a permanent QoL choice — they persist across the reset.
    automation: state.automation,
    // Contracts completed are career progress (and feed Reputation) — they persist.
    contracts: state.contracts,
    // Legacy Investments are permanent prestige-tree progress — they persist.
    legacyInvestments: state.legacyInvestments,
    // Remember the charter just shipped so picking it again next run earns the
    // conviction bonus (B1) — now ESCALATING with the consecutive-same-charter
    // streak. The fresh run's own charter resets to null (...fresh).
    lastCharter: state.charter,
    // The streak counts consecutive ships ending with THIS one that used this
    // charter: same charter again → prev+1; a fresh pick → 1; none → 0. The sim
    // never sets a charter, so this stays 0 through the tuned curve.
    charterStreak: state.charter != null
      ? (state.charter === state.lastCharter ? (state.charterStreak ?? 0) : 0) + 1
      : 0,
    // Frontier Race stakes (depth batch): the wager always clears at ship.
    rivalStake: stake.rivalStake,
    // Endowment Directive respecs are permanent meta-progression — persist.
    endowmentRespecs: state.endowmentRespecs,
    // The regulator's suspicion is a LONG memory — it persists across the ship (B3).
    // A clean lab carries 0, so the tuned curve is untouched.
    suspicion: state.suspicion,
    // Snapshot the just-finished run's peaks for the Generation Report (the fresh
    // run's own peaks reset to 0 via ...fresh). This is what makes the report show
    // THIS generation's high-water marks instead of all-time career peaks.
    lastShipReport: { peakCompute: state.runPeakCompute, peakMrr: state.runPeakMrr },
    // The Legacy Wall (IDEAS #6) remembers how this generation shipped: the hall
    // renders these as trophy plinths, so the reset visibly ADDS to the room.
    shipLog: [...state.shipLog, { mode, era: currentEra(state), asc: isAscension }].slice(-balance.prestige.shipLogCap),
    // Today's sponsor objective (IDEAS #9) tracks lifetime stats, so it survives
    // the reset like the contracts board it extends.
    sponsor: state.sponsor,
  };
}
