import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import type { CustomerInfo, PurchasesStoreProduct } from "@revenuecat/purchases-capacitor";

/**
 * RevenueCat backend for the Premium unlock (native iOS only). iap.ts picks it when
 * the build carries a RevenueCat public iOS SDK key (VITE_RC_IOS_KEY, injected by
 * CI from a repo secret); without one the app keeps its direct StoreKit path, so a
 * build that is missing the key still sells and restores Premium.
 *
 * RevenueCat is the source of truth for the purchase itself (receipt validation,
 * restore across devices, revenue reporting). The local flag in state/premium stays
 * the entitlement the game reads, with the same grant-only rule as the StoreKit path:
 * a "not owned" answer never takes Premium away from a player.
 */

/** Entitlement identifier in the RevenueCat project (Product catalog → Entitlements). */
export const RC_ENTITLEMENT_ID = "premium";

/** Does this customer own Premium? The entitlement, or the raw product id as a
 *  fallback so a purchase still counts before the entitlement is attached. */
export function ownsPremium(info: CustomerInfo | null | undefined, productId: string): boolean {
  if (!info) return false;
  if (info.entitlements?.active?.[RC_ENTITLEMENT_ID]) return true;
  return (info.allPurchasedProductIdentifiers ?? []).includes(productId);
}

export interface RevenueCatStore {
  /** Localized price string, or null while unknown. */
  price(): Promise<string | null>;
  /** Buy; true when Premium is owned afterwards. Resolves false on cancel. */
  buy(): Promise<boolean>;
  /** Restore; true when Premium is owned afterwards. Throws when the store never answered. */
  restore(): Promise<boolean>;
}

export async function createRevenueCatStore(
  apiKey: string,
  productId: string,
  grant: () => void,
): Promise<RevenueCatStore> {
  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  await Purchases.configure({ apiKey });

  const sync = (info: CustomerInfo | null | undefined) => {
    if (ownsPremium(info, productId)) grant();
  };
  await Purchases.addCustomerInfoUpdateListener(sync);
  sync((await Purchases.getCustomerInfo()).customerInfo);

  let product: PurchasesStoreProduct | null = null;
  const loadProduct = async (): Promise<PurchasesStoreProduct | null> => {
    if (product) return product;
    const { products } = await Purchases.getProducts({ productIdentifiers: [productId] });
    product = products.find((p) => p.identifier === productId) ?? null;
    return product;
  };

  return {
    async price() {
      try {
        const p = (await loadProduct())?.priceString;
        return typeof p === "string" && p.trim() ? p : null;
      } catch {
        return null;
      }
    },
    async buy() {
      const p = await loadProduct();
      if (!p) return false;
      try {
        const { customerInfo } = await Purchases.purchaseStoreProduct({ product: p });
        sync(customerInfo);
        return ownsPremium(customerInfo, productId);
      } catch (e) {
        // A cancelled sheet is not an error worth surfacing.
        if (!(e as { userCancelled?: boolean })?.userCancelled) console.warn("IAP purchase failed:", e);
        return false;
      }
    },
    async restore() {
      const { customerInfo } = await Purchases.restorePurchases();
      sync(customerInfo);
      return ownsPremium(customerInfo, productId);
    },
  };
}
