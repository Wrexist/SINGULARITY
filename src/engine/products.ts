import { products as B, type ProductTypeId, type ProductTypeDef } from "./balance/products";
import type { GameState, ProductState, ProductsState } from "./types";

/**
 * PHASE 3 — AI Product / Deployment engine. Pure & deterministic (time passed in,
 * no Date.now/Math.random — the store supplies new product ids, like it supplies
 * rolls). Products cost Compute+Data to build/version and earn Money to operate;
 * customers/MRR are product metrics, not new resources. See PHASE3_PRODUCTS_PLAN.md.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function typeDef(id: ProductTypeId): ProductTypeDef {
  return B.types.find((t) => t.id === id) ?? B.types[0]!;
}

/** Products unlock once you've shipped at least `unlockAtShips` models. */
export function productsUnlocked(state: GameState): boolean {
  return state.prestige.ships >= B.unlockAtShips;
}

/** Compute+Data cost to push from the given current version to the next. */
export function versionCost(version: number): { compute: number; data: number } {
  const g = Math.pow(B.versionCostGrowth, Math.max(0, version - 1));
  return { compute: B.versionCost.compute * g, data: B.versionCost.data * g };
}

// ---------- Per-tick simulation (deterministic) ----------

export interface ProductsSimResult {
  products: ProductsState;
  /** Net Money change this window (Σ margins). Can be negative. */
  moneyDelta: number;
  /** Regulatory Heat added (domain products). */
  heatDelta: number;
}

export function simulateProducts(ps: ProductsState, seconds: number): ProductsSimResult {
  if (ps.active.length === 0) {
    // Frontier still drifts so a future product launches against current state.
    return { products: { ...ps, frontier: ps.frontier + B.frontierGrowthPerSec * seconds }, moneyDelta: 0, heatDelta: 0 };
  }
  const frontier = ps.frontier + B.frontierGrowthPerSec * seconds;
  let moneyDelta = 0;
  let heatDelta = 0;

  const active = ps.active.map((p) => {
    const t = typeDef(p.type);
    const buzz = p.buzzSec > 0;
    const qf = clamp(p.quality / Math.max(frontier, 1e-9), 0, 1); // how competitive you are
    const sat = Math.max(0, 1 - p.mau / t.tam); // remaining TAM headroom

    // Acquisition: paid marketing (CAC rises with saturation) + organic virality.
    const cac = B.marketingCacBase * (1 + (p.mau / t.tam) * B.cacSaturation);
    const acqMkt = cac > 0 ? p.marketingPerSec / cac : 0;
    const acqViral = p.mau * t.virality * qf * sat * (buzz ? B.buzzAcqMult : 1);
    const mau = clamp(p.mau + (acqMkt + acqViral) * seconds, 0, t.tam);

    // Conversion target (pricier → fewer convert; less competitive → fewer convert).
    const convRate = clamp((t.baseConversion * qf) / p.priceMult, 0, 1);
    const targetPaid = mau * convRate;

    // Churn rises with staleness (frontier gap) and price; buzz cuts it.
    const gap = Math.max(0, frontier - p.quality);
    const churn = t.baseChurn * (1 + gap * B.stalenessChurn) * p.priceMult * (buzz ? B.buzzChurnMult : 1);

    let paid = p.paid + (targetPaid - p.paid) * clamp(B.convSpeed * seconds, 0, 1) - p.paid * churn * seconds;
    paid = clamp(paid, 0, mau);

    // Economics: revenue − serving − marketing.
    const arpu = t.baseArpu * p.priceMult * p.quality;
    const mrr = paid * arpu;
    const serve = paid * t.computePerUser * p.quality;
    moneyDelta += (mrr - serve - p.marketingPerSec) * seconds;
    if (paid > 0) heatDelta += t.heatPerSec * seconds;

    return { ...p, mau, paid, buzzSec: Math.max(0, p.buzzSec - seconds) };
  });

  return { products: { active, frontier }, moneyDelta, heatDelta };
}

// ---------- Derived metrics (for the dashboard) ----------

export interface ProductMetrics {
  mau: number; paid: number; arpu: number; mrr: number; serve: number;
  margin: number; gap: number; churnPerMin: number; qf: number;
}

export function productMetrics(p: ProductState, frontier: number): ProductMetrics {
  const t = typeDef(p.type);
  const arpu = t.baseArpu * p.priceMult * p.quality;
  const mrr = p.paid * arpu;
  const serve = p.paid * t.computePerUser * p.quality;
  const gap = Math.max(0, frontier - p.quality);
  const churnPerSec = t.baseChurn * (1 + gap * B.stalenessChurn) * p.priceMult * (p.buzzSec > 0 ? B.buzzChurnMult : 1);
  return {
    mau: p.mau, paid: p.paid, arpu, mrr, serve,
    margin: mrr - serve - p.marketingPerSec,
    gap, churnPerMin: churnPerSec * 60,
    qf: clamp(p.quality / Math.max(frontier, 1e-9), 0, 1),
  };
}

// ---------- Actions (pure; the store supplies a fresh `id`) ----------

export function canReleaseProduct(state: GameState, _type: ProductTypeId): boolean {
  if (!productsUnlocked(state)) return false;
  if (state.products.active.length >= B.maxActive) return false;
  return (
    state.resources.compute.gte(B.releaseCost.compute) &&
    state.resources.data.gte(B.releaseCost.data)
  );
}

export function releaseProduct(
  state: GameState,
  opts: { type: ProductTypeId; name: string; id: string },
): GameState {
  if (!canReleaseProduct(state, opts.type)) return state;
  const product: ProductState = {
    id: opts.id,
    name: opts.name,
    type: opts.type,
    version: 1,
    quality: state.products.frontier, // launch at the current frontier
    priceMult: 1,
    marketingPerSec: 0,
    mau: 0,
    paid: 0,
    buzzSec: B.buzzDurationSec,
  };
  return {
    ...state,
    resources: {
      ...state.resources,
      compute: state.resources.compute.sub(B.releaseCost.compute),
      data: state.resources.data.sub(B.releaseCost.data),
    },
    products: { ...state.products, active: [...state.products.active, product] },
  };
}

export function canPushVersion(state: GameState, id: string): boolean {
  const p = state.products.active.find((x) => x.id === id);
  if (!p) return false;
  const c = versionCost(p.version);
  return state.resources.compute.gte(c.compute) && state.resources.data.gte(c.data);
}

export function pushVersion(state: GameState, id: string): GameState {
  if (!canPushVersion(state, id)) return state;
  const p = state.products.active.find((x) => x.id === id)!;
  const c = versionCost(p.version);
  const active = state.products.active.map((x) =>
    x.id === id
      ? { ...x, version: x.version + 1, quality: state.products.frontier, buzzSec: B.buzzDurationSec }
      : x,
  );
  return {
    ...state,
    resources: {
      ...state.resources,
      compute: state.resources.compute.sub(c.compute),
      data: state.resources.data.sub(c.data),
    },
    products: { ...state.products, active },
  };
}

export function setProductPrice(state: GameState, id: string, priceMult: number): GameState {
  const price = clamp(priceMult, B.priceMin, B.priceMax);
  return {
    ...state,
    products: {
      ...state.products,
      active: state.products.active.map((x) => (x.id === id ? { ...x, priceMult: price } : x)),
    },
  };
}

export function setProductMarketing(state: GameState, id: string, perSec: number): GameState {
  const m = Math.max(0, perSec);
  return {
    ...state,
    products: {
      ...state.products,
      active: state.products.active.map((x) => (x.id === id ? { ...x, marketingPerSec: m } : x)),
    },
  };
}

export function retireProduct(state: GameState, id: string): GameState {
  return {
    ...state,
    products: { ...state.products, active: state.products.active.filter((x) => x.id !== id) },
  };
}
