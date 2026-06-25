import { Big } from "./math/Big";
import { SAVE_VERSION, createInitialState } from "./state";
import { products as PRODUCTS } from "./balance/products";
import type { ActiveModifier, GameState, ModifierTarget, ProductsState, ProductState } from "./types";

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
    o.priceMult! > 0
  );
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
  // `sold` was added after v6 shipped; default it for saves that predate it.
  const products: ProductsState = {
    ...loadedProducts,
    sold: typeof loadedProducts.sold === "number" && Number.isFinite(loadedProducts.sold) ? loadedProducts.sold : 0,
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
  return s as SavedShape;
}
