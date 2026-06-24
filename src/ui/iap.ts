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
 * ⚠️ The native path can only be exercised once the product exists in App Store
 * Connect AND on a real device with a sandbox account — see DEPLOYMENT.md. It is
 * written against the documented CdvPurchase v13 API and must be verified on
 * device before relying on it; the web stub is what's exercised by our tests.
 */

export const PREMIUM_PRODUCT_ID = "com.wrexist.singularityinc.premium";
export const PREMIUM_PRICE = "$6.99";

// --- Minimal typing for the bits of the (globally-injected) CdvPurchase we use.
// We deliberately DON'T `import "cordova-plugin-purchase"` so the web/Vite build
// never pulls Cordova globals; Capacitor injects `window.CdvPurchase` on device.
interface CdvOffer { order(): Promise<unknown> }
interface CdvProduct { getOffer(): CdvOffer | undefined }
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

function cdv(): CdvPurchaseGlobal | null {
  if (!Capacitor.isNativePlatform()) return null;
  const g = (window as unknown as { CdvPurchase?: CdvPurchaseGlobal }).CdvPurchase;
  return g ?? null;
}

let initPromise: Promise<CdvStore | null> | null = null;

/** Initialize the native store exactly once. Returns null on web/dev. */
function ensureInit(): Promise<CdvStore | null> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const api = cdv();
    if (!api) return null;
    const { store, ProductType, Platform, LogLevel } = api;
    store.verbosity = LogLevel.WARNING;
    store.register([
      { id: PREMIUM_PRODUCT_ID, type: ProductType.NON_CONSUMABLE, platform: Platform.APPLE_APPSTORE },
    ]);
    const sync = () => setPremium(store.owned(PREMIUM_PRODUCT_ID));
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
  })();
  return initPromise;
}

export const iap = {
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
    // Ownership is mirrored by the approved/receiptUpdated handlers above.
    const owned = store.owned(PREMIUM_PRODUCT_ID);
    setPremium(owned);
    return owned;
  },

  /** Restore purchases (App Store requirement). */
  async restore(): Promise<boolean> {
    const store = await ensureInit();
    if (!store) return isPremium();
    try {
      await store.restorePurchases();
    } catch (e) {
      console.warn("IAP restore failed:", e);
    }
    const owned = store.owned(PREMIUM_PRODUCT_ID);
    setPremium(owned);
    return owned;
  },
};
