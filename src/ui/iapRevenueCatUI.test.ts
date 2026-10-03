import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { paywallOutcome, wantsRevenueCatPaywall, proStatus } from "./iapRevenueCat";

/**
 * RevenueCat UI on top of the purchase layer: the dashboard paywall shows only when the
 * current offering opts in through its metadata (else the in-app paywall stays), the
 * Customer Center re-reads customer info when it closes (a cancel made there lands at
 * once), and a Test Store key never drives a production bundle.
 */

const YEARLY = "com.wrexist.singularityinc.pro.yearly";
const DAY = 24 * 3_600_000;

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

const none = () => ({ entitlements: { active: {} }, allPurchasedProductIdentifiers: [] as string[] });
const sub = (until: number) => ({
  entitlements: { active: { pro: { identifier: "pro", productIdentifier: YEARLY, expirationDate: new Date(until).toISOString(), expirationDateMillis: until } } },
  allPurchasedProductIdentifiers: [YEARLY],
});

function fakes(opts: { metadata?: Record<string, unknown>; result?: string; infos: Array<ReturnType<typeof none>>; offeringsThrow?: boolean }) {
  const calls = { paywall: 0, center: 0, offering: null as unknown, configure: [] as string[] };
  let i = 0;
  const Purchases = {
    setLogLevel: async () => {},
    configure: async ({ apiKey }: { apiKey: string }) => { calls.configure.push(apiKey); },
    addCustomerInfoUpdateListener: async () => "cb",
    // Each read returns the next snapshot (the last one repeats).
    getCustomerInfo: async () => ({ customerInfo: opts.infos[Math.min(i++, opts.infos.length - 1)] }),
    getOfferings: async () => {
      if (opts.offeringsThrow) throw new Error("offline");
      return { all: {}, current: { identifier: "default", metadata: opts.metadata ?? {}, availablePackages: [] } };
    },
  };
  const RevenueCatUI = {
    presentPaywall: async (o: { offering?: unknown }) => { calls.paywall += 1; calls.offering = o.offering; return { result: opts.result ?? "CANCELLED" }; },
    presentCustomerCenter: async () => { calls.center += 1; },
  };
  return { Purchases, RevenueCatUI, calls };
}

async function load(f: ReturnType<typeof fakes>, key = "appl_live", mode?: string) {
  vi.resetModules();
  (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage();
  (globalThis as Record<string, unknown>).window = {};
  vi.stubEnv("VITE_RC_IOS_KEY", key);
  if (mode) vi.stubEnv("MODE", mode);
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
  vi.doMock("@revenuecat/purchases-capacitor", () => ({ Purchases: f.Purchases, LOG_LEVEL: { WARN: "WARN" } }));
  vi.doMock("@revenuecat/purchases-capacitor-ui", () => ({ RevenueCatUI: f.RevenueCatUI }));
  const mod = await import("./iap");
  const premium = await import("../state/premium");
  return { iap: mod.iap, revenueCatKey: mod.revenueCatKey, ...premium };
}

beforeAll(async () => { await import("./iap"); }, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@revenuecat/purchases-capacitor");
  vi.doUnmock("@revenuecat/purchases-capacitor-ui");
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("paywall helpers", () => {
  it("maps every PAYWALL_RESULT", () => {
    expect(paywallOutcome("PURCHASED")).toBe("purchased");
    expect(paywallOutcome("RESTORED")).toBe("restored");
    expect(paywallOutcome("ERROR")).toBe("error");
    expect(paywallOutcome("CANCELLED")).toBe("closed");
    expect(paywallOutcome("NOT_PRESENTED")).toBe("closed");
    expect(paywallOutcome(undefined)).toBe("closed");
  });

  it("opts in only on paywall: revenuecat", () => {
    expect(wantsRevenueCatPaywall({ paywall: "revenuecat" })).toBe(true);
    expect(wantsRevenueCatPaywall({ paywall: " RevenueCat " })).toBe(true);
    expect(wantsRevenueCatPaywall({ paywall: "custom" })).toBe(false);
    expect(wantsRevenueCatPaywall({ paywall: true })).toBe(false);
    expect(wantsRevenueCatPaywall({})).toBe(false);
    expect(wantsRevenueCatPaywall(null)).toBe(false);
  });
});

describe("willRenew", () => {
  it("a cancelled subscription stays active until expiry but reports it won't renew", () => {
    const until = Date.now() + 3 * DAY;
    const info = sub(until);
    (info.entitlements.active.pro as Record<string, unknown>).willRenew = false;
    const st = proStatus(info as never, "com.wrexist.singularityinc.premium");
    expect(st.active).toBe(true);
    expect(st.willRenew).toBe(false);
  });

  it("is mirrored into local state, and back on when the player resubscribes", async () => {
    const cancelled = sub(Date.now() + 3 * DAY);
    (cancelled.entitlements.active.pro as Record<string, unknown>).willRenew = false;
    const f = fakes({ infos: [cancelled, sub(Date.now() + 3 * DAY)] });
    const { iap, proWillRenew } = await load(f);
    await iap.refresh();
    expect(proWillRenew()).toBe(false);
    await iap.syncStatus();
    expect(proWillRenew()).toBe(true);
  });
});

describe("iap.presentNativePaywall", () => {
  it("keeps the in-app paywall when the offering does not opt in", async () => {
    const f = fakes({ infos: [none()] });
    const { iap } = await load(f);
    expect(await iap.presentNativePaywall()).toBe(false);
    expect(f.calls.paywall).toBe(0);
  });

  it("keeps the in-app paywall when offerings cannot load", async () => {
    const f = fakes({ metadata: { paywall: "revenuecat" }, infos: [none()], offeringsThrow: true });
    const { iap } = await load(f);
    expect(await iap.presentNativePaywall()).toBe(false);
    expect(f.calls.paywall).toBe(0);
  });

  it("presents RevenueCat's paywall for the current offering and mirrors a purchase", async () => {
    const until = Date.now() + 365 * DAY;
    const f = fakes({ metadata: { paywall: "revenuecat" }, result: "PURCHASED", infos: [none(), sub(until)] });
    const { iap, hasPro } = await load(f);
    expect(hasPro()).toBe(false);
    expect(await iap.presentNativePaywall()).toBe(true);
    expect(f.calls.paywall).toBe(1);
    expect((f.calls.offering as { identifier: string }).identifier).toBe("default");
    expect(hasPro()).toBe(true);
  });

  it("a closed RevenueCat paywall still counts as shown (no second, in-app one)", async () => {
    const f = fakes({ metadata: { paywall: "revenuecat" }, result: "CANCELLED", infos: [none()] });
    const { iap } = await load(f);
    expect(await iap.presentNativePaywall()).toBe(true);
  });

  it("is never shown on a build without RevenueCat", async () => {
    const f = fakes({ metadata: { paywall: "revenuecat" }, infos: [none()] });
    const { iap } = await load(f, "");
    expect(await iap.presentNativePaywall()).toBe(false);
    expect(await iap.canManageSubscription()).toBe(false);
    await expect(iap.manageSubscription()).rejects.toThrow();
  });
});

describe("iap.manageSubscription (Customer Center)", () => {
  it("opens the Customer Center and lets a cancel made there lapse Pro", async () => {
    const f = fakes({ infos: [sub(Date.now() + 5 * DAY), none()] });
    const { iap, hasPro } = await load(f);
    await iap.refresh();
    expect(hasPro()).toBe(true);
    expect(await iap.canManageSubscription()).toBe(true);
    await iap.manageSubscription();
    expect(f.calls.center).toBe(1);
    expect(hasPro()).toBe(false);
  });
});

describe("Test Store key", () => {
  it("drives a non-production bundle", async () => {
    const f = fakes({ infos: [none()] });
    const { iap, revenueCatKey } = await load(f, "test_abc", "development");
    expect(revenueCatKey()).toBe("test_abc");
    await iap.refresh();
    expect(f.calls.configure).toEqual(["test_abc"]);
  });

  it("is ignored by a production bundle (keeps direct StoreKit)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fakes({ infos: [none()] });
    const { revenueCatKey } = await load(f, "test_abc", "production");
    expect(revenueCatKey()).toBeNull();
    warn.mockRestore();
  });

  it("an App Store key drives a production bundle", async () => {
    const f = fakes({ infos: [none()] });
    const { revenueCatKey } = await load(f, "appl_live", "production");
    expect(revenueCatKey()).toBe("appl_live");
  });
});
