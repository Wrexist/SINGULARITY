import {
  products as B, productMilestones, productFeatures,
  type ProductTypeId, type ProductTypeDef, type MilestoneDef, type FeatureLane,
} from "./balance/products";
import type { GameState, ProductMods, ProductState, ProductsState, UpgradeState } from "./types";

/** No employees hired → no product buffs. */
export const NEUTRAL_MODS: ProductMods = { upgradeSpeed: 1, serveCost: 1, churn: 1, acq: 1, arpu: 1, heat: 1 };

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

export type FeatureMods = Record<FeatureLane, number>;
const NEUTRAL_FEATURES: FeatureMods = { acq: 1, arpu: 1, conversion: 1, churn: 1, serveCost: 1, tam: 1, heat: 1 };

/** Combined multipliers from a product's purchased features (each lane is a product
 *  of the owned features' factors). */
export function featureMods(p: ProductState): FeatureMods {
  if (!p.features || p.features.length === 0) return NEUTRAL_FEATURES;
  const m: FeatureMods = { ...NEUTRAL_FEATURES };
  for (const id of p.features) {
    const def = productFeatures.find((f) => f.id === id);
    if (def) m[def.lane] *= def.factor;
  }
  return m;
}

export function canBuyFeature(state: GameState, productId: string, featureId: string): boolean {
  const p = state.products.active.find((x) => x.id === productId);
  const def = productFeatures.find((f) => f.id === featureId);
  if (!p || !def || p.features.includes(featureId)) return false;
  return state.resources.money.gte(def.cost);
}

/** Invest Money into a one-time product feature (a perk that tunes its economics). */
export function buyFeature(state: GameState, productId: string, featureId: string): GameState {
  if (!canBuyFeature(state, productId, featureId)) return state;
  const def = productFeatures.find((f) => f.id === featureId)!;
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.sub(def.cost) },
    products: {
      ...state.products,
      active: state.products.active.map((x) =>
        x.id === productId ? { ...x, features: [...x.features, featureId] } : x,
      ),
    },
  };
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

/** Whether a state has shipped enough to OFFER the Enterprise tier. */
export function enterpriseUnlocked(state: GameState): boolean {
  return state.prestige.ships >= B.enterprise.unlockShips;
}

/** Blended conversion + ARPU across the Pro and (optional) Enterprise tiers. Free is
 *  the non-paying MAU. ARPU is the conversion-weighted blend, so `paid` can stay a
 *  single eased value. Returns pre-mods ARPU (callers apply staff mods.arpu). */
function tierEconomics(p: ProductState, t: ProductTypeDef, qf: number, fm: FeatureMods) {
  const base = t.baseConversion * qf * fm.conversion;
  const proConv = base / p.priceMult;
  const entConv = p.enterprise ? (base * B.enterprise.convShare) / Math.max(1e-9, p.enterprisePrice) : 0;
  const proArpu = t.baseArpu * p.priceMult * p.quality * fm.arpu;
  const entArpu = t.baseArpu * p.enterprisePrice * B.enterprise.arpuMult * p.quality * fm.arpu;
  const total = proConv + entConv;
  const arpu = total > 0 ? (proConv * proArpu + entConv * entArpu) / total : proArpu;
  return { convRate: clamp(total, 0, 1), arpu, proConv, entConv, proArpu, entArpu };
}

/** Users acquired/sec from marketing, split across channels by the product's mix.
 *  Each channel converts its share of the budget at its own CAC (which rises with
 *  market penetration at its own rate). Default mix {ads:1} reproduces the baseline. */
function channelAcq(p: ProductState, tam: number): number {
  const mix = p.channelMix ?? {};
  let totalW = 0;
  for (const c of B.channels) totalW += Math.max(0, mix[c.id] ?? 0);
  const pen = tam > 0 ? p.mau / tam : 1;
  let acq = 0;
  for (const c of B.channels) {
    // A degenerate/empty mix falls back to 100% Paid Ads so the budget always buys
    // users (never silently burns Money for nothing).
    const w = totalW > 0 ? Math.max(0, mix[c.id] ?? 0) / totalW : c.id === "ads" ? 1 : 0;
    if (w <= 0) continue;
    const cac = B.marketingCacBase * c.cacMult * (1 + pen * B.cacSaturation * c.satMult);
    if (cac > 0) acq += (p.marketingPerSec * w) / cac;
  }
  return acq;
}

/** Suggest a sensible channel split for a product right now: weight each channel
 *  by its acquisition efficiency (1 / effective CAC) at the current market
 *  penetration, normalised so the strongest channel sits at 1.0 (the slider max).
 *  Cheap channels lead early; as they saturate, budget naturally shifts to the
 *  ones that keep converting at scale — exactly the "diversify as you grow" advice
 *  the tip gives, but computed. Pure. */
export function suggestChannelMix(p: ProductState, t: ProductTypeDef): Record<string, number> {
  const pen = t.tam > 0 ? clamp(p.mau / t.tam, 0, 1) : 0;
  const eff = B.channels.map((c) => 1 / (c.cacMult * (1 + pen * B.cacSaturation * c.satMult)));
  const max = Math.max(...eff, 1e-9);
  const mix: Record<string, number> = {};
  B.channels.forEach((c, i) => { mix[c.id] = Math.round((eff[i]! / max) * 100) / 100; });
  return mix;
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
  modsById: Record<string, ProductMods> = {},
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
    const mods = modsById[p.id] ?? NEUTRAL_MODS; // employee buffs for THIS product
    const fm = featureMods(p); // per-product purchased features
    const buzz = p.buzzSec > 0;
    const qf = clamp(p.quality / Math.max(frontier, 1e-9), 0, 1); // how competitive you are
    const tam = t.tam * fm.tam; // a Public API etc. enlarges the addressable market
    const sat = Math.max(0, 1 - p.mau / tam); // remaining TAM headroom

    // Acquisition: paid marketing (split across channels) + organic virality.
    const acqMkt = channelAcq(p, tam);
    const acqViral = p.mau * t.virality * qf * sat * (buzz ? B.buzzAcqMult : 1);
    const mau = clamp(p.mau + (acqMkt + acqViral) * mods.acq * fm.acq * seconds, 0, tam);

    // Conversion target across tiers (pricier → fewer convert; Enterprise adds a
    // small premium slice). Free is the non-paying remainder of MAU.
    const econ = tierEconomics(p, t, qf, fm);
    const targetPaid = mau * econ.convRate;

    // Churn rises with staleness (frontier gap) and price; buzz cuts it.
    const gap = Math.max(0, frontier - p.quality);
    const churn = t.baseChurn * (1 + gap * B.stalenessChurn) * p.priceMult * (buzz ? B.buzzChurnMult : 1) * mods.churn * fm.churn;

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
    // Bill on the time-integral of paid, but never on more subscribers than exist
    // now (guards against a tick where an event/feature shrank mau below last paid).
    const billed = Math.min(paidIntegral, mau * seconds);
    const arpu = econ.arpu * mods.arpu;
    const mrr = billed * arpu;
    const serve = billed * t.computePerUser * p.quality * mods.serveCost * fm.serveCost;
    moneyDelta += mrr - serve - p.marketingPerSec * seconds;
    if (paid > 0) heatDelta += t.heatPerSec * fm.heat * mods.heat * seconds;

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
  const fm = featureMods(p);
  const qf = clamp(p.quality / Math.max(frontier, 1e-9), 0, 1);
  const arpu = tierEconomics(p, t, qf, fm).arpu; // blended across Pro + Enterprise
  const mrr = p.paid * arpu;
  const serve = p.paid * t.computePerUser * p.quality * fm.serveCost;
  const gap = Math.max(0, frontier - p.quality);
  const churnPerSec = t.baseChurn * (1 + gap * B.stalenessChurn) * p.priceMult * (p.buzzSec > 0 ? B.buzzChurnMult : 1) * fm.churn;
  return {
    mau: p.mau, paid: p.paid, arpu, mrr, serve,
    margin: mrr - serve - p.marketingPerSec,
    gap, churnPerMin: churnPerSec * 60, qf,
  };
}

// ---------- Milestones (a chase ladder; pure) ----------

/** Current value of a milestone metric across the portfolio (totals / peaks). */
export function milestoneValue(state: GameState, metric: MilestoneDef["metric"]): number {
  const ps = state.products;
  switch (metric) {
    case "users": return ps.active.reduce((s, p) => s + p.mau, 0);
    case "paid": return ps.active.reduce((s, p) => s + p.paid, 0);
    case "mrr": return ps.active.reduce((s, p) => s + productMetrics(p, ps.frontier).mrr, 0);
    case "version": return ps.active.reduce((m, p) => Math.max(m, p.version), 0);
    case "qf": return ps.active.reduce((m, p) => Math.max(m, productMetrics(p, ps.frontier).qf), 0);
    case "live": return ps.active.length;
    case "sold": return ps.sold;
  }
}

export interface MilestoneAchievement { def: MilestoneDef; reward: number; }

/** Award any newly-reached milestones: append their ids and pay the one-time Money
 *  reward. Pure & idempotent (an already-achieved milestone is skipped). Returns the
 *  fresh achievements so the UI can celebrate them. */
export function applyMilestones(state: GameState): { state: GameState; achieved: MilestoneAchievement[] } {
  const have = new Set(state.products.milestones);
  const achieved: MilestoneAchievement[] = [];
  for (const def of productMilestones) {
    if (have.has(def.id)) continue;
    if (milestoneValue(state, def.metric) >= def.threshold) achieved.push({ def, reward: def.reward });
  }
  if (achieved.length === 0) return { state, achieved };
  const reward = achieved.reduce((s, a) => s + a.reward, 0);
  return {
    state: {
      ...state,
      resources: { ...state.resources, money: state.resources.money.add(reward) },
      lifetimeMoney: state.lifetimeMoney.add(reward),
      products: { ...state.products, milestones: [...state.products.milestones, ...achieved.map((a) => a.def.id)] },
    },
    achieved,
  };
}

// ---------- Per-product ops events (pure; RNG passed in) ----------

export interface ProductEventResult {
  state: GameState;
  message: string;
  tone: "good" | "bad";
}

/** Occasionally fire a reactive ops event on one live product (outage, viral spike,
 *  breach…). Deterministic given its rolls (the store supplies Math.random()), like
 *  maybeHeatEvent. One-shot effect (user/sub nudge, maybe Heat); returns the new
 *  state + a toast, or null when nothing fires. */
export function maybeProductEvent(
  state: GameState,
  seconds: number,
  rollFire: number,
  rollPick: number,
  rollEvent: number,
): ProductEventResult | null {
  const ps = state.products;
  const eligible = ps.active.filter((p) => p.mau >= B.events.minMau);
  if (eligible.length === 0) return null;
  const chance = 1 - Math.exp(-B.events.ratePerSec * seconds);
  if (rollFire >= chance) return null;
  const p = eligible[Math.min(eligible.length - 1, Math.floor(rollPick * eligible.length))]!;
  const ev = B.events.list[Math.min(B.events.list.length - 1, Math.floor(rollEvent * B.events.list.length))]!;
  const t = typeDef(p.type);

  const np: ProductState = {
    ...p,
    mau: clamp(p.mau * (ev.mauMult ?? 1), 0, t.tam),
    paid: Math.max(0, Math.min(p.paid * (ev.paidMult ?? 1), p.mau * (ev.mauMult ?? 1))),
    buzzSec: ev.buzz ? B.buzzDurationSec : p.buzzSec,
  };
  const heat = ev.heat ? state.heat + ev.heat : state.heat;
  return {
    state: {
      ...state,
      heat,
      products: { ...ps, active: ps.active.map((x) => (x.id === p.id ? np : x)) },
    },
    message: ev.message.replace("{name}", p.name),
    tone: ev.tone === "good" ? "good" : "bad",
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
    enterprise: false,
    enterprisePrice: 1,
    marketingPerSec: 0,
    channelMix: { ads: 1 },
    mau: 0,
    paid: 0,
    buzzSec: B.buzzDurationSec,
    upgrade: null,
    features: [],
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
  // Commercialising a SHIPPED model is free — it's the reward for shipping. (A
  // ship resets the lab to zero, so charging the heavy release cost here left the
  // player's flagship un-launchable until they re-ground it all back — it felt like
  // shipping gave you nothing.) The portfolio slot cap is the real limiter.
  return true;
}

/** Commercialise a shipped "raw model" draft into an active product: pick its type
 *  + name. Free — you already earned it by shipping. The product starts at the
 *  DRAFT's quality (the strength of the model you shipped), not the frontier. */
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
    enterprise: false,
    enterprisePrice: 1,
    marketingPerSec: 0,
    channelMix: { ads: 1 },
    mau: 0,
    paid: 0,
    buzzSec: B.buzzDurationSec,
    upgrade: null,
    features: [],
  };
  return {
    ...state,
    products: {
      ...state.products,
      active: [...state.products.active, product],
      drafts: state.products.drafts.filter((d) => d.id !== opts.draftId),
    },
    stats: { ...state.stats, productsLaunched: state.stats.productsLaunched + 1 },
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
  modsById: Record<string, ProductMods> = {},
): UpgradeTickResult {
  if (seconds <= 0 || !ps.active.some((p) => p.upgrade)) {
    return { products: ps, computeSpent: 0, dataSpent: 0, completed: [] };
  }
  let cAvail = computeAvail;
  let dAvail = dataAvail;
  let computeSpent = 0;
  let dataSpent = 0;
  const completed: { id: string; name: string; version: number }[] = [];

  const active = ps.active.map((p) => {
    const u = p.upgrade;
    if (!u) return p;
    // ML scientists assigned here make each real second count for more progress.
    const effSeconds = seconds * Math.max(0, (modsById[p.id] ?? NEUTRAL_MODS).upgradeSpeed);
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

/** Open/close the Enterprise tier (no-op if not yet unlocked when opening). */
export function setEnterprise(state: GameState, id: string, on: boolean): GameState {
  if (on && !enterpriseUnlocked(state)) return state;
  return {
    ...state,
    products: {
      ...state.products,
      active: state.products.active.map((x) => (x.id === id ? { ...x, enterprise: on } : x)),
    },
  };
}

export function setEnterprisePrice(state: GameState, id: string, price: number): GameState {
  const p = clamp(price, B.enterprise.priceMin, B.enterprise.priceMax);
  return {
    ...state,
    products: {
      ...state.products,
      active: state.products.active.map((x) => (x.id === id ? { ...x, enterprisePrice: p } : x)),
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

/** Set a marketing-channel weight (0..1) for a product; weights are normalized in
 *  the sim, so they express relative emphasis of the total marketing budget. */
export function setChannelMix(state: GameState, id: string, channelId: string, weight: number): GameState {
  const w = clamp(weight, 0, 1);
  return {
    ...state,
    products: {
      ...state.products,
      active: state.products.active.map((x) =>
        x.id === id ? { ...x, channelMix: { ...x.channelMix, [channelId]: w } } : x,
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
  // Releasing the product frees any employees assigned to it back to the bench.
  const employees = state.employees.some((e) => e.assignedProductId === id)
    ? state.employees.map((e) => (e.assignedProductId === id ? { ...e, assignedProductId: null } : e))
    : state.employees;
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.add(Math.max(0, payout)) },
    lifetimeMoney: state.lifetimeMoney.add(Math.max(0, payout)),
    employees,
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
