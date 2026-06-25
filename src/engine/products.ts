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

/** A specific model type unlocks once you've shipped enough models — premium,
 *  high-ARPU types arrive later (reinforces "hard early, compounds later"). */
export function typeUnlocked(state: GameState, id: ProductTypeId): boolean {
  return state.prestige.ships >= typeDef(id).unlockAtShips;
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

    // Paid subscribers follow dp/dt = convSpeed·(target − p) − churn·p. We solve
    // that ODE in closed form over the window so it stays correct for ANY tick
    // size — a big offline catch-up converges toward the steady state instead of
    // the old linear `paid − paid·churn·seconds`, which over hours went hugely
    // negative and wiped even ultra-sticky products to zero on every reopen.
    const k = B.convSpeed + churn; // combined approach rate
    const pStar = k > 0 ? (B.convSpeed * targetPaid) / k : targetPaid; // steady state
    const decay = Math.exp(-k * seconds);
    let paid = clamp(pStar + (p.paid - pStar) * decay, 0, mau);

    // Economics: bill on the exact time-integral of paid(t) over the window
    // (∫ of the decay curve), so a long tick charges the real area under the
    // subscriber curve, not the endpoint. Matches the old per-frame math for
    // small ticks; only differs (correctly) for large offline windows.
    const paidIntegral = k > 0
      ? pStar * seconds + ((p.paid - pStar) * (1 - decay)) / k
      : p.paid * seconds;
    const arpu = t.baseArpu * p.priceMult * p.quality;
    const mrr = paidIntegral * arpu;
    const serve = paidIntegral * t.computePerUser * p.quality;
    moneyDelta += mrr - serve - p.marketingPerSec * seconds;
    if (paid > 0) heatDelta += t.heatPerSec * seconds;

    return { ...p, mau, paid, buzzSec: Math.max(0, p.buzzSec - seconds) };
  });

  return { products: { ...ps, active, frontier }, moneyDelta, heatDelta };
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

// ---------- Churn-reason classification + flavor (pure) ----------

export type ChurnReason = "stale" | "pricey" | "healthy";

/** The dominant reason a product is shedding subscribers — for legibility + flavor.
 *  Pure: same product + frontier → same reason. A product inside its launch/version
 *  buzz window counts as "healthy" (it was just refreshed; don't roast it). */
export function churnReason(p: ProductState, frontier: number): ChurnReason {
  if (p.buzzSec > 0) return "healthy";
  const gap = Math.max(0, frontier - p.quality);
  const staleExcess = gap * B.stalenessChurn;        // extra churn fraction from falling behind
  const priceExcess = Math.max(0, p.priceMult - 1);  // extra churn fraction from over-pricing
  if (staleExcess < B.flavor.staleMin && priceExcess < B.flavor.priceMin) return "healthy";
  return staleExcess >= priceExcess ? "stale" : "pricey";
}

export interface ChurnFlavorResult {
  productId: string;
  productName: string;
  reason: "stale" | "pricey";
  message: string;
}

/** Occasionally surface WHY a product is bleeding, as a satirical toast. Deterministic
 *  given its rolls (the store supplies Math.random(), like maybeHeatEvent) — so the
 *  cadence lives in the impure layer and this stays pure/testable. Returns null when
 *  nothing is materially churning or the dice say "not this tick". */
export function maybeChurnFlavor(
  ps: ProductsState,
  seconds: number,
  rollFire: number,
  rollPick: number,
  rollLine: number,
): ChurnFlavorResult | null {
  const bleeding = ps.active.filter(
    (p) => p.paid >= B.flavor.minPaid && churnReason(p, ps.frontier) !== "healthy",
  );
  if (bleeding.length === 0) return null;
  const chance = 1 - Math.exp(-B.flavor.ratePerSec * seconds);
  if (rollFire >= chance) return null;
  const p = bleeding[Math.min(bleeding.length - 1, Math.floor(rollPick * bleeding.length))]!;
  const reason = churnReason(p, ps.frontier) as "stale" | "pricey";
  const lines = B.flavor.lines[reason];
  const line = lines[Math.min(lines.length - 1, Math.floor(rollLine * lines.length))]!;
  return { productId: p.id, productName: p.name, reason, message: line.replace("{name}", p.name) };
}

// ---------- Actions (pure; the store supplies a fresh `id`) ----------

export function canReleaseProduct(state: GameState, type: ProductTypeId): boolean {
  if (!productsUnlocked(state)) return false;
  if (!typeUnlocked(state, type)) return false;
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

/** Marketing-dial ceiling for a product: scales with quality (game progress). */
export function marketingCap(p: ProductState): number {
  return Math.max(1, p.quality * B.marketingCapPerQuality);
}

export function setProductMarketing(state: GameState, id: string, perSec: number): GameState {
  return {
    ...state,
    products: {
      ...state.products,
      // Clamp to [0, cap] at the source so state can't drift above the dial the
      // UI shows (the cap shrinks/grows with quality).
      active: state.products.active.map((x) =>
        x.id === id ? { ...x, marketingPerSec: clamp(perSec, 0, marketingCap(x)) } : x,
      ),
    },
  };
}

export function renameProduct(state: GameState, id: string, name: string): GameState {
  const clean = name.trim().slice(0, 24) || "Untitled";
  return {
    ...state,
    products: {
      ...state.products,
      active: state.products.active.map((x) => (x.id === id ? { ...x, name: clean } : x)),
    },
  };
}

/** Sell/sunset a product. Pays out a one-time Money buyout (≈ retireValuationSec
 *  of its current MRR) — a real "cash out now vs keep earning" decision. */
export function retireProduct(state: GameState, id: string): GameState {
  const p = state.products.active.find((x) => x.id === id);
  if (!p) return state;
  const payout = productMetrics(p, state.products.frontier).mrr * B.retireValuationSec;
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.add(Math.max(0, payout)) },
    lifetimeMoney: state.lifetimeMoney.add(Math.max(0, payout)),
    products: {
      ...state.products,
      active: state.products.active.filter((x) => x.id !== id),
      sold: state.products.sold + 1, // lifetime "products sold" badge (persists across prestige)
    },
  };
}

/** Money you'd get for retiring a product right now (for the UI). */
export function retirePayout(state: GameState, id: string): number {
  const p = state.products.active.find((x) => x.id === id);
  if (!p) return 0;
  return Math.max(0, productMetrics(p, state.products.frontier).mrr * B.retireValuationSec);
}
