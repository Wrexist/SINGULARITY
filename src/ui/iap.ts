import { Capacitor } from "@capacitor/core";
import { isPremium, setPremium } from "../state/premium";

/**
 * Premium unlock IAP — abstraction layer (GDD §9: a single generous premium
 * unlock, cosmetic/QoL only, never gameplay power).
 *
 * For now the purchase is a local STUB so the unlock UI is fully testable. The
 * NATIVE path (StoreKit via a Capacitor IAP plugin) wires in once the product is
 * live in App Store Connect — see DEPLOYMENT.md. The entitlement itself lives in
 * state/premium so the engine/store can read it without importing UI.
 */

export const PREMIUM_PRODUCT_ID = "com.wrexist.singularityinc.premium";
export const PREMIUM_PRICE = "$6.99";

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
   * Buy the premium unlock. STUB: on native this must call StoreKit via the IAP
   * plugin; on web/dev it grants locally so the unlock UI is testable.
   */
  async purchasePremium(): Promise<boolean> {
    // TODO(native): real StoreKit purchase once the product is live in ASC.
    setPremium(true);
    return true;
  },

  /** Restore purchases (App Store requirement). STUB until StoreKit is wired. */
  async restore(): Promise<boolean> {
    return isPremium();
  },
};
