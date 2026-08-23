import { Big } from "./math/Big";
import { products as PRODUCTS } from "./balance/products";
import { initialStats } from "./stats";
import { freshComponents } from "./components";
import type { GameState } from "./types";

export const SAVE_VERSION = 33;

/** A fresh lab: empty closet, a trickle of free Compute, nothing owned. */
export function createInitialState(): GameState {
  return {
    version: SAVE_VERSION,
    resources: {
      compute: Big.ZERO,
      data: Big.ZERO,
      money: Big.ZERO,
    },
    upgrades: {},
    research: [],
    run: { active: false, progress: 0, readyToClaim: false },
    prestige: { legacyWeights: Big.ZERO, ships: 0 },
    lifetimeMoney: Big.ZERO,
    heat: 0,
    suspicion: 0,
    modifiers: [],
    // Faction stance (Phase 2): −1 doomer … +1 accelerationist. Set by event choices.
    alignment: 0,
    // Auto-train focus (1 = full training; lower banks Compute for research).
    computeFocus: 1,
    // Phase 3 — released AI products (persist across prestige); none yet.
    products: { active: [], drafts: [], frontier: PRODUCTS.frontierStart, sold: 0, milestones: [] },
    employees: [],
    stats: initialStats(),
    achievements: [],
    reputation: { spent: 0, perks: [] },
    // Endgame Reputation Endowment — nothing bought until the whole perk tree is owned.
    repEndowment: 0,
    endowmentDirectives: [],
    activeTrial: null,
    trialsDone: [],
    paradigms: [],
    doctrines: [],
    institute: [],
    instituteFellowships: 0,
    flagship: { productId: null, tenure: 0 },
    contracts: { completed: [] },
    charter: null,
    charterLocked: false,
    lastCharter: null,
    // Charter conviction streak — no charter → 0 (identity through the tuned curve).
    charterStreak: 0,
    // Frontier Race stakes — nothing wagered until the player places one.
    rivalStake: null,
    // Endowment Directive respecs — none bought until directives exist.
    endowmentRespecs: 0,
    legacyInvestments: [],
    // Rig Bay (C1): empty inventory, empty loadouts. Resets on prestige.
    components: freshComponents(),
    // Rival counterplay: no strikes landed, press cycle ready.
    rivalOps: { strikes: {}, lastStrikeSec: null },
    runPeakCompute: Big.ZERO,
    runPeakMrr: 0,
    lastShipReport: null,
    // IDEAS #6 — the Legacy Wall's memory: one entry per shipped generation.
    shipLog: [],
    // IDEAS #9 — no sponsor objective until the contract ladder is cleared.
    sponsor: null,
    // IDEAS #10 — no preprints published; resets each run like research.
    preprints: 0,
    // Grand Challenges — no funding yet; persists across prestige once started.
    challenges: { funded: {}, completed: [], forks: {} },
    megaprojects: { level: 0, funded: { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO } },
    // Lab Objectives — none claimed yet; persists across prestige (onboarding-grind ladder).
    objectives: { completed: [] },
    // Automation — every autopilot off by default; unlocked by ship count, persists.
    automation: {},
  };
}
