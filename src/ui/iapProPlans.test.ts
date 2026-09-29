import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";

/**
 * Pro plans through RevenueCat: the current offering's packages become the paywall's
 * plans (store-localized prices, the yearly trial only when this customer can still
 * get it), a subscription purchase mirrors its expiry locally, and a later snapshot
 * with no active entitlement lets the subscription lapse — never the lifetime unlock.
 * Web/dev shows placeholder plans and grants locally.
 */

const LIFETIME = "com.wrexist.singularityinc.premium";
const YEARLY = "com.wrexist.singularityinc.pro.yearly";
const MONTHLY = "com.wrexist.singularityinc.pro.monthly";
const DAY = 24 * 3_600_000;

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

type Ent = { productIdentifier: string; expirationDate: string | null; expirationDateMillis: number | null };
const info = (ent: Ent | null, purchased: string[] = []) => ({
  entitlements: { active: ent ? { pro: { identifier: "pro", ...ent } } : {} },
  allPurchasedProductIdentifiers: purchased,
});
const subInfo = (id: string, until: number) => info({ productIdentifier: id, expirationDate: new Date(until).toISOString(), expirationDateMillis: until });
const lifetimeInfo = () => info({ productIdentifier: LIFETIME, expirationDate: null, expirationDateMillis: null }, [LIFETIME]);

const product = (identifier: string, priceString: string, extra: Record<string, unknown> = {}) => ({ identifier, priceString, ...extra });
const pkg = (packageType: string, p: ReturnType<typeof product>) => ({ identifier: `$rc_${packageType.toLowerCase()}`, packageType, product: p });

function fakePurchases(opts: {
  launch?: ReturnType<typeof info>;
  eligibility?: number;
  noOffering?: boolean;
  buyResult?: ReturnType<typeof info> | "cancel";
  restore?: ReturnType<typeof info>;
}) {
  const calls = { packages: [] as string[], listener: null as null | ((i: unknown) => void) };
  const yearly = product(YEARLY, "249,00 kr", {
    pricePerMonthString: "20,75 kr",
    introPrice: { price: 0, priceString: "0 kr", cycles: 1, period: "P1W", periodUnit: "WEEK", periodNumberOfUnits: 1 },
  });
  const monthly = product(MONTHLY, "49,00 kr", { introPrice: null });
  const lifetime = product(LIFETIME, "79,00 kr");
  const Purchases = {
    setLogLevel: async () => {},
    configure: async () => {},
    addCustomerInfoUpdateListener: async (cb: (i: unknown) => void) => { calls.listener = cb; return "cb"; },
    getCustomerInfo: async () => ({ customerInfo: opts.launch ?? info(null) }),
    getProducts: async () => ({ products: [lifetime] }),
    getOfferings: async () => ({
      all: {},
      current: opts.noOffering ? null : { identifier: "default", availablePackages: [pkg("MONTHLY", monthly), pkg("ANNUAL", yearly), pkg("LIFETIME", lifetime)] },
    }),
    checkTrialOrIntroductoryPriceEligibility: async ({ productIdentifiers }: { productIdentifiers: string[] }) =>
      Object.fromEntries(productIdentifiers.map((id) => [id, { status: opts.eligibility ?? 2, description: "" }])),
    purchasePackage: async ({ aPackage }: { aPackage: { product: { identifier: string } } }) => {
      calls.packages.push(aPackage.product.identifier);
      if (opts.buyResult === "cancel") throw Object.assign(new Error("cancelled"), { userCancelled: true });
      return { customerInfo: opts.buyResult ?? info(null) };
    },
    purchaseStoreProduct: async () => ({ customerInfo: lifetimeInfo() }),
    restorePurchases: async () => ({ customerInfo: opts.restore ?? info(null) }),
  };
  return { Purchases, calls };
}

async function load(fake: ReturnType<typeof fakePurchases> | null, native = true) {
  vi.resetModules();
  (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage();
  (globalThis as Record<string, unknown>).window = {};
  vi.stubEnv("VITE_RC_IOS_KEY", fake ? "appl_test" : "");
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native } }));
  if (fake) vi.doMock("@revenuecat/purchases-capacitor", () => ({ Purchases: fake.Purchases, LOG_LEVEL: { WARN: "WARN" } }));
  const mod = await import("./iap");
  const premium = await import("../state/premium");
  return { iap: mod.iap, ...premium };
}

// Warm the module transform once: under the full suite's parallel load a cold first
// import can outlast the default 5s test timeout.
beforeAll(async () => { await import("./iap"); }, 60_000);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@revenuecat/purchases-capacitor");
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("iap.plans through RevenueCat", () => {
  it("lists yearly, monthly, lifetime from the current offering with store prices", async () => {
    const { iap } = await load(fakePurchases({}));
    const plans = await iap.plans();
    expect(plans.map((p) => p.id)).toEqual(["annual", "monthly", "lifetime"]);
    expect(plans[0]).toEqual({ id: "annual", priceString: "249,00 kr", periodLabel: "year", trialDays: 7, perMonthString: "20,75 kr" });
    expect(plans[1]).toEqual({ id: "monthly", priceString: "49,00 kr", periodLabel: "month", trialDays: null });
    expect(plans[2]).toEqual({ id: "lifetime", priceString: "79,00 kr", periodLabel: "once", trialDays: null });
  });

  it("does not advertise a trial the customer already used", async () => {
    const { iap } = await load(fakePurchases({ eligibility: 1 }));
    const annual = (await iap.plans()).find((p) => p.id === "annual");
    expect(annual?.trialDays).toBeNull();
  });

  it("falls back to the lifetime product when there is no offering", async () => {
    const { iap } = await load(fakePurchases({ noOffering: true }));
    expect(await iap.plans()).toEqual([{ id: "lifetime", priceString: "79,00 kr", periodLabel: "once", trialDays: null }]);
  });
});

describe("iap.purchasePlan through RevenueCat", () => {
  it("buys the yearly package and mirrors its expiry", async () => {
    const until = Date.now() + 7 * DAY;
    const fake = fakePurchases({ buyResult: subInfo(YEARLY, until) });
    const { iap, hasPro, proUntil, isPremium } = await load(fake);
    expect(await iap.purchasePlan("annual")).toBe(true);
    expect(fake.calls.packages).toEqual([YEARLY]);
    expect(proUntil()).toBe(until);
    expect(hasPro()).toBe(true);
    expect(isPremium()).toBe(false); // a subscription never sets the lifetime flag
  });

  it("buys lifetime through its package and sets the permanent flag", async () => {
    const fake = fakePurchases({ buyResult: lifetimeInfo() });
    const { iap, isPremium } = await load(fake);
    expect(await iap.purchasePlan("lifetime")).toBe(true);
    expect(fake.calls.packages).toEqual([LIFETIME]);
    expect(isPremium()).toBe(true);
  });

  it("a cancelled sheet is a quiet false", async () => {
    const { iap, hasPro } = await load(fakePurchases({ buyResult: "cancel" }));
    expect(await iap.purchasePlan("monthly")).toBe(false);
    expect(hasPro()).toBe(false);
  });

  it("a later snapshot with no entitlement lets a subscription lapse", async () => {
    const until = Date.now() + 30 * DAY;
    const fake = fakePurchases({ buyResult: subInfo(MONTHLY, until) });
    const { iap, hasPro } = await load(fake);
    await iap.purchasePlan("monthly");
    expect(hasPro()).toBe(true);
    fake.calls.listener?.(info(null)); // RevenueCat pushes the expired customer
    expect(hasPro()).toBe(false);
  });

  it("a lapse never takes the lifetime unlock away", async () => {
    const fake = fakePurchases({});
    const { iap, hasPro, setPremium } = await load(fake);
    setPremium(true);
    await iap.refresh();
    fake.calls.listener?.(info(null));
    expect(hasPro()).toBe(true);
  });

  it("launch sync picks up an active subscription (new device)", async () => {
    const until = Date.now() + 200 * DAY;
    const { iap, hasPro } = await load(fakePurchases({ launch: subInfo(YEARLY, until) }));
    await iap.refresh();
    expect(hasPro()).toBe(true);
  });

  it("restore brings back a subscription", async () => {
    const until = Date.now() + 20 * DAY;
    const { iap, hasPro } = await load(fakePurchases({ restore: subInfo(MONTHLY, until) }));
    expect(await iap.restore()).toBe(true);
    expect(hasPro()).toBe(true);
  });
});

describe("iap plans on web/dev", () => {
  it("shows placeholder plans with the yearly trial", async () => {
    const { iap } = await load(null, false);
    const plans = await iap.plans();
    expect(plans.map((p) => [p.id, p.priceString, p.trialDays])).toEqual([
      ["annual", "$24.99", 7],
      ["monthly", "$4.99", null],
      ["lifetime", "$6.99", null],
    ]);
  });

  it("grants a subscription locally so the paywall is testable", async () => {
    const { iap, hasPro, isPremium, proUntil } = await load(null, false);
    expect(await iap.purchasePlan("monthly")).toBe(true);
    expect(hasPro()).toBe(true);
    expect(isPremium()).toBe(false);
    expect(proUntil()).toBeGreaterThan(Date.now());
  });

  it("lifetime on web sets the permanent flag", async () => {
    const { iap, isPremium } = await load(null, false);
    expect(await iap.purchasePlan("lifetime")).toBe(true);
    expect(isPremium()).toBe(true);
  });
});
