import { Big } from "./math/Big";
import { SAVE_VERSION, createInitialState } from "./state";
import { initialStats } from "./stats";
import { products as PRODUCTS } from "./balance/products";
import type { ActiveModifier, DraftModel, Employee, GameState, LifetimeStats, ModifierTarget, ProductsState, ProductState, UpgradeState } from "./types";

const MODIFIER_TARGETS: ModifierTarget[] = ["computeMult", "dataMult", "moneyMult"];
const PRODUCT_TYPE_IDS = PRODUCTS.types.map((t) => t.id);

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
  modifiers: ActiveModifier[];
  alignment: number;
  computeFocus: number;
  products: ProductsState;
  employees: Employee[];
  /** Serialized lifetime stats (Big fields as strings). */
  stats: Record<string, string | number>;
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
    },
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
      return {
        ...p,
        upgrade: sanitizeUpgrade(o.upgrade),
        features: Array.isArray(o.features) ? o.features.filter((s): s is string => typeof s === "string") : [],
        enterprise: o.enterprise === true,
        enterprisePrice: typeof o.enterprisePrice === "number" && Number.isFinite(o.enterprisePrice) && o.enterprisePrice > 0 ? o.enterprisePrice : 1,
        channelMix: sanitizeChannelMix(o.channelMix),
      };
    }),
    drafts: sanitizeDrafts((loadedProducts as ProductsState).drafts),
    sold: typeof loadedProducts.sold === "number" && Number.isFinite(loadedProducts.sold) ? loadedProducts.sold : 0,
    milestones: Array.isArray((loadedProducts as ProductsState).milestones)
      ? (loadedProducts as ProductsState).milestones.filter((m): m is string => typeof m === "string")
      : [],
  };
  return {
    version: SAVE_VERSION,
    resources: {
      compute: Big.of(res.compute ?? "0"),
      data: Big.of(res.data ?? "0"),
      money: Big.of(res.money ?? "0"),
    },
    upgrades: raw.upgrades ?? fresh.upgrades,
    research: raw.research ?? fresh.research,
    run: raw.run ?? fresh.run,
    prestige: {
      legacyWeights: Big.of(pres.legacyWeights ?? "0"),
      ships: pres.ships ?? 0,
    },
    lifetimeMoney: Big.of(raw.lifetimeMoney ?? res.money ?? "0"),
    heat,
    modifiers,
    alignment,
    computeFocus,
    products,
    employees: sanitizeEmployees(raw.employees),
    stats: sanitizeStats(raw.stats),
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
  return s as SavedShape;
}
