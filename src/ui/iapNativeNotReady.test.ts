import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * On a device the StoreKit bridge (`window.CdvPurchase`) is mapped by cordova.js during
 * DOMContentLoaded, while the app's launch effect (`iap.refresh()`) can already be
 * running. ensureInit() read "no CdvPurchase" as "this is the web build", cached that
 * null for the whole session, and every later Buy took the web stub: Premium granted
 * for free on a real device, and Restore never asked StoreKit at all.
 */

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

function fakeApi(opts: { ownsAfterOrder: boolean; restoreOwned?: boolean }) {
  let owned = false;
  const calls = { order: 0, restore: 0, initialize: 0 };
  const h: { receipt?: () => void } = {};
  const store = {
    verbosity: 0,
    register() {},
    when() {
      const w = {
        approved(_cb: (t: { finish(): void }) => void) { return w; },
        receiptUpdated(cb: () => void) { h.receipt = cb; return w; },
        productUpdated(_cb: () => void) { return w; },
      };
      return w;
    },
    error() {},
    async initialize() { calls.initialize += 1; },
    async restorePurchases() {
      calls.restore += 1;
      if (opts.restoreOwned) { owned = true; h.receipt?.(); }
    },
    get() {
      return {
        getOffer: () => ({
          order: async () => {
            calls.order += 1;
            if (!opts.ownsAfterOrder) throw new Error("cancelled");
            owned = true;
            h.receipt?.();
          },
        }),
      };
    },
    owned() { return owned; },
  };
  return { api: { store, ProductType: { NON_CONSUMABLE: "n" }, Platform: { APPLE_APPSTORE: "ios" }, LogLevel: { WARNING: 1 } }, calls };
}

async function loadNativeIap() {
  vi.resetModules();
  (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage();
  // A device whose StoreKit bridge has not been mapped onto window yet.
  (globalThis as Record<string, unknown>).window = {};
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
  const mod = await import("./iap");
  const premium = await import("../state/premium");
  return { iap: mod.iap, isPremium: premium.isPremium };
}

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("@capacitor/core");
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("iap on a device before the StoreKit bridge is mapped", () => {
  it("never grants Premium through the web stub", async () => {
    vi.useFakeTimers();
    const { iap, isPremium } = await loadNativeIap();
    const buy = iap.purchasePremium().then((ok) => ok, () => false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await buy).toBe(false);
    expect(isPremium()).toBe(false);
  });

  it("reaches StoreKit once the bridge appears, even after an early launch refresh", async () => {
    const { iap, isPremium } = await loadNativeIap();
    const early = iap.refresh(); // the launch effect, racing cordova's module mapping
    const { api, calls } = fakeApi({ ownsAfterOrder: false });
    ((globalThis as Record<string, unknown>).window as Record<string, unknown>).CdvPurchase = api; // mapped a moment later
    await early;
    // A cancelled StoreKit sheet: nothing is granted, and the order really went to StoreKit.
    expect(await iap.purchasePremium()).toBe(false);
    expect(calls.order).toBe(1);
    expect(isPremium()).toBe(false);
  });

  it("Restore asks StoreKit instead of echoing the local flag", async () => {
    vi.useFakeTimers();
    const { iap, isPremium } = await loadNativeIap();
    const early = iap.refresh().catch(() => {});
    await vi.advanceTimersByTimeAsync(10_000);
    await early;
    vi.useRealTimers();
    const { api, calls } = fakeApi({ ownsAfterOrder: false, restoreOwned: true });
    ((globalThis as Record<string, unknown>).window as Record<string, unknown>).CdvPurchase = api;
    expect(await iap.restore()).toBe(true);
    expect(calls.restore).toBe(1);
    expect(isPremium()).toBe(true);
  });
});
