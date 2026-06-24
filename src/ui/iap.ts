import { Capacitor } from "@capacitor/core";

/**
 * Premium unlock IAP — abstraction layer (GDD §9: a single generous premium
 * unlock, cosmetic/QoL only, never gameplay power).
 *
 * For now this is a local stub so the rest of the app can read `isPremium()`
 * and call `purchasePremium()` against a stable interface. The NATIVE purchase
 * path (StoreKit via a Capacitor IAP plugin) gets wired in once the product is
 * created in App Store Connect — see DEPLOYMENT.md §1. Keeping it behind this
 * interface means the UI never changes when the real store is connected.
 */

export const PREMIUM_PRODUCT_ID = "com.wrexist.singularityinc.premium";

const KEY = "singularity.premium.v1";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function write(v: boolean): void {
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export const iap = {
  /** Is the premium unlock owned? (Local flag until StoreKit is wired.) */
  isPremium(): boolean {
    return read();
  },

  /** True on a real device where a native store could exist. */
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  },

  /**
   * Buy the premium unlock. STUB: on native this must call StoreKit via the IAP
   * plugin; on web/dev it grants locally so the unlock UI is testable. Returns
   * whether the entitlement is now owned.
   */
  async purchasePremium(): Promise<boolean> {
    // TODO(native): replace with a real StoreKit purchase once the product is
    // live in App Store Connect and an IAP plugin is added.
    write(true);
    return true;
  },

  /** Restore purchases (App Store requirement). STUB until StoreKit is wired. */
  async restore(): Promise<boolean> {
    return read();
  },
};
