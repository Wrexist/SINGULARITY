import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { planOfferOf } from "./iapRevenueCat";
import { ctaLabel, termsLine, offerSpan } from "./ProPaywall";
import type { Plan } from "./iap";

/**
 * The revenue lifecycle on RevenueCat: every paywall moment asks for its PLACEMENT's
 * offering (dashboard Targeting), a lapsed subscriber's paywall carries the App Store
 * win-back offer they are eligible for (and buys with it), and the exit offer exists
 * only when the dashboard set up a distinct "exit" offering.
 */
const YEARLY = "com.wrexist.singularityinc.pro.yearly";
const WEEKLY = "com.wrexist.singularityinc.pro.weekly";

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

const none = { entitlements: { active: {} }, allPurchasedProductIdentifiers: [] as string[] };
const pkg = (packageType: string, identifier: string, priceString: string) => ({ identifier: `$rc_${packageType.toLowerCase()}`, packageType, product: { identifier, priceString } });
const offering = (identifier: string, pkgs: ReturnType<typeof pkg>[]) => ({ identifier, metadata: {}, availablePackages: pkgs });
const regular = offering("default", [pkg("ANNUAL", YEARLY, "$24.99"), pkg("WEEKLY", WEEKLY, "$4.99")]);
const discounted = offering("exit_offer", [pkg("ANNUAL", "com.wrexist.singularityinc.pro.yearly.offer", "$14.99")]);
const winBackOffer = { identifier: "wb1", price: 12.49, priceString: "$12.49", cycles: 1, period: "P1Y", periodUnit: "YEAR", periodNumberOfUnits: 1 };

function fakes(opts: { placements?: Record<string, unknown>; winBack?: boolean; placementThrows?: boolean }) {
  const calls = { placements: [] as string[], winBackBuys: 0, buys: [] as string[] };
  const Purchases = {
    setLogLevel: async () => {},
    configure: async () => {},
    addCustomerInfoUpdateListener: async () => "cb",
    getCustomerInfo: async () => ({ customerInfo: none }),
    getProducts: async () => ({ products: [] }),
    getOfferings: async () => ({ all: {}, current: regular }),
    getCurrentOfferingForPlacement: async ({ placementIdentifier }: { placementIdentifier: string }) => {
      calls.placements.push(placementIdentifier);
      if (opts.placementThrows) throw new Error("old sdk");
      return (opts.placements ?? {})[placementIdentifier] ?? regular; // unconfigured → the default
    },
    checkTrialOrIntroductoryPriceEligibility: async () => ({}),
    getEligibleWinBackOffersForPackage: async ({ aPackage }: { aPackage: { product: { identifier: string } } }) =>
      ({ eligibleWinBackOffers: opts.winBack && aPackage.product.identifier === YEARLY ? [winBackOffer] : [] }),
    purchasePackage: async ({ aPackage }: { aPackage: { product: { identifier: string } } }) => {
      calls.buys.push(aPackage.product.identifier);
      return { customerInfo: none };
    },
    purchasePackageWithWinBackOffer: async () => { calls.winBackBuys += 1; return { customerInfo: none }; },
  };
  return { Purchases, calls };
}

async function load(f: ReturnType<typeof fakes>) {
  vi.resetModules();
  (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage();
  (globalThis as Record<string, unknown>).window = {};
  vi.stubEnv("VITE_RC_IOS_KEY", "appl_live");
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
  vi.doMock("@revenuecat/purchases-capacitor", () => ({ Purchases: f.Purchases, LOG_LEVEL: { WARN: "WARN" } }));
  return (await import("./iap")).iap;
}

beforeAll(async () => { await import("./iap"); }, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@revenuecat/purchases-capacitor");
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("placements", () => {
  it("each moment asks for its placement's offering", async () => {
    const f = fakes({ placements: { post_ship: offering("ship_test", [pkg("ANNUAL", YEARLY, "$19.99")]) } });
    const iap = await load(f);
    const plans = await iap.plans("post_ship");
    expect(f.calls.placements).toContain("post_ship");
    expect(plans.find((p) => p.id === "annual")!.priceString).toBe("$19.99");
    await iap.purchasePlan("annual", "post_ship");
    expect(f.calls.buys).toEqual([YEARLY]);
  });

  it("falls back to the current offering when placements are unavailable", async () => {
    const f = fakes({ placementThrows: true });
    const iap = await load(f);
    expect((await iap.plans("onboarding")).map((p) => p.priceString)).toEqual(["$24.99", "$4.99"]);
  });
});

describe("win-back", () => {
  it("shows the eligible win-back price on the plan and buys with the offer", async () => {
    const f = fakes({ winBack: true });
    const iap = await load(f);
    const plans = await iap.plans("winback");
    const annual = plans.find((p) => p.id === "annual")!;
    expect(annual.offer).toEqual({ priceString: "$12.49", periods: 1, unit: "year" });
    expect(annual.trialDays).toBeNull();
    expect(plans.find((p) => p.id === "weekly")!.offer).toBeUndefined();
    await iap.purchasePlan("annual", "winback");
    expect(f.calls.winBackBuys).toBe(1);
    await iap.purchasePlan("weekly", "winback");
    expect(f.calls.buys).toEqual([WEEKLY]); // no offer → the regular purchase
  });

  it("other placements never attach a win-back offer", async () => {
    const f = fakes({ winBack: true });
    const iap = await load(f);
    expect((await iap.plans("settings")).some((p) => p.offer)).toBe(false);
  });
});

describe("exit offer", () => {
  it("exists only when the dashboard set a distinct exit offering", async () => {
    expect(await (await load(fakes({}))).exitOfferAvailable()).toBe(false); // falls back to default
    expect(await (await load(fakes({ placements: { exit: discounted } }))).exitOfferAvailable()).toBe(true);
  });

  it("sells only what the exit offering holds", async () => {
    const iap = await load(fakes({ placements: { exit: discounted } }));
    const plans = await iap.plans("exit");
    expect(plans.map((p) => `${p.id} ${p.priceString}`)).toEqual(["annual $14.99"]);
  });
});

describe("offer copy (Apple 3.1.2: price, length, renewal, cancel)", () => {
  const plan: Plan = { id: "annual", priceString: "$24.99", periodLabel: "year", trialDays: null, offer: { priceString: "$12.49", periods: 1, unit: "year" } };
  it("names the offer price, how long it lasts, and the price after", () => {
    expect(ctaLabel(plan)).toBe("Continue for $12.49");
    expect(termsLine(plan)).toBe("$12.49 for the first year, then $24.99/year. Auto-renews until cancelled. Cancel anytime in Settings › Apple ID at least 24 hours before the period ends.");
    expect(offerSpan({ priceString: "$1", periods: 3, unit: "month" })).toBe("3 months");
  });
  it("reads a store discount, and refuses one it can't describe", () => {
    expect(planOfferOf({ priceString: "$2.99", periodUnit: "MONTH", periodNumberOfUnits: 1, cycles: 3 })).toEqual({ priceString: "$2.99", periods: 3, unit: "month" });
    expect(planOfferOf({ priceString: "$2.99", periodUnit: "FORTNIGHT" })).toBeNull();
    expect(planOfferOf(null)).toBeNull();
  });
});
