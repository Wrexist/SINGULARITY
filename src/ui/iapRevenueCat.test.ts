import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * With a RevenueCat key in the build, a device buys and restores Premium through
 * RevenueCat. Ownership stays grant-only, a cancelled sheet is a quiet false, and a
 * build without the key keeps the direct StoreKit path (never the web stub).
 */

const PID = "com.wrexist.singularityinc.premium";

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

const info = (owned: boolean) => ({
  entitlements: { active: owned ? { premium: { identifier: "premium" } } : {} },
  allPurchasedProductIdentifiers: owned ? [PID] : [],
});

function fakePurchases(opts: { ownedAtLaunch?: boolean; buy?: "ok" | "cancel"; restoreOwned?: boolean; restoreThrows?: boolean }) {
  const calls = { configure: [] as string[], purchase: 0, restore: 0 };
  const Purchases = {
    setLogLevel: async () => {},
    configure: async ({ apiKey }: { apiKey: string }) => { calls.configure.push(apiKey); },
    addCustomerInfoUpdateListener: async () => "cb",
    getCustomerInfo: async () => ({ customerInfo: info(!!opts.ownedAtLaunch) }),
    getProducts: async () => ({ products: [{ identifier: PID, priceString: "79,00 kr" }] }),
    purchaseStoreProduct: async () => {
      calls.purchase += 1;
      if (opts.buy === "cancel") throw Object.assign(new Error("cancelled"), { userCancelled: true });
      return { customerInfo: info(true) };
    },
    restorePurchases: async () => {
      calls.restore += 1;
      if (opts.restoreThrows) throw new Error("offline");
      return { customerInfo: info(!!opts.restoreOwned) };
    },
  };
  return { Purchases, calls };
}

async function load(key: string | undefined, fake: ReturnType<typeof fakePurchases>) {
  vi.resetModules();
  (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage();
  (globalThis as Record<string, unknown>).window = {};
  vi.stubEnv("VITE_RC_IOS_KEY", key ?? "");
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
  vi.doMock("@revenuecat/purchases-capacitor", () => ({ Purchases: fake.Purchases, LOG_LEVEL: { WARN: "WARN" } }));
  const mod = await import("./iap");
  const premium = await import("../state/premium");
  return { iap: mod.iap, isPremium: premium.isPremium, setPremium: premium.setPremium };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@revenuecat/purchases-capacitor");
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("iap through RevenueCat", () => {
  it("configures with the build's key and buys Premium", async () => {
    const fake = fakePurchases({ buy: "ok" });
    const { iap, isPremium } = await load("appl_test", fake);
    expect(await iap.purchasePremium()).toBe(true);
    expect(isPremium()).toBe(true);
    expect(fake.calls.configure).toEqual(["appl_test"]);
    expect(fake.calls.purchase).toBe(1);
  });

  it("shows RevenueCat's localized price", async () => {
    const { iap } = await load("appl_test", fakePurchases({}));
    expect(await iap.priceLabel()).toBe("79,00 kr");
  });

  it("treats a cancelled sheet as a quiet false", async () => {
    const { iap, isPremium } = await load("appl_test", fakePurchases({ buy: "cancel" }));
    expect(await iap.purchasePremium()).toBe(false);
    expect(isPremium()).toBe(false);
  });

  it("grants Premium at launch when RevenueCat reports it owned", async () => {
    const { iap, isPremium } = await load("appl_test", fakePurchases({ ownedAtLaunch: true }));
    await iap.refresh();
    expect(isPremium()).toBe(true);
  });

  it("restores an earlier purchase, and never revokes on an empty restore", async () => {
    const owned = await load("appl_test", fakePurchases({ restoreOwned: true }));
    expect(await owned.iap.restore()).toBe(true);

    const empty = await load("appl_test", fakePurchases({ restoreOwned: false }));
    empty.setPremium(true);
    expect(await empty.iap.restore()).toBe(true);
    expect(empty.isPremium()).toBe(true);
  });

  it("says the store was unreachable when a restore fails with nothing owned", async () => {
    const { iap } = await load("appl_test", fakePurchases({ restoreThrows: true }));
    await expect(iap.restore()).rejects.toThrow();
  });

  it("keeps the StoreKit path when the build has no key", async () => {
    vi.useFakeTimers();
    const fake = fakePurchases({ buy: "ok" });
    const { iap, isPremium } = await load(undefined, fake);
    const buy = iap.purchasePremium().then((ok) => ok, () => false);
    await vi.advanceTimersByTimeAsync(10_000); // no CdvPurchase bridge on this fake device
    expect(await buy).toBe(false);
    expect(isPremium()).toBe(false);
    expect(fake.calls.configure).toEqual([]);
  });
});
