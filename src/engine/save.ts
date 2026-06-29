import { Big } from "./math/Big";
import { SAVE_VERSION, createInitialState } from "./state";
import { initialStats } from "./stats";
import { products as PRODUCTS } from "./balance/products";
import type { ActiveModifier, DraftModel, Employee, GameState, LifetimeStats, ModifierTarget, ProductsState, ProductState, UpgradeState } from "./types";

const MODIFIER_TARGETS: ModifierTarget[] = ["computeMult", "dataMult", "moneyMult"];
const PRODUCT_TYPE_IDS = PRODUCTS.types.map((t) => t.id);

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
  if (typeof v === "string" && NUM_RE.test(v.trim())) return Big.of(v.trim());
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

/** The upgrades map is fully untrusted (it drives derive directly). Keep only
 *  string keys → finite non-negative integer counts; drop `__proto__` & garbage. */
function sanitizeUpgrades(u: unknown): Record<string, number> {
  if (!u || typeof u !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(u as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
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
    targetVersion: o.targetVersion!,
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

/** Drafts are untrusted; keep only well-formed entries. */
function sanitizeDrafts(d: unknown): DraftModel[] {
  if (!Array.isArray(d)) return [];
  return d
    .filter(
      (x): x is DraftModel =>
        !!x &&
        typeof x.id === "string" &&
        typeof x.quality === "number" && Number.isFinite(x.quality) && x.quality >= 0 &&
        typeof x.ships === "number" && Number.isFinite(x.ships),
    )
    .map((x) => ({ id: x.id, quality: x.quality, ships: x.ships }));
}

/** Loaded products are untrusted; guard the container AND each entry. */
function isWellFormedProducts(p: unknown): p is ProductsState {
  const o = p as Partial<ProductsState> | null;
  return (
    !!o &&
    Array.isArray(o.active) &&
    o.active.every(isWellFormedProduct) &&
    typeof o.frontier === "number" &&
    Number.isFinite(o.frontier)
  );
}

/** Employees are untrusted; keep only well-formed people, sanitizing training. */
function sanitizeEmployees(e: unknown): Employee[] {
  if (!Array.isArray(e)) return [];
  return e
    .filter((x): x is Employee =>
      !!x && typeof x.id === "string" && typeof x.name === "string" && typeof x.roleId === "string" &&
      typeof x.level === "number" && Number.isFinite(x.level) && x.level >= 1)
    .map((x) => ({
      id: x.id,
      name: x.name,
      roleId: x.roleId,
      level: Math.max(1, Math.floor(x.level)),
      trait: typeof x.trait === "string" ? x.trait : null,
      assignedProductId: typeof x.assignedProductId === "string" ? x.assignedProductId : null,
      training:
        x.training && typeof x.training.remainingSec === "number" && Number.isFinite(x.training.remainingSec) &&
        typeof x.training.totalSec === "number" && Number.isFinite(x.training.totalSec) && x.training.totalSec > 0 &&
        x.training.remainingSec > 0
          ? { remainingSec: x.training.remainingSec, totalSec: x.training.totalSec }
          : null,
    }));
}

/** Lifetime stats are untrusted: coerce each field, default a zeroed stat block. */
function sanitizeStats(s: unknown): LifetimeStats {
  const d = initialStats();
  if (!s || typeof s !== "object") return d;
  const o = s as Record<string, unknown>;
  const big = (v: unknown, fb: Big): Big => {
    if (typeof v !== "string" && typeof v !== "number") return fb;
    try { return Big.of(v); } catch { return fb; }
  };
  const numf = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    totalMoney: big(o.totalMoney, d.totalMoney),
    peakComputePerSec: big(o.peakComputePerSec, d.peakComputePerSec),
    totalLegacy: big(o.totalLegacy, d.totalLegacy),
    peakMrr: numf(o.peakMrr),
    peakMau: numf(o.peakMau),
    peakResearchCount: numf(o.peakResearchCount),
    totalShips: numf(o.totalShips),
    productsLaunched: numf(o.productsLaunched),
    employeesHired: numf(o.employeesHired),
    worldEventsResolved: numf(o.worldEventsResolved),
    playtimeSec: numf(o.playtimeSec),
    ascensions: numf(o.ascensions),
    openSourceShips: numf(o.openSourceShips),
    safetyShips: numf(o.safetyShips), // old saves → 0 (sanitizer-defaulted; no version bump needed)
    bestRivalsBeaten: numf(o.bestRivalsBeaten), // old saves → 0 (best-so-far starts low and only climbs)
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
  contracts: { completed: string[] };
  charter: string | null;
  lastCharter: string | null;
  legacyInvestments: string[];
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
    },
    achievements: state.achievements,
    reputation: state.reputation,
    contracts: state.contracts,
    charter: state.charter,
    lastCharter: state.lastCharter,
    legacyInvestments: state.legacyInvestments,
  };
  return JSON.stringify(shape);
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
  const modifiers = Array.isArray(raw.modifiers)
    ? raw.modifiers.filter(isWellFormedModifier)
    : fresh.modifiers;
  const alignment =
    typeof raw.alignment === "number" && Number.isFinite(raw.alignment)
      ? Math.max(-1, Math.min(1, raw.alignment))
      : fresh.alignment;
  const computeFocus =
    typeof raw.computeFocus === "number" && Number.isFinite(raw.computeFocus)
      ? Math.max(0, Math.min(1, raw.computeFocus))
      : fresh.computeFocus;
  const loadedProducts = isWellFormedProducts(raw.products) ? raw.products : fresh.products;
  // `sold` was added after v6 shipped, `drafts`/`upgrade` in v7; default them for
  // saves that predate each, and sanitize the untrusted nested shapes.
  const products: ProductsState = {
    ...loadedProducts,
    active: loadedProducts.active.map((p) => {
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
    }),
    // Frontier must stay ≥ its start: a negative frontier pins every product's
    // competitiveness at 1 and zeroes staleness churn (a permanent buff exploit).
    frontier: clampNum(loadedProducts.frontier, PRODUCTS.frontierStart, PROD_CAPS.frontier, PRODUCTS.frontierStart),
    drafts: sanitizeDrafts((loadedProducts as ProductsState).drafts),
    sold: typeof loadedProducts.sold === "number" && Number.isFinite(loadedProducts.sold) && loadedProducts.sold >= 0 ? Math.floor(loadedProducts.sold) : 0,
    milestones: Array.isArray((loadedProducts as ProductsState).milestones)
      ? (loadedProducts as ProductsState).milestones.filter((m): m is string => typeof m === "string")
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
    // research must be an array of strings (a string/number/garbage would break length/includes).
    research: Array.isArray(raw.research) ? raw.research.filter((r): r is string => typeof r === "string") : fresh.research,
    run: {
      active: (raw.run as GameState["run"] | undefined)?.active === true,
      progress: clampNum((raw.run as GameState["run"] | undefined)?.progress, 0, 1, 0),
      readyToClaim: (raw.run as GameState["run"] | undefined)?.readyToClaim === true,
    },
    prestige: {
      legacyWeights: safeBig(pres.legacyWeights),
      ships: safeCount(pres.ships),
    },
    lifetimeMoney: safeBig(raw.lifetimeMoney ?? res.money),
    heat,
    suspicion,
    modifiers,
    alignment,
    computeFocus,
    products,
    employees: sanitizeEmployees(raw.employees),
    stats: sanitizeStats(raw.stats),
    achievements: Array.isArray(raw.achievements)
      ? raw.achievements.filter((a): a is string => typeof a === "string")
      : [],
    reputation: sanitizeReputation(raw.reputation),
    contracts: sanitizeContracts(raw.contracts),
    charter: typeof raw.charter === "string" ? raw.charter : null,
    lastCharter: typeof raw.lastCharter === "string" ? raw.lastCharter : null,
    legacyInvestments: Array.isArray(raw.legacyInvestments)
      ? raw.legacyInvestments.filter((x): x is string => typeof x === "string")
      : [],
    // Generation-scoped (not persisted): a mid-run reload simply re-accrues the run
    // peaks, and the ship report is transient — both start fresh on load.
    runPeakCompute: fresh.runPeakCompute,
    runPeakMrr: fresh.runPeakMrr,
    lastShipReport: fresh.lastShipReport,
  };
}

/** Contracts are untrusted: keep a clean array of completed string ids. */
function sanitizeContracts(c: unknown): { completed: string[] } {
  const o = (c ?? {}) as { completed?: unknown };
  return {
    completed: Array.isArray(o.completed) ? o.completed.filter((x): x is string => typeof x === "string") : [],
  };
}

/** Reputation is untrusted: keep a non-negative spent + string perk ids. */
function sanitizeReputation(r: unknown): { spent: number; perks: string[] } {
  const o = (r ?? {}) as { spent?: unknown; perks?: unknown };
  return {
    spent: typeof o.spent === "number" && Number.isFinite(o.spent) && o.spent >= 0 ? o.spent : 0,
    perks: Array.isArray(o.perks) ? o.perks.filter((p): p is string => typeof p === "string") : [],
  };
}

/**
 * Bring any older save up to the current shape. Each version bump appends a
 * step here. v0 (pre-versioning) → v1 is the seed pattern.
 */
export function migrate(raw: any): SavedShape {
  let s = raw;
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
  return s as SavedShape;
}
