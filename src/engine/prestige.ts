import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { products as P } from "./balance/products";
import { createInitialState } from "./state";
import { carryEarnedComponents } from "./components";
import { startingRacks } from "./reputation";
import { hallCapacity } from "./hall";
import { currentEra } from "./eras";
import { trialConditionMet, trialToStartAtShip, trialUnplugsLegacy } from "./trials";
import { advanceFlagship } from "./flagship";
import { legacyMultiplier } from "./derive";
import { legacyAvailable } from "./legacyTree";
import { resolveStakeOutcome, playerMarketRank, rivalsBeaten } from "./market";
import { capCarriedMarketing } from "./products";
import { truceAcrossShip } from "./negotiation";
import type { DraftModel, GameState } from "./types";

/**
 * "Ship the Model" — the retention engine (GDD §4). Reset the run, keep Legacy
 * Weights as a permanent global multiplier. The first ship must land while the
 * player is still engaged, so the requirement/formula live in balance and get
 * tuned against the sim, never hand-guessed.
 */

/** Base-10 magnitude of a Big for the Archive's bounded, JSON-native record. A zero
 *  or non-finite value reads as 0 rather than -Infinity, which JSON cannot carry. */
function magOf(b: Big): number {
  const v = b.log10();
  return Number.isFinite(v) ? v : 0;
}

/** The flavored ways to ship (GDD §4). `deploy` is the balanced default. */
export type ShipMode = keyof typeof balance.prestige.shipModes;

/** Can the player ship yet? Gated on having built a deployable model. */
export function canPrestige(state: GameState): boolean {
  return state.research.includes(balance.prestige.capabilityResearch);
}

/** The capability node plus every prerequisite under it, in tree order: the research
 *  a run actually needs to be able to Ship. Static over the balance data. */
const SHIP_PATH: readonly string[] = (() => {
  const byId = new Map(balance.research.map((r) => [r.id, r]));
  const need = new Set<string>();
  const visit = (id: string) => {
    if (need.has(id)) return;
    need.add(id);
    for (const r of byId.get(id)?.requires ?? []) visit(r);
  };
  visit(balance.prestige.capabilityResearch);
  return balance.research.filter((r) => need.has(r.id)).map((r) => r.id);
})();

/**
 * Progress along the road to a Ship: how many of the research nodes the capability
 * node depends on are owned. The panel used to show "Research n/25" — the WHOLE
 * tree — so the bar read 36–48% at the very moment shipping unlocked. Pure.
 */
export function onShipPath(id: string): boolean {
  return SHIP_PATH.includes(id);
}

export function shipPath(state: GameState): { done: number; total: number } {
  const owned = new Set(state.research);
  return { done: SHIP_PATH.filter((id) => owned.has(id)).length, total: SHIP_PATH.length };
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

/** The AGI-ascension gate: a ship counts as one if it lands in the Post-Singularity
 *  era (by ship count) AND lifetime Legacy — including what THIS ship banks — clears
 *  the floor. prestige() and the Ship panel both read it, so they can't disagree. */
function ascendsWith(state: GameState, gained: Big): boolean {
  return (
    state.prestige.ships + 1 >= balance.eras.agiAtShips &&
    state.stats.totalLegacy.add(gained).gte(Big.of(balance.eras.agi.legacyThreshold))
  );
}

/** Would shipping now in `mode` be an AGI ascension? Judged on what that mode really
 *  banks (mode multiplier × charter conviction — legacyWeightsForMode), not the base
 *  gain: near the floor, Sell can fall short where Open-source or Hard clear it. */
export function shipWouldAscend(state: GameState, mode: ShipMode): boolean {
  return canPrestige(state) && ascendsWith(state, legacyWeightsForMode(state, mode));
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
/** The global multiplier the NEXT run would start with if the player shipped now in
 *  `mode`: today's uninvested weights plus what this ship banks. Pure display.
 *  A queued Unplugged Trial starts on that fresh lab and switches Legacy off for the
 *  whole run (derive reads ×1), so that run starts at ×1 whatever the weights are. */
export function nextRunMultiplier(state: GameState, mode: ShipMode = "deploy"): Big {
  if (canPrestige(state) && trialUnplugsLegacy(trialStartingAtShip(state))) return Big.ONE;
  return legacyMultiplier(legacyAvailable(state).add(legacyWeightsForMode(state, mode)));
}

/** The Trials on record after shipping now: the active one is banked if its run
 *  condition held (a failed condition just clears it, no reward). */
function trialsBankedAtShip(state: GameState): string[] {
  const id = state.activeTrial;
  if (!id || state.trialsDone.includes(id)) return state.trialsDone;
  return trialConditionMet(state) ? [...state.trialsDone, id] : state.trialsDone;
}

/** The Trial shipping now would start on the fresh lab: the queued one, if it can
 *  start there (judged on the post-ship ship count and banked Trials). */
function trialStartingAtShip(state: GameState, trialsDone: string[] = trialsBankedAtShip(state)): string | null {
  return trialToStartAtShip(
    { ...state, prestige: { ...state.prestige, ships: state.prestige.ships + 1 }, trialsDone },
    state.queuedTrial,
  );
}

/**
 * The timed boosts a Ship carries into the fresh run: the ones the PLAYER claimed — the
 * Daily Boost (`daily_*`, actions.ts grantDailyBoost) and an Objective's reward
 * (`obj_*`, objectives.ts claimObjective) — with the time they had left. They are the
 * player's rewards, not the run's: a Ship rebuilt `modifiers` from scratch, so a Daily
 * Boost claimed a minute before shipping was simply gone (and the daily bar stays spent
 * until tomorrow). World-event effects are the run's news and still end with it. Both
 * kinds are claim-gated, and the balance sim claims neither, so this is identity there.
 */
export function claimedBoostsAcrossShip(state: GameState): GameState["modifiers"] {
  return state.modifiers.filter(
    (m) => (m.id.startsWith("daily_") || m.id.startsWith("obj_")) && m.tone === "good" && m.remainingSec > 0,
  );
}

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
  const isAscension = ascendsWith(state, gained);

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
  // A pending regulator truce crosses the ship with the suspicion it guards (see
  // truceAcrossShip) — otherwise Chen is back on the fresh run's first tick. So do the
  // timed boosts the player claimed (see claimedBoostsAcrossShip).
  const carriedMods = [...momentumMods, ...truceAcrossShip(state), ...claimedBoostsAcrossShip(state)];

  // Frontier Race stakes (depth batch): resolve the active wager at ship — a win
  // banks Reputation by the rival's weight, a loss pays nothing; either way it
  // clears. The sim never stakes → repWon is 0 and this is identity.
  const stake = resolveStakeOutcome(state);

  const trialsDoneNext = trialsBankedAtShip(state);

  // The fresh $0 lab can't bankroll a carried marketing campaign that loses money, so
  // each one is cut back to what its own product funds (see capCarriedMarketing). It
  // reads the finished post-ship state (reset staff assignments, Heat, frontier).
  return capCarriedMarketing({
    ...fresh,
    upgrades: freshUpgrades,
    // Trophy hardware survives the ship (earned by persistent milestones); bought
    // parts go with the acquirer, and the loadout clears like the racks it fitted.
    components: carryEarnedComponents(state),
    modifiers: carriedMods,
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
    // A version upgrade still in flight is dropped, not carried: its remaining cost was
    // priced from the OLD run's Data rate, so in the fresh lab it drained every bit of
    // Data (and a share of Compute) each tick and froze research for the whole
    // generation. Its upfront share came out of pools this Ship wipes anyway.
    products: {
      ...state.products,
      active: state.products.active.map((p) => (p.upgrade ? { ...p, upgrade: null } : p)),
      drafts,
      frontier: state.products.frontier + modeDef.frontierPenalty,
    },
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
      // Strictly PAST the threshold (2026-09): Declare a Stance sets exactly −0.4 with
      // one tap, which would pay this +3 Rep/ship for free every run. A safety ship
      // is one your own choices pushed further toward caution.
      safetyShips: state.stats.safetyShips + (state.alignment < -balance.worldEvents.factionThreshold - 1e-9 ? 1 : 0),
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
    // ...and so are the Fellowship chairs endowed from its Grants. They were missing
    // here, so `...fresh` zeroed them on every ship while the Grants they cost were
    // silently refunded — the player had to re-endow every generation.
    instituteFellowships: state.instituteFellowships,
    // Facility Wings are a BUILDING, not a run: the floors you founded (and the
    // Reputation you spent founding them, carried in `reputation` above) survive the
    // reset. Racks reset like every other upgrade; the rooms that housed them don't.
    facilityWings: state.facilityWings,
    // Prestige Trials: shipping ends the active constrained run. Bank its reward IF
    // its run condition (if any) held — a "solo" Trial needs an empty roster, "hot"
    // needs Heat ≥ 60, "neutral" needs an uncommitted alignment. Cleared either way
    // (a failed condition just gives no reward, retry next run). trialConditionMet is
    // the single source for every condition; inlined import keeps prestige cycle-free.
    // A Trial QUEUED during the run starts here, on the fresh lab, so its handicap
    // is endured from the first second (see canStartTrial).
    activeTrial: trialStartingAtShip(state, trialsDoneNext),
    queuedTrial: null,
    trialsDone: trialsDoneNext,
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
    // THIS generation's high-water marks instead of all-time career peaks. The rest is
    // read here for the same reason: after the reset the alignment is back to 0, the
    // press-blitz strikes are cleared (rivals regain their users) and the era counts
    // the new ship, so a report built from the fresh state described the NEXT run.
    lastShipReport: {
      peakCompute: state.runPeakCompute,
      peakMrr: state.runPeakMrr,
      era: currentEra(state),
      alignment: state.alignment,
      rank: playerMarketRank(state),
      rivalsBeaten: rivalsBeaten(state),
      productsLive: state.products.active.length,
    },
    // The Legacy Wall (IDEAS #6) remembers how this generation shipped: the hall
    // renders these as trophy plinths, so the reset visibly ADDS to the room.
    // The Archive: what this generation actually WAS, recorded at the ship. Reads
    // only state that already exists (run-scoped peaks, roster/portfolio sizes, the
    // charter flown, the Trial that banked), so it adds no new bookkeeping to tick.
    // Magnitudes rather than Bigs — see ShipLogEntry.
    shipLog: [...state.shipLog, {
      mode,
      era: currentEra(state),
      asc: isAscension,
      gen: ships,
      legacyMag: magOf(gained),
      peakComputeMag: magOf(state.runPeakCompute),
      research: state.research.length,
      products: state.products.active.length,
      staff: state.employees.length,
      // Optional fields are OMITTED rather than set to undefined (the project runs
      // exactOptionalPropertyTypes), which also keeps a hundred-generation Archive
      // out of the save as empty keys.
      ...(state.charter ? { charter: state.charter } : {}),
      // The Trial this ship BANKED — the same condition check the trialsDone fold
      // below uses, so the Archive can never credit a generation with a Trial that
      // failed its condition.
      ...(state.activeTrial && !state.trialsDone.includes(state.activeTrial) && trialConditionMet(state)
        ? { trial: state.activeTrial }
        : {}),
      atSec: Math.max(0, Math.floor(state.stats.playtimeSec)),
    }].slice(-balance.prestige.shipLogCap),
    // Today's sponsor objective (IDEAS #9) tracks lifetime stats, so it survives
    // the reset like the contracts board it extends.
    sponsor: state.sponsor,
  });
}
