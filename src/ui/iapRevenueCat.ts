import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import type { CustomerInfo, PurchasesOffering, PurchasesPackage, PurchasesStoreProduct, PurchasesWinBackOffer } from "@revenuecat/purchases-capacitor";

/**
 * RevenueCat backend for Pro (native iOS only). iap.ts picks it when the build carries
 * a RevenueCat public iOS SDK key (VITE_RC_IOS_KEY, injected by CI from a repo secret);
 * without one the app keeps its direct StoreKit path, which sells the lifetime unlock
 * only, so a build missing the key still sells and restores it.
 *
 * All three products (yearly, weekly, lifetime) attach to ONE entitlement, "pro", and
 * sit as packages ($rc_annual, $rc_weekly, $rc_lifetime) in the current offering.
 * RevenueCat is the source of truth for the purchase itself (receipt validation,
 * restore across devices, revenue reporting). Locally, the game reads state/premium:
 *  - the lifetime flag stays GRANT-ONLY: a "not owned" answer never takes it away;
 *  - a subscription is mirrored as its expiry, and CAN lapse: customer info with no
 *    active entitlement and no lifetime purchase clears it.
 */

/** Entitlement identifier in the RevenueCat project (Product catalog → Entitlements). */
export const RC_ENTITLEMENT_ID = "pro";

export const PRO_YEARLY_ID = "com.wrexist.singularityinc.pro.yearly";
export const PRO_WEEKLY_ID = "com.wrexist.singularityinc.pro.weekly";

export type PlanId = "annual" | "weekly" | "lifetime";

/** Offering metadata key that hands the paywall to RevenueCat: set {"paywall": "revenuecat"}
 *  on the current offering (dashboard → Offerings → metadata) to present the paywall built
 *  in RevenueCat's editor instead of the in-app one. Absent/anything else keeps ours, so a
 *  dashboard change switches it (and back) with no app update. */
export const PAYWALL_METADATA_KEY = "paywall";

/** How a RevenueCat-presented paywall ended. */
export type PaywallOutcome = "purchased" | "restored" | "closed" | "error" | "not_presented";

/** PAYWALL_RESULT (a string enum in the plugin), compared by value. */
export function paywallOutcome(result: string | undefined): PaywallOutcome {
  switch (result) {
    case "PURCHASED": return "purchased";
    case "RESTORED": return "restored";
    case "ERROR": return "error";
    case "NOT_PRESENTED": return "not_presented";
    default: return "closed"; // CANCELLED
  }
}

/** Does this offering's metadata ask for RevenueCat's paywall? Pure. */
export function wantsRevenueCatPaywall(metadata: Record<string, unknown> | null | undefined): boolean {
  const v = metadata?.[PAYWALL_METADATA_KEY];
  return typeof v === "string" && v.trim().toLowerCase() === "revenuecat";
}

export interface Plan {
  id: PlanId;
  /** Store-localized price ("$24.99", "249,00 kr"). */
  priceString: string;
  periodLabel: "year" | "week" | "once";
  /** Free-trial length in days when this customer is offered one, else null. */
  trialDays: number | null;
  /** Localized per-week equivalent (yearly only). */
  perWeekString?: string;
  /** A discounted start this customer is eligible for (an App Store win-back offer):
   *  the first `periods` × `unit` at `priceString`, then the regular price. */
  offer?: PlanOffer;
}

export interface PlanOffer {
  priceString: string;
  periods: number;
  unit: "day" | "week" | "month" | "year";
}

/** A store discount → PlanOffer (null when the shape is not understood). Pure. */
export function planOfferOf(d: { priceString?: string; periodUnit?: string; periodNumberOfUnits?: number; cycles?: number } | null | undefined): PlanOffer | null {
  if (!d || typeof d.priceString !== "string" || !d.priceString.trim()) return null;
  const unit = (d.periodUnit ?? "").toLowerCase();
  if (unit !== "day" && unit !== "week" && unit !== "month" && unit !== "year") return null;
  const per = typeof d.periodNumberOfUnits === "number" && d.periodNumberOfUnits > 0 ? d.periodNumberOfUnits : 1;
  const cycles = typeof d.cycles === "number" && d.cycles > 0 ? d.cycles : 1;
  return { priceString: d.priceString, periods: per * cycles, unit };
}

/** What one customer-info snapshot says about Pro. */
export interface ProStatus {
  /** The lifetime product is owned (grant the permanent flag). */
  lifetime: boolean;
  /** An active subscription's expiry (ms epoch), or null when none is active. */
  until: number | null;
  /** Pro is active by this snapshot, by any route. */
  active: boolean;
  /** The subscription is set to renew (false once cancelled; true when unknown). */
  willRenew: boolean;
}

/** Read Pro out of RevenueCat customer info. Pure. The raw lifetime product id counts
 *  as a fallback, so a purchase still grants before the entitlement is attached. */
export function proStatus(info: CustomerInfo | null | undefined, lifetimeId: string): ProStatus {
  if (!info) return { lifetime: false, until: null, active: false, willRenew: true };
  const ent = info.entitlements?.active?.[RC_ENTITLEMENT_ID];
  const purchased = info.allPurchasedProductIdentifiers ?? [];
  const lifetime = purchased.includes(lifetimeId) || (!!ent && ent.productIdentifier === lifetimeId);
  let until: number | null = null;
  if (ent && !lifetime) {
    const ms = typeof ent.expirationDateMillis === "number" ? ent.expirationDateMillis
      : ent.expirationDate ? Date.parse(ent.expirationDate) : NaN;
    if (Number.isFinite(ms) && ms > 0) until = ms;
  }
  // An active entitlement with no expiry and no lifetime product (a promotional
  // lifetime grant from the dashboard) is Pro forever too.
  const lifetimeGrant = !!ent && !lifetime && until === null && ent.expirationDate == null;
  return {
    lifetime: lifetime || lifetimeGrant,
    until,
    active: lifetime || lifetimeGrant || until !== null,
    willRenew: !ent || ent.willRenew !== false,
  };
}

/** Kept for callers that only care about the lifetime unlock. */
export function ownsPremium(info: CustomerInfo | null | undefined, productId: string): boolean {
  return proStatus(info, productId).lifetime;
}

/** Days in one intro period ("P1W" → 7). Null when the period is not understood. */
export function introDays(unit: string | undefined, count: number | undefined): number | null {
  const n = typeof count === "number" && Number.isFinite(count) && count > 0 ? count : 1;
  switch ((unit ?? "").toUpperCase()) {
    case "DAY": return n;
    case "WEEK": return 7 * n;
    case "MONTH": return 30 * n;
    case "YEAR": return 365 * n;
    default: return null;
  }
}

/** Free-trial days a product advertises (intro price of 0), or null. */
export function trialDaysOf(product: PurchasesStoreProduct | null | undefined): number | null {
  const intro = product?.introPrice;
  if (!intro || intro.price !== 0) return null;
  return introDays(intro.periodUnit, intro.periodNumberOfUnits);
}

export interface RevenueCatStore {
  /** Localized lifetime price string, or null while unknown. */
  price(): Promise<string | null>;
  /** The plans a placement's offering sells (annual, weekly, lifetime — as present).
   *  "winback" also attaches each plan's eligible App Store win-back offer. */
  plans(placement?: string): Promise<Plan[]>;
  /** Buy the lifetime unlock; true when Pro is active afterwards. False on cancel. */
  buy(): Promise<boolean>;
  /** Buy a plan from a placement's offering (with its win-back offer, if one was
   *  shown); true when Pro is active afterwards. Resolves false on cancel. */
  buyPlan(id: PlanId, placement?: string): Promise<boolean>;
  /** Has the dashboard set up a one-time exit offer — an "exit" placement offering
   *  distinct from the current one? */
  hasExitOffer(): Promise<boolean>;
  /** Restore; true when Pro is active afterwards. Throws when the store never answered. */
  restore(): Promise<boolean>;
  /** Re-read customer info now (e.g. when a stored expiry passes: did it renew?). */
  refreshStatus(): Promise<void>;
  /** Present the dashboard paywall when the current offering opts in (see
   *  PAYWALL_METADATA_KEY). Null when it does not (show the in-app paywall instead). */
  presentPaywall(placement?: string): Promise<PaywallOutcome | null>;
  /** Present RevenueCat's Customer Center (manage / cancel / refund / restore), then
   *  re-read customer info so a change made there lands at once. */
  presentCustomerCenter(): Promise<void>;
}

/** INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE, by value. */
const INELIGIBLE = 1;

const cancelled = (e: unknown) => !!(e as { userCancelled?: boolean } | null)?.userCancelled;

export async function createRevenueCatStore(
  apiKey: string,
  productId: string,
  apply: (status: ProStatus) => void,
): Promise<RevenueCatStore> {
  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  await Purchases.configure({ apiKey });

  const sync = (info: CustomerInfo | null | undefined): boolean => {
    const st = proStatus(info, productId);
    if (info) apply(st);
    return st.active;
  };
  await Purchases.addCustomerInfoUpdateListener(sync);
  sync((await Purchases.getCustomerInfo()).customerInfo);

  /** Re-read customer info (the update listener also fires, but not on every path). */
  const resync = async (): Promise<void> => {
    try {
      sync((await Purchases.getCustomerInfo()).customerInfo);
    } catch (e) {
      console.warn("RevenueCat customer info unavailable:", e);
    }
  };

  let product: PurchasesStoreProduct | null = null;
  const loadProduct = async (): Promise<PurchasesStoreProduct | null> => {
    if (product) return product;
    const { products } = await Purchases.getProducts({ productIdentifiers: [productId] });
    product = products.find((p) => p.identifier === productId) ?? null;
    return product;
  };

  /** A placement's offering (RevenueCat Targeting), else the current offering. */
  const offeringFor = async (placement?: string): Promise<PurchasesOffering | null> => {
    if (placement) {
      try {
        const o = await Purchases.getCurrentOfferingForPlacement({ placementIdentifier: placement });
        if (o) return o;
      } catch {
        /* an older SDK / no placement → the current offering */
      }
    }
    return (await Purchases.getOfferings()).current ?? null;
  };

  /** A placement's packages by plan id (lifetime falls back to the product). */
  const loadPackages = async (placement?: string): Promise<Partial<Record<PlanId, PurchasesPackage>>> => {
    const out: Partial<Record<PlanId, PurchasesPackage>> = {};
    try {
      const current = await offeringFor(placement);
      // Compared by value (PACKAGE_TYPE's string members) so this module needs no
      // runtime enum from the plugin.
      for (const p of current?.availablePackages ?? []) {
        const t = p.packageType as string;
        if (t === "ANNUAL" && !out.annual) out.annual = p;
        else if (t === "WEEKLY" && !out.weekly) out.weekly = p;
        else if (t === "LIFETIME" && !out.lifetime) out.lifetime = p;
      }
    } catch (e) {
      console.warn("RevenueCat offerings unavailable:", e);
    }
    return out;
  };

  /** Has this customer already used the intro offer? Unknown counts as eligible:
   *  StoreKit's own payment sheet states the real terms before anything is charged. */
  const ineligible = async (ids: string[]): Promise<Set<string>> => {
    const out = new Set<string>();
    if (ids.length === 0) return out;
    try {
      const map = await Purchases.checkTrialOrIntroductoryPriceEligibility({ productIdentifiers: ids });
      for (const id of ids) {
        if ((map?.[id]?.status as number | undefined) === INELIGIBLE) out.add(id);
      }
    } catch {
      /* unknown → keep the advertised trial */
    }
    return out;
  };

  /** The win-back offer shown on each plan (purchased with it), by placement. */
  const winBack = new Map<PlanId, PurchasesWinBackOffer>();
  const eligibleWinBack = async (p: PurchasesPackage): Promise<PurchasesWinBackOffer | null> => {
    try {
      const { eligibleWinBackOffers } = await Purchases.getEligibleWinBackOffersForPackage({ aPackage: p });
      return eligibleWinBackOffers?.[0] ?? null;
    } catch {
      return null; // before iOS 18, or none configured: the regular price
    }
  };

  const purchase = async (run: () => Promise<{ customerInfo: CustomerInfo }>): Promise<boolean> => {
    try {
      const { customerInfo } = await run();
      return sync(customerInfo);
    } catch (e) {
      // A cancelled sheet is not an error worth surfacing.
      if (!cancelled(e)) console.warn("IAP purchase failed:", e);
      return false;
    }
  };

  const price = async (): Promise<string | null> => {
    try {
      const p = (await loadProduct())?.priceString;
      return typeof p === "string" && p.trim() ? p : null;
    } catch {
      return null;
    }
  };
  const buyLifetime = async (): Promise<boolean> => {
    const p = await loadProduct();
    if (!p) return false;
    return purchase(() => Purchases.purchaseStoreProduct({ product: p }));
  };

  return {
    price,
    async plans(placement) {
      const pkgs = await loadPackages(placement);
      const subs = [pkgs.annual, pkgs.weekly].filter((p): p is PurchasesPackage => !!p);
      const noTrial = await ineligible(subs.map((p) => p.product.identifier));
      winBack.clear();
      const plans: Plan[] = [];
      const sub = async (id: "annual" | "weekly", p: PurchasesPackage | undefined) => {
        if (!p || !p.product?.priceString) return;
        const trial = noTrial.has(p.product.identifier) ? null : trialDaysOf(p.product);
        const plan: Plan = { id, priceString: p.product.priceString, periodLabel: id === "annual" ? "year" : "week", trialDays: trial };
        if (id === "annual" && p.product.pricePerWeekString) plan.perWeekString = p.product.pricePerWeekString;
        if (placement === "winback") {
          const w = await eligibleWinBack(p);
          const offer = planOfferOf(w);
          if (w && offer) { plan.offer = offer; plan.trialDays = null; winBack.set(id, w); }
        }
        plans.push(plan);
      };
      await sub("annual", pkgs.annual);
      await sub("weekly", pkgs.weekly);
      // The exit offering sells only what it holds (no regular-price lifetime beside it).
      const lifePrice = pkgs.lifetime?.product?.priceString ?? (placement === "exit" ? null : await price());
      if (lifePrice) plans.push({ id: "lifetime", priceString: lifePrice, periodLabel: "once", trialDays: null });
      return plans;
    },
    buy: buyLifetime,
    async buyPlan(id, placement) {
      const pkg = (await loadPackages(placement))[id];
      const w = placement === "winback" ? winBack.get(id) : undefined;
      if (pkg && w) {
        return purchase(async () =>
          (await Purchases.purchasePackageWithWinBackOffer({ aPackage: pkg, winBackOffer: w })) ??
          // Typed optional by the plugin: read the outcome back if it came without one.
          { customerInfo: (await Purchases.getCustomerInfo()).customerInfo });
      }
      if (pkg) return purchase(() => Purchases.purchasePackage({ aPackage: pkg }));
      if (id === "lifetime" && placement !== "exit") return buyLifetime();
      return false;
    },
    async hasExitOffer() {
      try {
        const exit = await Purchases.getCurrentOfferingForPlacement({ placementIdentifier: "exit" });
        if (!exit || (exit.availablePackages ?? []).length === 0) return false;
        // An unconfigured placement falls back to the default offering: that is the
        // regular paywall again, not an offer — only a distinct offering counts.
        const current = (await Purchases.getOfferings()).current;
        return exit.identifier !== current?.identifier;
      } catch {
        return false;
      }
    },
    async restore() {
      const { customerInfo } = await Purchases.restorePurchases();
      return sync(customerInfo);
    },
    refreshStatus: resync,
    async presentPaywall(placement) {
      let current;
      try {
        current = await offeringFor(placement);
      } catch (e) {
        console.warn("RevenueCat offerings unavailable:", e);
        return null;
      }
      if (!current || !wantsRevenueCatPaywall(current.metadata)) return null;
      // Loaded on demand: the UI plugin is only needed once a paywall is asked for.
      const { RevenueCatUI } = await import("@revenuecat/purchases-capacitor-ui");
      const { result } = await RevenueCatUI.presentPaywall({ offering: current, displayCloseButton: true });
      await resync();
      return paywallOutcome(result as string);
    },
    async presentCustomerCenter() {
      const { RevenueCatUI } = await import("@revenuecat/purchases-capacitor-ui");
      try {
        await RevenueCatUI.presentCustomerCenter();
      } finally {
        await resync();
      }
    },
  };
}
