import { Capacitor } from "@capacitor/core";
import { isPremium, setPremium, hasPro, setProUntil, proUntil, setProWillRenew } from "../state/premium";
import type { RevenueCatStore, Plan, PlanId, ProStatus } from "./iapRevenueCat";

export type { Plan, PlanId, PlanOffer } from "./iapRevenueCat";

/**
 * Premium unlock IAP (GDD §9: a single generous unlock, cosmetic/QoL only, never
 * gameplay power).
 *
 * Two paths behind one stable interface:
 *  - NATIVE (iOS device): real StoreKit via cordova-plugin-purchase (CdvPurchase
 *    v13). Self-contained, on-device — no third-party billing backend, matching
 *    this project's lean/no-extra-service stance.
 *  - WEB / DEV: a local stub so the unlock UI stays fully testable in the browser
 *    and in CI/screenshot tooling (no native bridge there).
 *
 * The entitlement itself lives in state/premium so the engine/store can read it
 * without importing UI.
 *
 * NOTE: The native path can only be exercised once the product exists in App Store
 * Connect AND on a real device with a sandbox account — see DEPLOYMENT.md. It is
 * written against the documented CdvPurchase v13 API and must be verified on
 * device before relying on it; the web stub is what's exercised by our tests.
 */

export const PREMIUM_PRODUCT_ID = "com.wrexist.singularityinc.premium";
/** Fallback label only (web/dev, or before StoreKit has answered). On device the
 *  card shows StoreKit's localized price — a hardcoded "$6.99" told a player in
 *  the UK, EU or Japan a price StoreKit would not actually charge them. */
export const PREMIUM_PRICE = "$39.99";

/** Web/dev placeholder plans (no store there). On a device every price comes from
 *  the store — these strings are never shown to a real buyer. */
export const WEB_PLANS: readonly Plan[] = [
  { id: "annual", priceString: "$24.99", periodLabel: "year", trialDays: 7, perWeekString: "$0.48" },
  { id: "weekly", priceString: "$4.99", periodLabel: "week", trialDays: 7 },
  { id: "lifetime", priceString: PREMIUM_PRICE, periodLabel: "once", trialDays: null },
];

const DAY_MS = 24 * 3_600_000;

/** Web/dev only: localStorage "singularity.dev.offers" = "1" shows placeholder win-back
 *  and exit offers, so those screens can be exercised without a store. A device never
 *  reads it (it only touches the web stub's plans). */
const DEV_OFFERS_KEY = "singularity.dev.offers";
function devOffers(): boolean {
  try { return localStorage.getItem(DEV_OFFERS_KEY) === "1"; } catch { return false; }
}

/** Web/dev placeholder plans for a placement. */
function webPlans(placement?: string): Plan[] {
  const plans = WEB_PLANS.map((p) => ({ ...p }));
  if (!devOffers()) return plans;
  if (placement === "winback") {
    for (const p of plans) if (p.id === "annual") { p.offer = { priceString: "$12.49", periods: 1, unit: "year" }; p.trialDays = null; }
    return plans;
  }
  if (placement === "exit") {
    return [{ id: "annual", priceString: "$14.99", periodLabel: "year", trialDays: 7, perWeekString: "$0.29" }];
  }
  return plans;
}

/** Mirror one RevenueCat snapshot into the local entitlement. The lifetime flag is
 *  grant-only; the subscription expiry follows the store, so a lapse clears it. */
function applyStatus(st: ProStatus): void {
  if (st.lifetime) setPremium(true);
  setProUntil(st.until);
  setProWillRenew(st.willRenew);
}

// --- Minimal typing for the bits of the (globally-injected) CdvPurchase we use.
// We deliberately DON'T `import "cordova-plugin-purchase"` so the web/Vite build
// never pulls Cordova globals; Capacitor injects `window.CdvPurchase` on device.
interface CdvOffer { order(): Promise<unknown> }
interface CdvProduct { getOffer(): CdvOffer | undefined; readonly pricing?: { price?: string } }
interface CdvTransaction { finish(): void }
interface CdvWhen {
  approved(cb: (t: CdvTransaction) => void): CdvWhen;
  receiptUpdated(cb: () => void): CdvWhen;
  productUpdated(cb: () => void): CdvWhen;
}
interface CdvStore {
  verbosity: number;
  register(products: Array<{ id: string; type: string; platform: string }>): void;
  when(): CdvWhen;
  error(cb: (e: unknown) => void): void;
  initialize(platforms: string[]): Promise<void>;
  restorePurchases(): Promise<unknown>;
  get(id: string, platform?: string): CdvProduct | undefined;
  owned(id: string): boolean;
}
interface CdvPurchaseGlobal {
  store: CdvStore;
  ProductType: { NON_CONSUMABLE: string };
  Platform: { APPLE_APPSTORE: string };
  LogLevel: { WARNING: number };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How long a device waits for cordova.js to map the StoreKit bridge onto `window`. */
const BRIDGE_WAIT_MS = 3000;

/**
 * The StoreKit bridge, or null off-device (web/dev). On a device a missing global is NOT
 * the web build: cordova.js maps `CdvPurchase` at DOMContentLoaded, which can land after
 * the launch effect's refresh(). Reading that as "web" cached a null store for the whole
 * session, so Buy took the web stub (free Premium on a real device) and Restore never
 * asked StoreKit. Wait for the bridge briefly instead, and fail (uncached) without it.
 */
async function cdv(): Promise<CdvPurchaseGlobal | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const deadline = Date.now() + BRIDGE_WAIT_MS;
  for (;;) {
    const g = (window as unknown as { CdvPurchase?: CdvPurchaseGlobal }).CdvPurchase;
    if (g) return g;
    if (Date.now() >= deadline) throw new Error("StoreKit bridge (CdvPurchase) is not available");
    await delay(100);
  }
}

let initPromise: Promise<CdvStore | null> | null = null;

/** Initialize the native store exactly once. Returns null on web/dev only; on a
 *  device it resolves to the store or rejects (never the web stub's null). */
function ensureInit(): Promise<CdvStore | null> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const api = await cdv();
    if (!api) return null;
    const { store, ProductType, Platform, LogLevel } = api;
    store.verbosity = LogLevel.WARNING;
    store.register([
      { id: PREMIUM_PRODUCT_ID, type: ProductType.NON_CONSUMABLE, platform: Platform.APPLE_APPSTORE },
    ]);
    // Grant-only. CdvPurchase's owned() is false at launch until receipts load and,
    // with no receipt validator (this app has none), it can stay false for a product
    // bought in an earlier session: its docs say to persist non-consumable ownership
    // ourselves. Writing that false into the flag took Premium away from paying
    // players on every launch, so a false read means "not known yet", never "revoked".
    const sync = () => { if (store.owned(PREMIUM_PRODUCT_ID)) setPremium(true); };
    // No server receipt validator (single non-consumable) → approve & finish
    // locally, then mirror ownership into our entitlement flag.
    store.when()
      .approved((t) => t.finish())
      .receiptUpdated(sync)
      .productUpdated(sync);
    store.error((e) => console.warn("IAP error:", e));
    await store.initialize([Platform.APPLE_APPSTORE]);
    sync();
    return store;
  })().catch((e) => {
    // Don't cache a rejected init — a transient StoreKit/network failure must not
    // permanently block future buy/restore attempts.
    initPromise = null;
    throw e;
  });
  return initPromise;
}

/**
 * Wait for ownership to settle after an order/restore. CdvPurchase mirrors
 * ownership via async approved/receiptUpdated callbacks, so reading owned()
 * immediately can miss a just-completed transaction. Poll briefly.
 */
async function settleOwnership(store: CdvStore, timeoutMs = 1500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (store.owned(PREMIUM_PRODUCT_ID)) return true;
    await delay(150);
  }
  return store.owned(PREMIUM_PRODUCT_ID);
}

/** StoreKit's localized price string for Premium, or null when unknown. */
function storePrice(store: CdvStore | null): string | null {
  try {
    const p = store?.get(PREMIUM_PRODUCT_ID)?.pricing?.price;
    return typeof p === "string" && p.trim() ? p : null;
  } catch {
    return null;
  }
}

// --- RevenueCat path (native, when the build carries a key; see iapRevenueCat.ts).
// Loaded lazily so the web build and the StoreKit-path tests never touch the plugin.
/** The public iOS SDK key baked into this build (VITE_RC_IOS_KEY), or null.
 *  A Test Store key (test_…) simulates purchases and the native SDK crashes a Release
 *  build configured with one, so it is honoured only in a non-production bundle
 *  (`npm run cap:sync:dev`, Xcode Debug); a production bundle ignores it and keeps
 *  the direct StoreKit path, so a mis-set secret can never reach players. */
export function revenueCatKey(): string | null {
  const k = import.meta.env?.VITE_RC_IOS_KEY;
  if (typeof k !== "string" || !k.trim()) return null;
  const key = k.trim();
  if (isTestStoreKey(key) && import.meta.env?.MODE === "production") {
    console.warn("RevenueCat Test Store key ignored in a production build.");
    return null;
  }
  return key;
}

/** RevenueCat Test Store keys start with "test_" (App Store keys with "appl_"). */
export function isTestStoreKey(key: string): boolean {
  return key.startsWith("test_");
}

let rcPromise: Promise<RevenueCatStore | null> | null = null;

function ensureRevenueCat(): Promise<RevenueCatStore | null> {
  if (rcPromise) return rcPromise;
  rcPromise = (async () => {
    if (!Capacitor.isNativePlatform()) return null;
    const key = revenueCatKey();
    if (!key) return null;
    const rc = await import("./iapRevenueCat");
    return rc.createRevenueCatStore(key, PREMIUM_PRODUCT_ID, applyStatus);
  })().catch((e) => {
    rcPromise = null; // a transient failure must not block later attempts
    throw e;
  });
  return rcPromise;
}

export const iap = {
  /** The price to show on the Premium card: StoreKit's localized string on device
   *  once available, else the fallback label. Never throws. */
  async priceLabel(): Promise<string> {
    try {
      const rc = await ensureRevenueCat();
      if (rc) return (await rc.price()) ?? PREMIUM_PRICE;
      return storePrice(await ensureInit()) ?? PREMIUM_PRICE;
    } catch {
      return PREMIUM_PRICE;
    }
  },

  /**
   * Re-sync ownership from StoreKit at app launch (native only): when StoreKit
   * reports the non-consumable owned, the local flag is granted, so premium can come
   * back after a reinstall / on a new device without tapping Restore. It never
   * revokes (see the grant-only sync in ensureInit). No-op on web/dev.
   */
  async refresh(): Promise<void> {
    // Fire-and-forget at app launch: a StoreKit/network failure here must never
    // surface as an unhandled rejection (the caller `void`s this) — log only.
    // Buy/restore call ensureInit() themselves, so a later attempt still retries.
    try {
      if (!(await ensureRevenueCat())) await ensureInit();
    } catch (e) {
      console.warn("IAP init failed (will retry on next purchase/restore):", e);
    }
  },

  /**
   * Ask the store again whether the subscription is active — for when the stored
   * expiry passes on the device clock (a renewal reaches the device only when the
   * store next answers). Without RevenueCat the passed expiry is final. Never throws.
   */
  async syncStatus(): Promise<void> {
    try {
      const rc = await ensureRevenueCat();
      if (rc) { await rc.refreshStatus(); return; }
      // No store here can renew a subscription (direct StoreKit sells lifetime only;
      // web/dev is a stub): an expiry that passed is the answer.
      if (!hasPro() && proUntil() > 0) setProUntil(null);
    } catch (e) {
      console.warn("IAP status sync failed:", e);
    }
  },

    /** Is the lifetime unlock (the original Premium) owned? */
  isPremium(): boolean {
    return isPremium();
  },

  /** Is Pro active (lifetime, or a live subscription)? */
  hasPro(): boolean {
    return hasPro();
  },

  /** The live subscription's expiry (ms epoch), or 0 — for the Settings card. */
  proUntil(): number {
    return proUntil();
  },

  /**
   * The plans on sale, in display order (yearly, weekly, lifetime — as offered).
   * RevenueCat builds read the current offering; the direct StoreKit path sells the
   * lifetime unlock only; web/dev shows placeholders. Never throws: a store that
   * cannot answer yields an empty list (the paywall says so).
   */
  async plans(placement?: string): Promise<Plan[]> {
    try {
      const rc = await ensureRevenueCat();
      if (rc) return await rc.plans(placement);
      const store = await ensureInit();
      if (!store) return webPlans(placement);
      const price = storePrice(store);
      return price ? [{ id: "lifetime", priceString: price, periodLabel: "once", trialDays: null }] : [];
    } catch (e) {
      console.warn("IAP plans unavailable:", e);
      return [];
    }
  },

  /**
   * Buy a plan. Resolves true when Pro is active afterwards; false on a cancel (or a
   * plan this build cannot sell). Web/dev grants locally so the flow is testable.
   */
  async purchasePlan(id: PlanId, placement?: string): Promise<boolean> {
    const rc = await ensureRevenueCat();
    if (rc) return (await rc.buyPlan(id, placement)) || hasPro();
    if (id === "lifetime") return (await iap.purchasePremium()) || hasPro();
    const store = await ensureInit();
    if (store) return hasPro(); // direct StoreKit path sells the lifetime unlock only
    setProUntil(Date.now() + (id === "annual" ? 365 : 7) * DAY_MS);
    return hasPro();
  },

  /**
   * Present the paywall designed in the RevenueCat dashboard, when the current offering
   * opts in (metadata {"paywall": "revenuecat"}). Resolves true once the player has seen
   * it through (bought, restored or closed it); false when it did not come up or ended
   * in an error — web/dev, a build without RevenueCat, an offering that keeps the in-app
   * paywall, a missing dashboard paywall — so the caller shows ours instead.
   */
  async presentNativePaywall(placement?: string): Promise<boolean> {
    try {
      const rc = await ensureRevenueCat();
      if (!rc) return false;
      const outcome = await rc.presentPaywall(placement);
      // Shown and finished (bought, restored or closed by the player). An error or a
      // paywall that never came up falls back to ours: the player always gets one.
      return outcome === "purchased" || outcome === "restored" || outcome === "closed";
    } catch (e) {
      console.warn("RevenueCat paywall unavailable:", e);
      return false;
    }
  },

  /**
   * Is a one-time exit offer set up? RevenueCat: an "exit" placement offering distinct
   * from the current one (dashboard → Targeting). No offer → nothing extra ever shows.
   * The direct StoreKit path has none; web/dev only with the dev flag. Never throws.
   */
  async exitOfferAvailable(): Promise<boolean> {
    try {
      const rc = await ensureRevenueCat();
      if (rc) return await rc.hasExitOffer();
      return !(await ensureInit()) && devOffers();
    } catch {
      return false;
    }
  },

  /** Can this build open RevenueCat's Customer Center (native + RevenueCat)? */
  async canManageSubscription(): Promise<boolean> {
    try {
      return !!(await ensureRevenueCat());
    } catch {
      return false;
    }
  },

  /** Open RevenueCat's Customer Center: manage or cancel the plan, request a refund,
   *  restore. Throws when it cannot open (the caller says so in one line). */
  async manageSubscription(): Promise<void> {
    const rc = await ensureRevenueCat();
    if (!rc) throw new Error("Customer Center needs the RevenueCat build");
    await rc.presentCustomerCenter();
  },

  /** True on a real device where a native store could exist. */
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  },

  /**
   * Buy the premium unlock. Native → StoreKit order; web/dev → local grant so
   * the unlock UI is testable. Resolves true once the entitlement is owned.
   */
  async purchasePremium(): Promise<boolean> {
    const rc = await ensureRevenueCat();
    if (rc) return (await rc.buy()) || isPremium();
    const store = await ensureInit();
    if (!store) {
      // Web/dev stub: grant locally so the flow is exercisable without a device.
      setPremium(true);
      return true;
    }
    const offer = store.get(PREMIUM_PRODUCT_ID)?.getOffer();
    if (!offer) return false;
    try {
      await offer.order();
    } catch (e) {
      console.warn("IAP purchase failed/cancelled:", e);
      return isPremium();
    }
    // Ownership is mirrored asynchronously by the approved/receiptUpdated
    // handlers — wait for it to settle so we don't report a false negative.
    if (await settleOwnership(store)) setPremium(true);
    return isPremium();
  },

  /** Restore purchases (App Store requirement). */
  async restore(): Promise<boolean> {
    const rc = await ensureRevenueCat();
    if (rc) {
      let owned = false;
      try {
        owned = await rc.restore();
      } catch (e) {
        console.warn("IAP restore failed:", e);
        if (hasPro()) return true;
        throw new Error("RevenueCat restore failed");
      }
      return owned || hasPro();
    }
    const store = await ensureInit();
    if (!store) return hasPro();
    // CdvPurchase reports a failed restore by RESOLVING with an IError, not by throwing.
    let failure: unknown = null;
    try {
      failure = (await store.restorePurchases()) ?? null;
    } catch (e) {
      failure = e ?? new Error("restore failed");
    }
    if (failure) console.warn("IAP restore failed:", failure);
    // Same grant-only rule as the launch sync: a restore that replays nothing leaves a
    // Premium already on this device in place.
    if (await settleOwnership(store)) setPremium(true);
    if (hasPro()) return true;
    // Nothing owned AND StoreKit never answered: say so (the sheet shows "Store
    // unreachable") instead of "No previous purchase found for this Apple ID".
    if (failure) throw new Error("StoreKit restore failed");
    return false;
  },
};
