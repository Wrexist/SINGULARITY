import { products as B, type ProductTypeId, type ProductTypeDef } from "./balance/products";
import type { GameState, ProductMods, ProductState, ProductsState, UpgradeState } from "./types";

/** No employees hired → no product buffs. */
export const NEUTRAL_MODS: ProductMods = { upgradeSpeed: 1, serveCost: 1, churn: 1, acq: 1 };

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

export function simulateProducts(
  ps: ProductsState,
  seconds: number,
  mods: ProductMods = NEUTRAL_MODS,
): ProductsSimResult {
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
    const mau = clamp(p.mau + (acqMkt + acqViral) * mods.acq * seconds, 0, t.tam);

    // Conversion target (pricier → fewer convert; less competitive → fewer convert).
    const convRate = clamp((t.baseConversion * qf) / p.priceMult, 0, 1);
    const targetPaid = mau * convRate;

    // Churn rises with staleness (frontier gap) and price; buzz cuts it.
    const gap = Math.max(0, frontier - p.quality);
    const churn = t.baseChurn * (1 + gap * B.stalenessChurn) * p.priceMult * (buzz ? B.buzzChurnMult : 1) * mods.churn;

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
    const serve = paidIntegral * t.computePerUser * p.quality * mods.serveCost;
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
  // Only blame a pressure that actually crossed its own threshold — otherwise a
  // sub-threshold-but-numerically-larger staleExcess could mislabel a purely
  // over-priced product as "stale" (and tell the player to ship a version they
  // don't need). Compare magnitudes only when BOTH have crossed.
  const staleHot = staleExcess >= B.flavor.staleMin;
  const priceHot = priceExcess >= B.flavor.priceMin;
  if (!staleHot && !priceHot) return "healthy";
  if (staleHot && !priceHot) return "stale";
  if (priceHot && !staleHot) return "pricey";
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
    upgrade: null,
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

// ---------- Drafts (commercialise a shipped model) ----------

export function canLaunchDraft(state: GameState, draftId: string, type: ProductTypeId): boolean {
  if (!productsUnlocked(state)) return false;
  if (!typeUnlocked(state, type)) return false;
  if (state.products.active.length >= B.maxActive) return false;
  if (!state.products.drafts.some((d) => d.id === draftId)) return false;
  return (
    state.resources.compute.gte(B.releaseCost.compute) &&
    state.resources.data.gte(B.releaseCost.data)
  );
}

/** Commercialise a shipped "raw model" draft into an active product: pick its type
 *  + name, pay the launch cost. The product starts at the DRAFT's quality (the
 *  strength of the model you shipped), not the current frontier. */
export function launchDraft(
  state: GameState,
  opts: { draftId: string; type: ProductTypeId; name: string; id: string },
): GameState {
  if (!canLaunchDraft(state, opts.draftId, opts.type)) return state;
  const draft = state.products.drafts.find((d) => d.id === opts.draftId)!;
  const product: ProductState = {
    id: opts.id,
    name: opts.name,
    type: opts.type,
    version: 1,
    quality: Math.max(1, draft.quality),
    priceMult: 1,
    marketingPerSec: 0,
    mau: 0,
    paid: 0,
    buzzSec: B.buzzDurationSec,
    upgrade: null,
  };
  return {
    ...state,
    resources: {
      ...state.resources,
      compute: state.resources.compute.sub(B.releaseCost.compute),
      data: state.resources.data.sub(B.releaseCost.data),
    },
    products: {
      ...state.products,
      active: [...state.products.active, product],
      drafts: state.products.drafts.filter((d) => d.id !== opts.draftId),
    },
  };
}

// ---------- Timed version upgrades ("research takes time") ----------

/** Research seconds for the upgrade leaving the given current version. */
export function upgradeDurationSec(version: number): number {
  const g = Math.pow(B.upgrade.secGrowth, Math.max(0, version - 1));
  return Math.min(B.upgrade.maxSec, B.upgrade.baseSec * g);
}

export function canStartUpgrade(state: GameState, id: string): boolean {
  const p = state.products.active.find((x) => x.id === id);
  if (!p || p.upgrade) return false; // one upgrade per product at a time
  const c = versionCost(p.version);
  return (
    state.resources.compute.gte(c.compute * B.upgrade.upfrontFrac) &&
    state.resources.data.gte(c.data * B.upgrade.upfrontFrac)
  );
}

/** Begin a timed upgrade: pay the upfront fraction now; the rest drains over the
 *  research window (handled each tick by advanceUpgrades). */
export function startUpgrade(state: GameState, id: string): GameState {
  if (!canStartUpgrade(state, id)) return state;
  const p = state.products.active.find((x) => x.id === id)!;
  const c = versionCost(p.version);
  const upfrontC = c.compute * B.upgrade.upfrontFrac;
  const upfrontD = c.data * B.upgrade.upfrontFrac;
  const dur = upgradeDurationSec(p.version);
  const upgrade: UpgradeState = {
    targetVersion: p.version + 1,
    remainingCompute: c.compute - upfrontC,
    remainingData: c.data - upfrontD,
    remainingSec: dur,
    totalSec: dur,
  };
  return {
    ...state,
    resources: {
      ...state.resources,
      compute: state.resources.compute.sub(upfrontC),
      data: state.resources.data.sub(upfrontD),
    },
    products: {
      ...state.products,
      active: state.products.active.map((x) => (x.id === id ? { ...x, upgrade } : x)),
    },
  };
}

/** Progress fraction [0,1] of an in-flight upgrade (for the UI bar). */
export function upgradeProgress(u: UpgradeState): number {
  return u.totalSec > 0 ? clamp(1 - u.remainingSec / u.totalSec, 0, 1) : 1;
}

export interface UpgradeTickResult {
  products: ProductsState;
  /** Compute/Data drained this window (subtract from resources in tick). */
  computeSpent: number;
  dataSpent: number;
  /** Upgrades that finished this window (for the celebration toast). */
  completed: { id: string; name: string; version: number }[];
}

/** Advance every in-flight upgrade by `seconds`, limited by available Compute/Data
 *  (a tick you can't afford the drain stalls that upgrade). Pure: resource pools
 *  are passed in as numbers and the amounts spent are returned for the caller (tick)
 *  to subtract from the Big resources. On completion: version bumps, quality jumps
 *  to the current frontier, and launch buzz fires. */
export function advanceUpgrades(
  ps: ProductsState,
  computeAvail: number,
  dataAvail: number,
  seconds: number,
  mods: ProductMods = NEUTRAL_MODS,
): UpgradeTickResult {
  if (seconds <= 0 || !ps.active.some((p) => p.upgrade)) {
    return { products: ps, computeSpent: 0, dataSpent: 0, completed: [] };
  }
  // ML scientists make each real second count for more research progress.
  const effSeconds = seconds * Math.max(0, mods.upgradeSpeed);
  let cAvail = computeAvail;
  let dAvail = dataAvail;
  let computeSpent = 0;
  let dataSpent = 0;
  const completed: { id: string; name: string; version: number }[] = [];

  const active = ps.active.map((p) => {
    const u = p.upgrade;
    if (!u) return p;
    let adv = Math.min(effSeconds, u.remainingSec);
    const perSecC = u.remainingSec > 0 ? u.remainingCompute / u.remainingSec : 0;
    const perSecD = u.remainingSec > 0 ? u.remainingData / u.remainingSec : 0;
    // Scale the advance down to what the player can actually afford this tick.
    let frac = 1;
    if (perSecC * adv > 0) frac = Math.min(frac, cAvail / (perSecC * adv));
    if (perSecD * adv > 0) frac = Math.min(frac, dAvail / (perSecD * adv));
    frac = Math.max(0, Math.min(1, frac));
    adv *= frac;
    const spentC = perSecC * adv;
    const spentD = perSecD * adv;
    cAvail -= spentC; dAvail -= spentD;
    computeSpent += spentC; dataSpent += spentD;

    const remainingSec = u.remainingSec - adv;
    if (remainingSec <= 1e-6) {
      // Research complete — catch up to the frontier and fire launch buzz.
      completed.push({ id: p.id, name: p.name, version: u.targetVersion });
      return {
        ...p,
        version: u.targetVersion,
        quality: Math.max(p.quality, ps.frontier),
        buzzSec: B.buzzDurationSec,
        upgrade: null,
      };
    }
    return {
      ...p,
      upgrade: {
        ...u,
        remainingSec,
        remainingCompute: Math.max(0, u.remainingCompute - spentC),
        remainingData: Math.max(0, u.remainingData - spentD),
      },
    };
  });

  return { products: { ...ps, active }, computeSpent, dataSpent, completed };
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
