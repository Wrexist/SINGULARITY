import { Big } from "./math/Big";
import { SAVE_VERSION, createInitialState } from "./state";
import { initialStats } from "./stats";
import { products as PRODUCTS } from "./balance/products";
import { contracts as CONTRACTS } from "./balance/contracts";
import { legacyTree as LEGACY } from "./balance/legacyTree";
import { reputation as REPUTATION } from "./balance/reputation";
import { trials as TRIALS } from "./balance/trials";
import { paradigms as PARADIGMS } from "./balance/paradigms";
import { doctrine as DOCTRINE } from "./balance/doctrine";
import { institute as INSTITUTE } from "./balance/institute";
import { charters as CHARTERS } from "./balance/charters";
import { balance } from "./balance/config";
import { components as COMPONENTS, SLOTS_BY_TIER, type SlotClass } from "./balance/components";
import { market as MARKET } from "./balance/market";
import { challenges as CHALLENGES } from "./balance/challenges";
import { objectives as OBJECTIVES } from "./balance/objectives";
import { automation as AUTOMATION } from "./balance/automation";
import { freshComponents } from "./components";
import type { ChallengeState } from "./types";
import type { ActiveModifier, ComponentsState, DraftModel, Employee, GameState, LifetimeStats, ModifierTarget, ProductsState, ProductState, UpgradeState } from "./types";

const MODIFIER_TARGETS: ModifierTarget[] = ["computeMult", "dataMult", "moneyMult"];
const PRODUCT_TYPE_IDS = PRODUCTS.types.map((t) => t.id);

// Known-id sets for the meta-progression collections (round-2 hardening). A save is
// editable text, so these arrays must hold KNOWN ids, EXACTLY ONCE — otherwise a
// hand-edited dupe (e.g. contracts.completed) inflates a permanent meta-currency.
const CONTRACT_IDS = new Set(CONTRACTS.pool.map((c) => c.id));
const OBJECTIVE_IDS = new Set(OBJECTIVES.pool.map((o) => o.id));
const LEGACY_IDS = new Set(LEGACY.perks.map((p) => p.id));
const REP_PERK_COST = new Map(REPUTATION.perks.map((p) => [p.id, p.cost]));
const CHARTER_IDS = new Set(CHARTERS.list.map((c) => c.id));
const RIVAL_NAMES = new Set(MARKET.rivals.map((r) => r.name));
const RESEARCH_IDS = new Set(balance.research.map((r) => r.id));
const DIRECTIVE_IDS = new Set(REPUTATION.endowment.directives.defs.map((d) => d.id));
const TRIAL_IDS = new Set(TRIALS.list.map((t) => t.id));
const PARADIGM_IDS = new Set(PARADIGMS.list.map((p) => p.id));
const PARADIGM_COST = new Map(PARADIGMS.list.map((p) => [p.id, p.cost]));
const DOCTRINE_IDS = new Set(DOCTRINE.perks.map((p) => p.id));
// Staff identity is also known-id data: an unknown role renders raw and an unknown
// trait (e.g. a crafted "mentor" on every person) would silently boost morale math.
const ROLE_IDS = new Set(balance.staff.roles.map((r) => r.id));
const TRAIT_IDS = new Set(balance.staff.traits.map((t) => t.id));
const INSTITUTE_IDS = new Set(INSTITUTE.perks.map((p) => p.id));

/** Keep only known ids, each at most once (order preserved). Closes the duplicate /
 *  unknown-id save-edit class for contracts / legacy investments / reputation perks. */
function dedupeKnownIds(arr: unknown, known: Set<string>): string[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (typeof x === "string" && known.has(x) && !seen.has(x)) { seen.add(x); out.push(x); }
  }
  return out;
}

/** Endowment Directives sanitizer: a MULTISET (duplicates allowed to stack a lane),
 *  so it keeps known ids in order WITHOUT deduping — but caps the length to the number
 *  of tiers `repEndowment` has actually earned, so a crafted save can't grant more lane
 *  biases than levels were bought. */
function sanitizeDirectives(arr: unknown, repEndowment: number): string[] {
  if (!Array.isArray(arr)) return [];
  const maxTiers = Math.floor(Math.max(0, repEndowment) / REPUTATION.endowment.directives.interval);
  const out: string[] = [];
  for (const x of arr) {
    if (out.length >= maxTiers) break;
    if (typeof x === "string" && DIRECTIVE_IDS.has(x)) out.push(x);
  }
  return out;
}

// ---- Untrusted-input hardening (a save is editable text the player can paste back
//      via the backup feature). Every numeric field below is clamped to a FINITE,
//      in-range value so a hand-edited / corrupt / migrated save can never produce
//      NaN/Infinity/negative that propagates into the economy or bricks the run. ----

/** Matches a plain non-negative decimal/scientific number string (no NaN/Infinity/sign). */
const NUM_RE = /^\d+(\.\d+)?(e\+?\d+)?$/i;

/** Build a Big from untrusted input, rejecting NaN/Infinity/negative/garbage. A
 *  legitimately huge late-game value (e.g. "1e400") is preserved; anything that
 *  would poison the BigNumber (a NaN/Infinity Decimal) falls back. */
function safeBig(v: unknown, fallback: Big = Big.ZERO): Big {
  if (v instanceof Big) return v;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Big.of(v) : fallback;
  if (typeof v === "string" && NUM_RE.test(v.trim())) {
    // NUM_RE admits an arbitrarily large exponent (e.g. "1e9000000000000000") that
    // constructs an INFINITY Big past break_infinity's limit — reject those so a
    // non-finite value never enters money/lifetime/legacy math.
    const b = Big.of(v.trim());
    return b.isFinite() ? b : fallback;
  }
  return fallback;
}

/** Clamp an untrusted number into [min,max], falling back when non-finite. */
function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

/** A non-negative finite integer (rack counts, ships, …); else the fallback. */
function safeCount(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/** Owned-count ceiling for an uncapped (max: Infinity) upgrade — e.g. racks. Far beyond
 *  any legit save (hall floor capacity already bounds racks), but low enough that
 *  count × per-level effect can never overflow Compute to Infinity (which then underflows
 *  to NaN via Infinity−Infinity). Guards against a save cheated to 1e308 racks. */
const MAX_UPGRADE_COUNT = 1e7;
/** Per-upgrade caps, so a tampered save can't exceed a capped upgrade (e.g. a ×25 booster
 *  claimed 1000 times). Only balance.upgrades have real caps; other keys in the map
 *  (office perks, etc.) fall back to the global ceiling. */
const UPGRADE_MAX = new Map(balance.upgrades.map((u) => [u.id, u.max] as const));

/** The upgrades map is fully untrusted (it drives derive directly). Keep only string keys →
 *  finite positive integer counts, each CLAMPED to its upgrade's max (or the global ceiling
 *  for uncapped/unknown keys); drop `__proto__` & garbage. Enforces caps on load so a cheated
 *  or corrupt count can neither exceed a cap nor overflow the economy to Infinity. */
function sanitizeUpgrades(u: unknown): Record<string, number> {
  if (!u || typeof u !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(u as Record<string, unknown>).slice(0, MAX_SAVED_IDS)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      const max = UPGRADE_MAX.get(k);
      const cap = max !== undefined && Number.isFinite(max) ? max : MAX_UPGRADE_COUNT;
      out[k] = Math.min(Math.floor(v), cap);
    }
  }
  return out;
}

/** Generous finite ceilings — high enough never to bind on a legit save, low enough
 *  that the economy math (arpu = baseArpu·price·quality, mrr = paid·arpu, …) can't
 *  overflow to Infinity (which then underflows to NaN via Infinity−Infinity). */
const PROD_CAPS = { quality: 1e12, mau: 1e15, buzzSec: 86_400, ageSec: 1e9, version: 1000, frontier: 1e12 };

/** Validate a single product entry. A corrupt/old entry with a missing or
 *  non-finite numeric (or a zero priceMult → div-by-zero in convRate) would feed
 *  NaN straight into simulateProducts → money, so drop it on load. */
function isWellFormedProduct(p: unknown): p is ProductState {
  const o = p as Partial<ProductState> | null;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.type === "string" &&
    (PRODUCT_TYPE_IDS as string[]).includes(o.type) &&
    [o.version, o.quality, o.priceMult, o.marketingPerSec, o.mau, o.paid, o.buzzSec].every(
      (n) => typeof n === "number" && Number.isFinite(n),
    ) &&
    // No negative counts/quality (would stick qf at 0 / break versionCost), and
    // a positive priceMult (0 divides by zero in convRate).
    o.priceMult! > 0 &&
    o.version! >= 1 &&
    o.quality! >= 0 &&
    o.marketingPerSec! >= 0 &&
    o.mau! >= 0 &&
    o.paid! >= 0 &&
    o.buzzSec! >= 0
  );
}

/** An in-flight upgrade is untrusted: a NaN remaining would freeze the bar or feed
 *  NaN into the resource drain. Drop a malformed one (the product just keeps its
 *  current version) rather than crash. */
function sanitizeUpgrade(u: unknown): UpgradeState | null {
  const o = u as Partial<UpgradeState> | null;
  if (!o || typeof o !== "object") return null;
  const nums = [o.targetVersion, o.remainingCompute, o.remainingData, o.remainingSec, o.totalSec];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if (o.targetVersion! < 2 || o.remainingSec! < 0 || o.totalSec! <= 0) return null;
  if (o.remainingCompute! < 0 || o.remainingData! < 0) return null;
  return {
    // Clamp to the same ceiling as a product's base version (see loadedProducts), so a
    // crafted mid-flight upgrade can't push a product to an arbitrary version on completion.
    targetVersion: Math.min(1000, o.targetVersion!),
    remainingCompute: o.remainingCompute!,
    remainingData: o.remainingData!,
    remainingSec: o.remainingSec!,
    totalSec: o.totalSec!,
  };
}

/** Channel-mix weights are untrusted; keep finite ≥0 weights for KNOWN channels
 *  only (drop stray keys), default {ads:1}. */
const CHANNEL_IDS = new Set(PRODUCTS.channels.map((c) => c.id));
function sanitizeChannelMix(m: unknown): Record<string, number> {
  if (!m || typeof m !== "object") return { ads: 1 };
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (CHANNEL_IDS.has(k) && typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return Object.keys(out).length ? out : { ads: 1 };
}

/**
 * Hard ceilings on how many entries a LOADED collection may contain.
 *
 * Every entry is already validated one-by-one, but without a length cap a pasted save
 * can still brick the install: per-tick cost is linear in portfolio/roster size, so a
 * few thousand well-formed products push one tick past the tick interval, and the next
 * autosave writes the bloat straight back — every future launch is dead on arrival and
 * hard reset is the only escape. `modifiers` already had a cap for exactly this reason
 * (MAX_ACTIVE_MODIFIERS / the 20-entry slice); these generalise it to the rest.
 *
 * All are far above any reachable legit value (portfolio caps out around 5 slots, a
 * roster in the dozens, ~52 achievements, ~21 upgrade ids), so honest saves never
 * notice — only crafted ones are truncated.
 */
const MAX_SAVED_PRODUCTS = 64;
const MAX_SAVED_EMPLOYEES = 512;
const MAX_SAVED_IDS = 512;

/** Drafts are untrusted; keep only well-formed entries. Quality is clamped to the
 *  same product cap loaded products get — an unclamped draft launches into a live
 *  product whose economics (mrr/serve) compute from quality, so a crafted 1e300
 *  would brick that product at ∞/NaN forever (launchDraft bypasses PROD_CAPS). */
function sanitizeDrafts(d: unknown): DraftModel[] {
  if (!Array.isArray(d)) return [];
  return d
    .slice(0, PRODUCTS.maxDrafts)
    .filter(
      (x): x is DraftModel =>
        !!x &&
        typeof x.id === "string" &&
        typeof x.quality === "number" && Number.isFinite(x.quality) && x.quality >= 0 &&
        typeof x.ships === "number" && Number.isFinite(x.ships),
    )
    .map((x) => ({ id: x.id, quality: Math.min(x.quality, PROD_CAPS.quality), ships: x.ships }));
}

/** Loaded products are untrusted; guard the container SHAPE here only. Entries
 *  are filtered per-product at load (isWellFormedProduct), so one corrupt product
 *  drops alone instead of wiping the whole portfolio (drafts, sold, milestones,
 *  frontier) back to fresh — same per-entry policy as employees/drafts. */
function isWellFormedProducts(p: unknown): p is ProductsState {
  const o = p as Partial<ProductsState> | null;
  return (
    !!o &&
    Array.isArray(o.active) &&
    typeof o.frontier === "number" &&
    Number.isFinite(o.frontier)
  );
}

/** Employees are untrusted; keep only well-formed people, sanitizing training.
 *  Level clamps to the SAME max the runtime trainer enforces (levelEffectMult is
 *  linear and uncapped, so a crafted 1e9 would mint a 1e9× staff multiplier);
 *  roleId/trait must be KNOWN ids (an unknown role renders raw; an unknown trait
 *  could smuggle morale effects past the balance data); ids dedupe keep-first so
 *  fire/assign/train targeting and React keys stay well-defined. */
function sanitizeEmployees(e: unknown): Employee[] {
  if (!Array.isArray(e)) return [];
  const seen = new Set<string>();
  const out: Employee[] = [];
  for (const x of e) {
    // Bound the roster: entries are validated one-by-one below, but an unbounded
    // COUNT of well-formed people is still linear per-tick cost (see MAX_SAVED_*).
    if (out.length >= MAX_SAVED_EMPLOYEES) break;
    if (
      !x || typeof x.id !== "string" || typeof x.name !== "string" ||
      typeof x.roleId !== "string" || !ROLE_IDS.has(x.roleId) ||
      typeof x.level !== "number" || !Number.isFinite(x.level) || x.level < 1
    ) continue;
    if (seen.has(x.id)) continue; // duplicate id → keep the first occurrence
    seen.add(x.id);
    out.push({
      id: x.id,
      name: x.name,
      roleId: x.roleId,
      level: Math.min(balance.staff.maxLevel, Math.max(1, Math.floor(x.level))),
      trait: typeof x.trait === "string" && TRAIT_IDS.has(x.trait) ? x.trait : null,
      assignedProductId: typeof x.assignedProductId === "string" ? x.assignedProductId : null,
      training:
        x.training && typeof x.training.remainingSec === "number" && Number.isFinite(x.training.remainingSec) &&
        typeof x.training.totalSec === "number" && Number.isFinite(x.training.totalSec) && x.training.totalSec > 0 &&
        x.training.remainingSec > 0
          ? { remainingSec: x.training.remainingSec, totalSec: x.training.totalSec }
          : null,
    });
  }
  return out;
}

/** Lifetime stats are untrusted: coerce each field, default a zeroed stat block. */
function sanitizeStats(s: unknown): LifetimeStats {
  const d = initialStats();
  if (!s || typeof s !== "object") return d;
  const o = s as Record<string, unknown>;
  // Use safeBig so a save-edited "NaN"/"Infinity"/negative stat can't sneak a NaN Big
  // through (try/catch missed it — Big.of("NaN") doesn't throw, it returns a NaN Big).
  const numf = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  // Discrete progression COUNTS (some feed the permanent Reputation currency) get a
  // generous finite ceiling so a save-edited 1e9 can't mint unbounded Reputation/badges.
  const countf = (v: unknown): number => Math.floor(Math.min(numf(v), 1e9));
  return {
    totalMoney: safeBig(o.totalMoney, d.totalMoney),
    peakComputePerSec: safeBig(o.peakComputePerSec, d.peakComputePerSec),
    totalLegacy: safeBig(o.totalLegacy, d.totalLegacy),
    peakMrr: numf(o.peakMrr),
    peakMau: numf(o.peakMau),
    peakResearchCount: countf(o.peakResearchCount),
    totalShips: countf(o.totalShips),
    productsLaunched: countf(o.productsLaunched),
    employeesHired: countf(o.employeesHired),
    worldEventsResolved: countf(o.worldEventsResolved),
    playtimeSec: numf(o.playtimeSec),
    ascensions: countf(o.ascensions),
    openSourceShips: countf(o.openSourceShips),
    safetyShips: countf(o.safetyShips), // old saves → 0 (sanitizer-defaulted; no version bump needed)
    bestRivalsBeaten: countf(o.bestRivalsBeaten), // old saves → 0 (best-so-far starts low and only climbs)
    stakesRepEarned: countf(o.stakesRepEarned), // old saves → 0 (Frontier Race stakes are opt-in)
  };
}

/** Loaded saves are untrusted input: a NaN heat or malformed modifier would
 * flow straight into tick()/derive() and poison or crash the run. Validate. */
function isWellFormedModifier(m: unknown): m is ActiveModifier {
  const mod = m as Partial<ActiveModifier>;
  return (
    !!mod &&
    typeof mod.id === "string" &&
    MODIFIER_TARGETS.includes(mod.target as ModifierTarget) &&
    typeof mod.factor === "number" &&
    Number.isFinite(mod.factor) &&
    typeof mod.remainingSec === "number" &&
    Number.isFinite(mod.remainingSec) &&
    mod.remainingSec > 0 &&
    typeof mod.label === "string" &&
    (mod.tone === "good" || mod.tone === "bad")
  );
}

/**
 * Versioned save/load. Big values serialize to strings (Big.toJSON) so saves are
 * plain JSON and survive precision. Migration exists from day one (CLAUDE.md):
 * even with a stub, the pattern is in place before we need it.
 */

interface SavedShape {
  version: number;
  resources: { compute: string; data: string; money: string };
  upgrades: Record<string, number>;
  research: string[];
  run: GameState["run"];
  prestige: { legacyWeights: string; ships: number };
  lifetimeMoney: string;
  heat: number;
  suspicion: number;
  modifiers: ActiveModifier[];
  alignment: number;
  computeFocus: number;
  products: ProductsState;
  employees: Employee[];
  /** Serialized lifetime stats (Big fields as strings). */
  stats: Record<string, string | number>;
  achievements: string[];
  reputation: { spent: number; perks: string[] };
  /** Endgame Reputation Endowment level. Sanitizer-defaulted (0) + migrated at v20. */
  repEndowment: number;
  /** Endowment Directives: chosen lane-doctrine ids. Sanitized (known ids, capped to
   *  the tiers repEndowment has earned) + migrated at v24. */
  endowmentDirectives: string[];
  /** Prestige Trials: the active Trial id (or null) + completed ids. Sanitized to
   *  known ids + migrated at v25. */
  activeTrial: string | null;
  trialsDone: string[];
  /** Paradigm Research — owned node ids (Reputation cost reconciled into spent). v29. */
  paradigms: string[];
  /** Doctrine Consequences — claimed stance-perk ids (known-id filtered). v30. */
  doctrines: string[];
  /** The Institute — owned wing ids (known-id filtered; Grants derive from ascensions). v31. */
  institute: string[];
  /** Institute Fellowships — endowed chairs, reconciled against leftover Grants. v32. */
  instituteFellowships: number;
  /** Flagship: designated product id (or null) + cross-ship tenure. Migrated at v27. */
  flagship: { productId: string | null; tenure: number };
  contracts: { completed: string[] };
  charter: string | null;
  charterLocked: boolean;
  lastCharter: string | null;
  /** Charter conviction streak (consecutive same-charter ships). v32. */
  charterStreak: number;
  /** Frontier Race stake: the rival name wagered against, or null. v32. */
  rivalStake: string | null;
  /** Endowment Directive respecs bought (drives the escalating fee). v32. */
  endowmentRespecs: number;
  legacyInvestments: string[];
  components: ComponentsState;
  rivalOps: GameState["rivalOps"];
  /** IDEAS #6 — Legacy Wall records. Sanitizer-defaulted ([]), so no v-bump. */
  shipLog: GameState["shipLog"];
  /** IDEAS #9 — today's rolled sponsor objective. Sanitizer-defaulted (null). */
  sponsor: GameState["sponsor"];
  /** IDEAS #10 — preprints published this run. Sanitizer-defaulted (0). */
  preprints: number;
  /** Grand Challenges — funded amounts (Big → strings) + completed ids. Migrated at v21. */
  challenges: {
    funded: Record<string, { compute: string; data: string; money: string }>;
    completed: string[];
    /** Chosen fork arm per completed forked challenge. Migrated at v26. */
    forks: Record<string, string>;
  };
  /** Megaprojects II — cycles completed + current-cycle funding (Big → strings). v28. */
  megaprojects: { level: number; funded: { compute: string; data: string; money: string } };
  /** Lab Objectives — claimed objective ids. Migrated at v22. */
  objectives: { completed: string[] };
  /** Automation — which autopilots are switched on. Migrated at v23. */
  automation: Record<string, boolean>;
}

export function serialize(state: GameState): string {
  const shape: SavedShape = {
    version: SAVE_VERSION,
    resources: {
      compute: state.resources.compute.toJSON(),
      data: state.resources.data.toJSON(),
      money: state.resources.money.toJSON(),
    },
    upgrades: state.upgrades,
    research: state.research,
    run: state.run,
    prestige: {
      legacyWeights: state.prestige.legacyWeights.toJSON(),
      ships: state.prestige.ships,
    },
    lifetimeMoney: state.lifetimeMoney.toJSON(),
    heat: state.heat,
    suspicion: state.suspicion,
    modifiers: state.modifiers,
    alignment: state.alignment,
    computeFocus: state.computeFocus,
    products: state.products,
    employees: state.employees,
    stats: {
      totalMoney: state.stats.totalMoney.toJSON(),
      peakComputePerSec: state.stats.peakComputePerSec.toJSON(),
      totalLegacy: state.stats.totalLegacy.toJSON(),
      peakMrr: state.stats.peakMrr,
      peakMau: state.stats.peakMau,
      peakResearchCount: state.stats.peakResearchCount,
      totalShips: state.stats.totalShips,
      productsLaunched: state.stats.productsLaunched,
      employeesHired: state.stats.employeesHired,
      worldEventsResolved: state.stats.worldEventsResolved,
      playtimeSec: state.stats.playtimeSec,
      ascensions: state.stats.ascensions,
      openSourceShips: state.stats.openSourceShips,
      safetyShips: state.stats.safetyShips,
      bestRivalsBeaten: state.stats.bestRivalsBeaten,
      stakesRepEarned: state.stats.stakesRepEarned,
    },
    achievements: state.achievements,
    reputation: state.reputation,
    repEndowment: state.repEndowment,
    endowmentDirectives: state.endowmentDirectives,
    activeTrial: state.activeTrial,
    trialsDone: state.trialsDone,
    paradigms: state.paradigms,
    doctrines: state.doctrines,
    institute: state.institute,
    instituteFellowships: state.instituteFellowships,
    flagship: state.flagship,
    contracts: state.contracts,
    charter: state.charter,
    charterLocked: state.charterLocked,
    lastCharter: state.lastCharter,
    charterStreak: state.charterStreak,
    rivalStake: state.rivalStake,
    endowmentRespecs: state.endowmentRespecs,
    legacyInvestments: state.legacyInvestments,
    components: state.components,
    rivalOps: state.rivalOps,
    shipLog: state.shipLog,
    sponsor: state.sponsor,
    preprints: state.preprints,
    challenges: {
      funded: Object.fromEntries(
        Object.entries(state.challenges.funded).map(([id, f]) => [
          id,
          { compute: f.compute.toJSON(), data: f.data.toJSON(), money: f.money.toJSON() },
        ]),
      ),
      completed: state.challenges.completed,
      forks: state.challenges.forks,
    },
    megaprojects: {
      level: state.megaprojects.level,
      funded: {
        compute: state.megaprojects.funded.compute.toJSON(),
        data: state.megaprojects.funded.data.toJSON(),
        money: state.megaprojects.funded.money.toJSON(),
      },
    },
    objectives: state.objectives,
    automation: state.automation,
  };
  return JSON.stringify(shape);
}

/** Automation toggles, sanitized: only KNOWN autopilot ids, only the ones set to true. */
function sanitizeAutomation(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const r = (raw ?? {}) as Record<string, unknown>;
  for (const def of AUTOMATION.list) if (r[def.id] === true) out[def.id] = true;
  return out;
}

/** Grand Challenge progress, sanitized as untrusted input. Funding is clamped per-resource
 *  to [0, cost] (safeBig rejects NaN/Infinity/negative), and `completed` is DERIVED purely
 *  from whether funding meets the cost — never trusted from the save. Since funding can't
 *  exceed cost, a challenge is "complete" iff it was actually fully funded, so a tampered
 *  save can't mint a permanent reward for less than its full price (the reputation-perk
 *  anti-cheat policy). Iterating the def list also dedupes and drops unknown ids. */
function sanitizeChallenges(raw: unknown): ChallengeState {
  const out: ChallengeState = { funded: {}, completed: [], forks: {} };
  const r = (raw ?? {}) as { funded?: Record<string, unknown>; forks?: Record<string, unknown> };
  const rawFunded = (r.funded ?? {}) as Record<string, { compute?: unknown; data?: unknown; money?: unknown }>;
  for (const def of CHALLENGES.list) {
    const f = rawFunded[def.id];
    if (!f || typeof f !== "object") continue;
    const cost = { compute: Big.of(def.cost.compute), data: Big.of(def.cost.data), money: Big.of(def.cost.money) };
    const compute = safeBig(f.compute).min(cost.compute);
    const data = safeBig(f.data).min(cost.data);
    const money = safeBig(f.money).min(cost.money);
    if (compute.gt(0) || data.gt(0) || money.gt(0)) out.funded[def.id] = { compute, data, money };
    if (compute.gte(cost.compute) && data.gte(cost.data) && money.gte(cost.money)) out.completed.push(def.id);
  }
  // Forks: a chosen arm is legitimate ONLY for a COMPLETED forked challenge and must be
  // a real arm id of that challenge (else a crafted save could pick a phantom reward).
  const rawForks = (r.forks ?? {}) as Record<string, unknown>;
  for (const def of CHALLENGES.list) {
    if (!def.forks || !out.completed.includes(def.id)) continue;
    const chosen = rawForks[def.id];
    if (typeof chosen === "string" && def.forks.some((f) => f.id === chosen)) out.forks[def.id] = chosen;
  }
  return out;
}

/** Megaprojects: a non-negative integer level, and current-cycle funding clamped to the
 *  level's cost (so a crafted save can't pre-bank a completion or over-fund). */
function sanitizeMegaprojects(raw: unknown): GameState["megaprojects"] {
  const r = (raw ?? {}) as { level?: unknown; funded?: { compute?: unknown; data?: unknown; money?: unknown } };
  const level = Math.max(0, Math.floor(Number(r.level) || 0));
  const M = CHALLENGES.megaproject;
  const g = Math.pow(M.growth, level);
  const cost = { compute: Big.of(M.baseCost.compute).mul(g), data: Big.of(M.baseCost.data).mul(g), money: Big.of(M.baseCost.money).mul(g) };
  const f = r.funded ?? {};
  return {
    level,
    funded: {
      compute: safeBig(f.compute).min(cost.compute),
      data: safeBig(f.data).min(cost.data),
      money: safeBig(f.money).min(cost.money),
    },
  };
}

export function deserialize(json: string): GameState {
  const raw = migrate(JSON.parse(json)) as Partial<SavedShape>;
  const fresh = createInitialState();
  // Default every field defensively: a true v0 save (and any partial/corrupt
  // one) may be missing whole sub-objects, so never dereference them blindly.
  const res = (raw.resources ?? {}) as Partial<SavedShape["resources"]>;
  const pres = (raw.prestige ?? {}) as Partial<SavedShape["prestige"]>;
  const heat =
    typeof raw.heat === "number" && Number.isFinite(raw.heat)
      ? Math.max(0, Math.min(100, raw.heat))
      : fresh.heat;
  const suspicion =
    typeof raw.suspicion === "number" && Number.isFinite(raw.suspicion)
      ? Math.max(0, Math.min(100, raw.suspicion))
      : fresh.suspicion;
  // Cap the persisted modifier list. tick() segments a frame recursively at each
  // modifier expiry (tick.ts), so an unbounded count from a crafted/shared save
  // overflows the stack on the next tick. Legit play never exceeds a handful (a few
  // world-event buffs + momentum/daily), so 20 is generous headroom and far below the
  // ~50 that empirically overflows. This is the one persisted collection that lacked a cap.
  const modifiers = Array.isArray(raw.modifiers)
    ? raw.modifiers.filter(isWellFormedModifier).slice(0, 20)
    : fresh.modifiers;
  const alignment =
    typeof raw.alignment === "number" && Number.isFinite(raw.alignment)
      ? Math.max(-1, Math.min(1, raw.alignment))
      : fresh.alignment;
  const computeFocus =
    typeof raw.computeFocus === "number" && Number.isFinite(raw.computeFocus)
      ? Math.max(0, Math.min(1, raw.computeFocus))
      : fresh.computeFocus;
  // Sanitize the trophy-source witnesses FIRST: components legitimacy (below)
  // is checked against these, so a crafted dupe can't smuggle a trophy in.
  const achievements = Array.isArray(raw.achievements)
    ? raw.achievements.filter((a): a is string => typeof a === "string").slice(0, MAX_SAVED_IDS)
    : [];
  const contracts = sanitizeContracts(raw.contracts);
  // Endgame Endowment level: a finite non-negative int, clamped to the safety bound so
  // a crafted value can't drive the cost-sum / boost math to Infinity. Its cost is then
  // reconciled into reputation.spent below (same anti-cheat policy as the perk tree).
  const repEndowment = Math.min(REPUTATION.endowment.maxLevel, safeCount(raw.repEndowment));
  // Paradigm Research: keep only known node ids; their Reputation cost is reconciled into
  // reputation.spent below (same anti-cheat policy as perks + the endowment).
  const paradigms = dedupeKnownIds(raw.paradigms, PARADIGM_IDS);
  const paradigmOwed = paradigms.reduce((sum, id) => sum + (PARADIGM_COST.get(id) ?? 0), 0);
  // Sanitize stats once: ascensions drives the Institute Grant budget (below) and
  // totalShips caps the ship-log — both previously recomputed sanitizeStats redundantly.
  const stats = sanitizeStats(raw.stats);
  // Wings first, then chairs out of whatever Grant budget the wings left — both
  // reconciled against ascensions, so a crafted save can't bank free permanent output.
  const instituteWings = sanitizeInstitute(raw.institute, stats.ascensions);
  const institute = {
    wings: instituteWings.wings,
    fellowships: sanitizeFellowships(raw.instituteFellowships, instituteWings.wings, instituteWings.budgetLeft),
  };
  const loadedProducts = isWellFormedProducts(raw.products) ? raw.products : fresh.products;
  // `sold` was added after v6 shipped, `drafts`/`upgrade` in v7; default them for
  // saves that predate each, and sanitize the untrusted nested shapes.
  const products: ProductsState = {
    ...loadedProducts,
    // Per-entry filter + clamp, then DEDUPE by id (keep first): two products sharing
    // an id would collide React keys and make the find()-based actions (retire /
    // upgrade / flagship) hit only the first — same known-id-once policy as research.
    active: (() => {
      const seen = new Set<string>();
      return loadedProducts.active
        // Bound the portfolio before any per-entry work: an unbounded COUNT of
        // well-formed products is a per-tick cost multiplier (see MAX_SAVED_*).
        .slice(0, MAX_SAVED_PRODUCTS)
        .filter(isWellFormedProduct)
        .map((p) => {
      const o = p as ProductState;
      // Clamp every numeric to the SAME range the runtime setters enforce, so a
      // save-edited value can't bypass the in-game clamps (out-of-range price /
      // marketing / quality were the path to overflow → NaN money).
      const quality = clampNum(o.quality, 0, PROD_CAPS.quality, 1);
      const mau = clampNum(o.mau, 0, PROD_CAPS.mau, 0);
      return {
        ...p,
        quality,
        mau,
        paid: clampNum(o.paid, 0, mau, 0), // paid can never exceed MAU (sim invariant)
        version: Math.floor(clampNum(o.version, 1, PROD_CAPS.version, 1)),
        priceMult: clampNum(o.priceMult, PRODUCTS.priceMin, PRODUCTS.priceMax, 1),
        marketingPerSec: clampNum(o.marketingPerSec, 0, quality * PRODUCTS.marketingCapPerQuality, 0),
        buzzSec: clampNum(o.buzzSec, 0, PROD_CAPS.buzzSec, 0),
        upgrade: sanitizeUpgrade(o.upgrade),
        // Dedupe features — a hand-edited save could repeat an id to stack its multiplier.
        features: Array.isArray(o.features) ? [...new Set(o.features.filter((s): s is string => typeof s === "string"))] : [],
        enterprise: o.enterprise === true,
        enterprisePrice: clampNum(o.enterprisePrice, PRODUCTS.enterprise.priceMin, PRODUCTS.enterprise.priceMax, 1),
        channelMix: sanitizeChannelMix(o.channelMix),
        // ageSec gates the retire valuation. A save that predates the field has
        // products that were already established, so treat them as fully mature
        // (a large value) rather than penalising a returning player's cash cows.
        ageSec: clampNum(o.ageSec, 0, PROD_CAPS.ageSec, 1e9),
        };
      })
        .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    })(),
    // Frontier must stay ≥ its start: a negative frontier pins every product's
    // competitiveness at 1 and zeroes staleness churn (a permanent buff exploit).
    frontier: clampNum(loadedProducts.frontier, PRODUCTS.frontierStart, PROD_CAPS.frontier, PRODUCTS.frontierStart),
    drafts: sanitizeDrafts((loadedProducts as ProductsState).drafts),
    sold: typeof loadedProducts.sold === "number" && Number.isFinite(loadedProducts.sold) && loadedProducts.sold >= 0 ? Math.floor(loadedProducts.sold) : 0,
    milestones: Array.isArray((loadedProducts as ProductsState).milestones)
      ? (loadedProducts as ProductsState).milestones.filter((m): m is string => typeof m === "string").slice(0, MAX_SAVED_IDS)
      : [],
  };
  return {
    version: SAVE_VERSION,
    resources: {
      compute: safeBig(res.compute),
      data: safeBig(res.data),
      money: safeBig(res.money),
    },
    upgrades: sanitizeUpgrades(raw.upgrades),
    // research: known node ids, each at most once. A dup (e.g. ["backprop","backprop"])
    // would inflate state.research.length, which tick() accrues into peakResearchCount
    // and any reward derived from it — so dedupe + known-id filter like contracts/perks.
    research: dedupeKnownIds(raw.research, RESEARCH_IDS),
    run: {
      active: (raw.run as GameState["run"] | undefined)?.active === true,
      progress: clampNum((raw.run as GameState["run"] | undefined)?.progress, 0, 1, 0),
      readyToClaim: (raw.run as GameState["run"] | undefined)?.readyToClaim === true,
    },
    prestige: {
      legacyWeights: safeBig(pres.legacyWeights),
      // Ceiling as well as floor: ships is submitted verbatim to the Game Center
      // leaderboard (gameCenter.ts), so an unclamped tampered value would post an absurd
      // score. 1e7 is unreachable in real play (one ship per prestige) yet caps abuse.
      ships: Math.min(safeCount(pres.ships), 10_000_000),
    },
    lifetimeMoney: safeBig(raw.lifetimeMoney ?? res.money),
    heat,
    suspicion,
    modifiers,
    alignment,
    computeFocus,
    products,
    employees: sanitizeEmployees(raw.employees),
    stats,
    achievements,
    reputation: sanitizeReputation(raw.reputation, repEndowment, paradigmOwed),
    repEndowment,
    paradigms,
    doctrines: dedupeKnownIds(raw.doctrines, DOCTRINE_IDS),
    // The Institute grants PERMANENT multipliers, so — like reputation/paradigms/
    // challenges — its owned wings must reconcile against their earning source (Grants
    // minted by ascensions), not just be known-id filtered. Otherwise a crafted save
    // with every wing and 0 ascensions banks a free ×7 to all output.
    institute: institute.wings,
    instituteFellowships: institute.fellowships,
    endowmentDirectives: sanitizeDirectives(raw.endowmentDirectives, repEndowment),
    // Prestige Trials: the active id must be a known Trial (else no active run), and
    // completed ids are filtered to known, deduped (the reward folds per unique id).
    activeTrial: typeof raw.activeTrial === "string" && TRIAL_IDS.has(raw.activeTrial) ? raw.activeTrial : null,
    trialsDone: dedupeKnownIds(raw.trialsDone, TRIAL_IDS),
    // Flagship: the id must point at a real (sanitized) active product, else it's
    // cleared; tenure is clamped to [0, cap] so a crafted save can't over-brand.
    flagship: (() => {
      const rf = raw.flagship as { productId?: unknown; tenure?: unknown } | undefined;
      const id = typeof rf?.productId === "string" && products.active.some((p) => p.id === rf.productId) ? rf.productId : null;
      const tenure = id ? clampNum(rf?.tenure, 0, PRODUCTS.flagship.capShips, 0) : 0;
      return { productId: id, tenure: Math.floor(tenure) };
    })(),
    contracts,
    // Validate against KNOWN charter ids: an unknown/crafted id would still grant the
    // +15% conviction bonus (charter === lastCharter) without a real two-run commitment.
    charter: typeof raw.charter === "string" && CHARTER_IDS.has(raw.charter) ? raw.charter : null,
    charterLocked: raw.charterLocked === true,
    lastCharter: typeof raw.lastCharter === "string" && CHARTER_IDS.has(raw.lastCharter) ? raw.lastCharter : null,
    // Charter conviction streak: a bounded count (drives the ×1.15→×1.40 ladder).
    // A crafted streak without a matching charter history just means a bigger bonus
    // on the NEXT same-charter ship — bounded by the ladder cap, so harmless.
    charterStreak: Math.max(0, Math.min(1000, safeCount(raw.charterStreak))),
    // Frontier Race stake: only a KNOWN rival name survives; anything else → null.
    rivalStake: typeof raw.rivalStake === "string" && RIVAL_NAMES.has(raw.rivalStake) ? raw.rivalStake : null,
    // Endowment Directive respec count (drives the escalating fee): bounded count.
    endowmentRespecs: Math.max(0, Math.min(10_000, safeCount(raw.endowmentRespecs))),
    // KNOWN legacy-perk ids, deduped — a dupe would apply the lane bias twice for free
    // (legacyTreeMods sums per entry and never checks prereqs on load).
    legacyInvestments: dedupeKnownIds(raw.legacyInvestments, LEGACY_IDS),
    components: sanitizeComponents(raw.components, contracts.completed, achievements),
    rivalOps: sanitizeRivalOps(raw.rivalOps),
    // Legacy Wall records are display-only history, but still validated per-entry
    // (sanitizer policy: filter, don't wipe) and capped like prestige() caps them.
    shipLog: sanitizeShipLog(raw.shipLog, stats.totalShips),
    sponsor: sanitizeSponsor(raw.sponsor),
    // Preprints multiply into derive, so the count is clamped to the per-run cap.
    preprints: Math.min(balance.preprints.maxPerRun, safeCount(raw.preprints)),
    // Grand Challenge rewards are permanent multipliers, so anti-cheat like reputation:
    // funding is clamped to each cost, and a challenge is only "completed" if it is
    // actually fully funded (a tampered `completed` without funding grants nothing).
    challenges: sanitizeChallenges(raw.challenges),
    megaprojects: sanitizeMegaprojects(raw.megaprojects),
    // Lab Objectives: claimed ids only (rewards were applied at claim time, never re-derived
    // from state, so a tampered list just skips objectives — known-id/dedupe is enough).
    objectives: { completed: dedupeKnownIds((raw.objectives as { completed?: unknown } | undefined)?.completed, OBJECTIVE_IDS) },
    // Automation toggles — known ids only. (Whether an autopilot actually runs is re-checked
    // against its ship-count unlock every tick, so a toggled-on-but-locked entry does nothing.)
    automation: sanitizeAutomation(raw.automation),
    // Generation-scoped (not persisted): a mid-run reload simply re-accrues the run
    // peaks, and the ship report is transient — both start fresh on load.
    runPeakCompute: fresh.runPeakCompute,
    runPeakMrr: fresh.runPeakMrr,
    lastShipReport: fresh.lastShipReport,
  };
}

/** Legacy Wall records: per-entry validation (mode must be a known ship mode,
 *  era a small int), capped at the balance limit AND at the lifetime ship count —
 *  a crafted save can't display a wall of ascensions it never earned. */
function sanitizeShipLog(raw: unknown, totalShips: number): GameState["shipLog"] {
  if (!Array.isArray(raw)) return [];
  const MODES = new Set(Object.keys(balance.prestige.shipModes));
  return raw
    .filter((e): e is { mode: string; era: number; asc: boolean } =>
      !!e && typeof e === "object" &&
      typeof (e as { mode?: unknown }).mode === "string" && MODES.has((e as { mode: string }).mode) &&
      typeof (e as { era?: unknown }).era === "number" && Number.isFinite((e as { era: number }).era))
    .map((e) => ({ mode: e.mode, era: Math.max(0, Math.min(5, Math.floor(e.era))), asc: e.asc === true }))
    .slice(-Math.min(balance.prestige.shipLogCap, Math.max(0, totalShips)));
}

/** Rival counterplay is untrusted: KNOWN rival names only, strike counts clamped
 *  to the per-run max (a crafted save could otherwise zero every rival), and the
 *  cooldown stamp bounded so it can't push the next blitz into next century. */
function sanitizeRivalOps(r: unknown): GameState["rivalOps"] {
  const o = (r ?? {}) as Partial<GameState["rivalOps"]>;
  const strikes: Record<string, number> = {};
  if (o.strikes && typeof o.strikes === "object") {
    for (const [name, n] of Object.entries(o.strikes)) {
      if (name === "__proto__" || !RIVAL_NAMES.has(name)) continue;
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) continue;
      strikes[name] = Math.min(MARKET.counterplay.maxStrikesPerRival, Math.floor(n));
    }
  }
  const last = o.lastStrikeSec;
  const lastStrikeSec = typeof last === "number" && Number.isFinite(last) && last >= 0 ? last : null;
  return { strikes, lastStrikeSec };
}

/** Contracts are untrusted: KNOWN completed-contract ids, each at most once — a
 *  duplicate id would re-count its Reputation reward without bound (the load path
 *  bypasses claimContract's includes-check). */
function sanitizeContracts(c: unknown): { completed: string[] } {
  const o = (c ?? {}) as { completed?: unknown };
  const known = dedupeKnownIds(o.completed, CONTRACT_IDS);
  // Sponsor completions (IDEAS #9, `sponsor_<dayNumber>`) are legitimately
  // open-ended ids: keep each VALID one once, bounded so a crafted save can't
  // mint unbounded Reputation from fabricated dates.
  const seen = new Set<string>();
  const sponsors: string[] = [];
  if (Array.isArray(o.completed)) {
    for (const x of o.completed) {
      if (typeof x === "string" && /^sponsor_\d{1,7}$/.test(x) && !seen.has(x)) {
        seen.add(x);
        sponsors.push(x);
      }
    }
  }
  return { completed: [...known, ...sponsors.slice(-CONTRACTS.sponsor.maxCompleted)] };
}

/** Today's sponsor objective (IDEAS #9): validate every field or drop to null —
 *  a fresh one re-rolls next check, so dropping is always safe. */
const SPONSOR_METRICS = new Set(CONTRACTS.sponsor.lanes.map((l) => l.metric as string));
function sanitizeSponsor(s: unknown): GameState["sponsor"] {
  const o = s as Partial<NonNullable<GameState["sponsor"]>> | null;
  if (!o || typeof o !== "object") return null;
  if (typeof o.dayKey !== "number" || !Number.isFinite(o.dayKey) || o.dayKey < 0) return null;
  if (typeof o.metric !== "string" || !SPONSOR_METRICS.has(o.metric)) return null;
  if (typeof o.target !== "number" || !Number.isFinite(o.target) || o.target <= 0) return null;
  if (typeof o.title !== "string" || typeof o.desc !== "string") return null;
  return {
    dayKey: Math.floor(o.dayKey),
    metric: o.metric,
    target: o.target,
    // Rep is NOT trusted from the save — it's the balance constant.
    rep: CONTRACTS.sponsor.rep,
    title: o.title,
    desc: o.desc,
  };
}

/** Rig Bay components are untrusted: keep KNOWN ids with sane integer counts, and
 *  a loadout whose every slot holds a class-matching, actually-owned id — equips
 *  beyond the owned copy count are dropped (a crafted save can't run one GPU in
 *  three tiers), per-entry like every other sanitizer here. */
const COMPONENT_BY_ID = new Map(COMPONENTS.catalog.map((d) => [d.id, d]));
function sanitizeComponents(c: unknown, completedContracts: string[], achievements: string[]): ComponentsState {
  const out = freshComponents();
  const o = c as Partial<ComponentsState> | null;
  if (!o || typeof o !== "object") return out;
  if (o.owned && typeof o.owned === "object") {
    for (const [id, n] of Object.entries(o.owned)) {
      if (id === "__proto__" || !COMPONENT_BY_ID.has(id)) continue;
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) continue;
      // Trophy parts are only legitimate when their source milestone is complete
      // (a crafted save could otherwise own top-shelf hardware forever — the
      // sibling sanitizers all reconcile against their earning source). Dropping
      // is safe: a legitimately-earned trophy is re-granted next tick.
      const earned = COMPONENT_BY_ID.get(id)!.earnedBy;
      if (earned && !(earned.kind === "contract" ? completedContracts.includes(earned.id) : achievements.includes(earned.id))) continue;
      out.owned[id] = Math.min(COMPONENTS.maxCopies, Math.floor(n));
    }
  }
  if (Array.isArray(o.loadout)) {
    const used: Record<string, number> = {};
    for (let tier = 0; tier < SLOTS_BY_TIER.length; tier++) {
      const slots = (o.loadout[tier] ?? {}) as Partial<Record<SlotClass, unknown>>;
      for (const slot of SLOTS_BY_TIER[tier]!) {
        const id = slots[slot];
        if (typeof id !== "string") continue;
        const def = COMPONENT_BY_ID.get(id);
        if (!def || def.class !== slot) continue;
        if ((used[id] ?? 0) >= (out.owned[id] ?? 0)) continue; // no free copy
        used[id] = (used[id] ?? 0) + 1;
        out.loadout[tier]![slot] = id;
      }
    }
  }
  return out;
}

/** Total Reputation owed for a given Endowment level (Σ escalating costs) — computed
 *  inline from the balance constants (no engine import → no cycle) so a crafted
 *  repEndowment forces a matching `spent`, the same policy as the perk tree. */
function endowmentOwed(level: number): number {
  const E = REPUTATION.endowment;
  const n = Math.max(0, Math.min(E.maxLevel, Math.floor(level)));
  let sum = 0;
  for (let k = 0; k < n; k++) sum += Math.ceil(E.baseCost * Math.pow(E.growth, k));
  return sum;
}

/** Reputation is untrusted: KNOWN perk ids (deduped), and `spent` reconciled so it's
 *  at least the cost of the perks you own PLUS the Endowment levels you claim — a save
 *  can't grant owned perks or endowment levels for free (under-reported spent). */
function sanitizeReputation(r: unknown, endowmentLevel = 0, paradigmOwed = 0): { spent: number; perks: string[] } {
  const o = (r ?? {}) as { spent?: unknown; perks?: unknown };
  const perks = dedupeKnownIds(o.perks, new Set(REP_PERK_COST.keys()));
  const owedForOwned =
    perks.reduce((sum, id) => sum + (REP_PERK_COST.get(id) ?? 0), 0) + endowmentOwed(endowmentLevel) + paradigmOwed;
  const loadedSpent = typeof o.spent === "number" && Number.isFinite(o.spent) && o.spent >= 0 ? o.spent : 0;
  return { spent: Math.max(loadedSpent, owedForOwned), perks };
}

/** The Institute is untrusted. Unlike reputation/paradigms — whose currency is a shared
 *  pool reconciled via `spent` — Grants ONLY buy wings, so charging a spent counter would
 *  do nothing; the wings themselves must be dropped if unaffordable. Keep only the subset
 *  the player's ascension-minted Grants could actually have founded: walk the perks in
 *  definition order (prereqs point backward), greedily spending a running Grant budget,
 *  and drop any wing that's over-budget or has a dropped prerequisite. "Filter, don't
 *  wipe": a legitimate owner keeps everything; a crafted all-wings/0-ascension save keeps
 *  nothing. */
function sanitizeInstitute(raw: unknown, ascensions: number): { wings: string[]; budgetLeft: number } {
  let budget = Math.max(0, Math.floor(ascensions)) * INSTITUTE.grantsPerAscension;
  const claimed = new Set(dedupeKnownIds(raw, INSTITUTE_IDS));
  if (claimed.size === 0) return { wings: [], budgetLeft: budget };
  const kept: string[] = [];
  const keptSet = new Set<string>();
  for (const p of INSTITUTE.perks) {
    if (!claimed.has(p.id)) continue;
    if (p.requires && !keptSet.has(p.requires)) continue; // prerequisite was dropped → drop this too
    if (budget < p.cost) continue; // over the Grant budget → not legitimately foundable
    budget -= p.cost;
    kept.push(p.id);
    keptSet.add(p.id);
  }
  return { wings: kept, budgetLeft: budget };
}

/**
 * Endowed Fellowship chairs, reconciled against the Grants actually left after the
 * wings are paid for. Same anti-cheat policy as the perk tree / Endowment / wings: a
 * crafted count is clamped to what the player's ascensions could legitimately fund,
 * and chairs are unreachable at all until every wing is founded.
 */
function sanitizeFellowships(raw: unknown, wings: string[], budgetLeft: number): number {
  const claimed = safeCount(raw);
  if (claimed <= 0) return 0;
  if (!INSTITUTE.fellowships.enabled) return 0;
  // Gate: every wing founded. A save claiming chairs without the full tree is bogus.
  if (!INSTITUTE.perks.every((p) => wings.includes(p.id))) return 0;
  const { baseCost, growth, maxLevel } = INSTITUTE.fellowships;
  let budget = budgetLeft;
  let n = 0;
  while (n < Math.min(claimed, maxLevel)) {
    const cost = Math.ceil(baseCost * Math.pow(growth, n));
    if (budget < cost) break;
    budget -= cost;
    n += 1;
  }
  return n;
}

/**
 * Bring any older save up to the current shape. Each version bump appends a
 * step here. v0 (pre-versioning) → v1 is the seed pattern.
 */
export function migrate(raw: any): SavedShape {
  // The migration chain is a series of `if (s.version === N)` steps, so both of these
  // had to be normalised BEFORE it runs:
  //
  // 1. A non-object top level. `JSON.parse("null")` is `null`, and reading `.version`
  //    off it threw — and a throw is the ONE true wipe path in the app (the store
  //    catches it, stashes the bytes and starts fresh). "Filter, don't wipe" means a
  //    save this trivially malformed must degrade to an empty object, not a wipe.
  // 2. A version that matches no branch — `null`, `"7"` (string), `3.5`, `-5`, `NaN`.
  //    Those slipped through the entire chain untouched and were then stamped as
  //    current on the next serialize, silently skipping every migration. A string
  //    `"7"` in particular kept a key that v7→v8 exists to drop, forever.
  let s: any = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  if (!Number.isInteger(s.version) || s.version < 0) {
    s = { ...s, version: Number.isInteger(Number(s.version)) && Number(s.version) >= 0 ? Number(s.version) : 0 };
  }
  if (s.version === undefined || s.version === 0) {
    // v0 → v1: introduce the version field and lifetimeMoney if absent.
    s = { ...s, version: 1, lifetimeMoney: s.lifetimeMoney ?? s.resources?.money ?? "0" };
  }
  if (s.version === 1) {
    // v1 → v2: introduce Regulatory Heat (starts cold).
    s = { ...s, version: 2, heat: s.heat ?? 0 };
  }
  if (s.version === 2) {
    // v2 → v3: introduce world-event modifiers (none active to start).
    s = { ...s, version: 3, modifiers: s.modifiers ?? [] };
  }
  if (s.version === 3) {
    // v3 → v4: introduce faction alignment (starts neutral).
    s = { ...s, version: 4, alignment: s.alignment ?? 0 };
  }
  if (s.version === 4) {
    // v4 → v5: introduce auto-train compute focus (defaults to full training).
    s = { ...s, version: 5, computeFocus: s.computeFocus ?? 1 };
  }
  if (s.version === 5) {
    // v5 → v6: introduce released products (none yet; frontier at the start value).
    s = { ...s, version: 6, products: s.products ?? { active: [], frontier: PRODUCTS.frontierStart } };
  }
  if (s.version === 6) {
    // v6 → v7: drafts (raw models from shipping), per-product timed upgrades, and
    // product milestones. The deserializer defaults/sanitizes them; stamp + default.
    const prev = s.products ?? { active: [], frontier: PRODUCTS.frontierStart };
    s = { ...s, version: 7, products: { ...prev, drafts: prev.drafts ?? [], milestones: prev.milestones ?? [] } };
  }
  if (s.version === 7) {
    // v7 → v8: individual employees replaced the per-product role-count `assignments`
    // map (assignment now lives on each Employee). Drop the dead field.
    const { assignments: _dropped, ...products } = s.products ?? { active: [], frontier: PRODUCTS.frontierStart };
    s = { ...s, version: 8, products };
  }
  if (s.version === 8) {
    // v8 → v9: lifetime stats store (Phase 3). Backfill from what the save already
    // knows so a returning player's totals aren't all zero (ships/legacy/money seed
    // their lifetime counterparts; the rest start fresh and climb from here).
    s = { ...s, version: 9, stats: s.stats ?? {
      totalMoney: s.lifetimeMoney ?? "0",
      peakComputePerSec: "0",
      totalLegacy: s.prestige?.legacyWeights ?? "0",
      peakMrr: 0,
      peakMau: 0,
      peakResearchCount: Array.isArray(s.research) ? s.research.length : 0,
      totalShips: s.prestige?.ships ?? 0,
      productsLaunched: Array.isArray(s.products?.active) ? s.products.active.length : 0,
      employeesHired: Array.isArray(s.employees) ? s.employees.length : 0,
      worldEventsResolved: 0,
      playtimeSec: 0,
    } };
  }
  if (s.version === 9) {
    // v9 → v10: achievements collection (starts empty; unlocks evaluate on load).
    s = { ...s, version: 10, achievements: s.achievements ?? [] };
  }
  if (s.version === 10) {
    // v10 → v11: Lab Reputation (meta-currency). Nothing spent yet; perks evaluate
    // from the carried achievement/ship/ascension totals on load.
    s = { ...s, version: 11, reputation: s.reputation ?? { spent: 0, perks: [] } };
  }
  if (s.version === 11) {
    // v11 → v12: Contracts board (Phase 4). Nothing completed yet; the board
    // derives from the empty completed list on load.
    s = { ...s, version: 12, contracts: s.contracts ?? { completed: [] } };
  }
  if (s.version === 12) {
    // v12 → v13: Lab Charter (Phase 4). No charter on existing runs.
    s = { ...s, version: 13, charter: s.charter ?? null };
  }
  if (s.version === 13) {
    // v13 → v14: Legacy Investments tree (Phase 4). Nothing invested yet.
    s = { ...s, version: 14, legacyInvestments: s.legacyInvestments ?? [] };
  }
  if (s.version === 14) {
    // v14 → v15: charter-conviction memory (Depth B1). No prior charter on old runs.
    s = { ...s, version: 15, lastCharter: s.lastCharter ?? null };
  }
  if (s.version === 15) {
    // v15 → v16: regulator suspicion (Depth B3). A clean slate on existing runs.
    s = { ...s, version: 16, suspicion: s.suspicion ?? 0 };
  }
  if (s.version === 16) {
    // v16 → v17: Rig Bay components (C1). Empty inventory + loadouts on old saves.
    s = { ...s, version: 17, components: s.components ?? freshComponents() };
  }
  if (s.version === 17) {
    // v17 → v18: explicit charter lock (owner UX fix). Old runs are unlocked.
    s = { ...s, version: 18, charterLocked: s.charterLocked ?? false };
  }
  if (s.version === 18) {
    // v18 → v19: rival counterplay. No strikes landed on existing saves.
    s = { ...s, version: 19, rivalOps: s.rivalOps ?? { strikes: {}, lastStrikeSec: null } };
  }
  if (s.version === 19) {
    // v19 → v20: endgame Reputation Endowment (a level count). Nothing bought on old
    // saves — the sanitizer defaults it to 0, so this just stamps the version.
    s = { ...s, version: 20, repEndowment: s.repEndowment ?? 0 };
  }
  if (s.version === 20) {
    // v20 → v21: Grand Challenges. Existing runs start with none funded; the sanitizer
    // defaults it anyway, so this just stamps the version.
    s = { ...s, version: 21, challenges: s.challenges ?? { funded: {}, completed: [] } };
  }
  if (s.version === 21) {
    // v21 → v22: Lab Objectives. Existing runs start with none claimed (sanitizer-defaulted).
    s = { ...s, version: 22, objectives: s.objectives ?? { completed: [] } };
  }
  if (s.version === 22) {
    // v22 → v23: Automation toggles. Existing runs start with every autopilot off.
    s = { ...s, version: 23, automation: s.automation ?? {} };
  }
  if (s.version === 23) {
    // v23 → v24: Endowment Directives. Existing runs have chosen none (sanitizer also
    // defaults + caps this to the tiers repEndowment has earned).
    s = { ...s, version: 24, endowmentDirectives: s.endowmentDirectives ?? [] };
  }
  if (s.version === 24) {
    // v24 → v25: Prestige Trials. Existing runs have none active and none completed.
    s = { ...s, version: 25, activeTrial: s.activeTrial ?? null, trialsDone: s.trialsDone ?? [] };
  }
  if (s.version === 25) {
    // v25 → v26: Grand Challenge forks. Existing completed challenges have no chosen
    // arm yet (the sanitizer defaults the map; the UI prompts for any pending choice).
    s = { ...s, version: 26, challenges: { ...(s.challenges ?? { funded: {}, completed: [] }), forks: s.challenges?.forks ?? {} } };
  }
  if (s.version === 26) {
    // v26 → v27: Flagship. Existing runs have none designated (sanitizer-defaulted).
    s = { ...s, version: 27, flagship: s.flagship ?? { productId: null, tenure: 0 } };
  }
  if (s.version === 27) {
    // v27 → v28: Megaprojects II. Existing runs are at level 0 with nothing funded
    // (the sanitizer defaults + clamps this anyway; this just stamps the version).
    s = { ...s, version: 28, megaprojects: s.megaprojects ?? { level: 0, funded: { compute: "0", data: "0", money: "0" } } };
  }
  if (s.version === 28) {
    // v28 → v29: Paradigm Research. Existing runs own none (sanitizer-defaulted).
    s = { ...s, version: 29, paradigms: s.paradigms ?? [] };
  }
  if (s.version === 29) {
    // v29 → v30: Doctrine Consequences. Existing runs have claimed none.
    s = { ...s, version: 30, doctrines: s.doctrines ?? [] };
  }
  if (s.version === 30) {
    // v30 → v31: The Institute. Existing runs have founded no wings.
    s = { ...s, version: 31, institute: s.institute ?? [] };
  }
  if (s.version === 31) {
    // v31 → v32: Frontier Race stakes + charter conviction streak + Endowment
    // Directive respecs. All default to their identity values (no stake, streak 0,
    // no respecs), so every existing save loads exactly where it left off.
    s = { ...s, version: 32, rivalStake: s.rivalStake ?? null, charterStreak: s.charterStreak ?? 0, endowmentRespecs: s.endowmentRespecs ?? 0 };
  }
  if (s.version === 32) {
    // v32 → v33: Institute Fellowships (the Institute's infinite tail). Existing runs
    // have endowed no chairs; the wings they own are untouched.
    //
    // NOTE: this landed as v31 → v32 on its own branch, but main had already claimed
    // v32 for the fields above. Renumbered on merge so the chain stays strictly
    // sequential — collapsing the two would have skipped one set of fields entirely
    // for every save that has already migrated past it.
    s = { ...s, version: 33, instituteFellowships: s.instituteFellowships ?? 0 };
  }
  return s as SavedShape;
}
