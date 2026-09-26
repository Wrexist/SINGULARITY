import { Capacitor } from "@capacitor/core";
import { isPremium, setPremium } from "../state/premium";

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
export const PREMIUM_PRICE = "$6.99";

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

export const iap = {
  /** The price to show on the Premium card: StoreKit's localized string on device
   *  once available, else the fallback label. Never throws. */
  async priceLabel(): Promise<string> {
    try {
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
      await ensureInit();
    } catch (e) {
      console.warn("IAP init failed (will retry on next purchase/restore):", e);
    }
  },

  /** Is the premium unlock owned? */
  isPremium(): boolean {
    return isPremium();
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
    const store = await ensureInit();
    if (!store) return isPremium();
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
    if (isPremium()) return true;
    // Nothing owned AND StoreKit never answered: say so (the sheet shows "Store
    // unreachable") instead of "No previous purchase found for this Apple ID".
    if (failure) throw new Error("StoreKit restore failed");
    return false;
  },
};
