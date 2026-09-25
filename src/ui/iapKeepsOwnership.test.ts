import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * CdvPurchase documents that `store.owned()` "will be false when the app starts and will
 * only become true after purchase receipts have been loaded and validated. Without
 * receipt validation, it might remain false ... make sure to store the ownership status
 * of non-consumable products in some way." This app has no validator, and its launch
 * sync (plus every productUpdated) wrote `owned()` straight into the entitlement flag:
 * a player who bought Premium lost it (24h offline cap, cosmetics) on the next launch.
 * A false read there means "not known yet", never "refunded".
 */

const PREMIUM_KEY = "singularity.premium.v1";

function fakeLocalStorage(seed: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

/** StoreKit on a fresh launch with no receipt validator: products load, ownership never shows. */
function launchApi(opts: { restoreResult?: unknown } = {}) {
  const h: { product?: () => void; receipt?: () => void } = {};
  const store = {
    verbosity: 0,
    register() {},
    when() {
      const w = {
        approved(_cb: (t: { finish(): void }) => void) { return w; },
        receiptUpdated(cb: () => void) { h.receipt = cb; return w; },
        productUpdated(cb: () => void) { h.product = cb; return w; },
      };
      return w;
    },
    error() {},
    async initialize() { h.product?.(); h.receipt?.(); },
    async restorePurchases() { h.receipt?.(); return opts.restoreResult; },
    get() { return { getOffer: () => undefined, pricing: { price: "£6.99" } }; },
    owned() { return false; },
  };
  return { store, ProductType: { NON_CONSUMABLE: "n" }, Platform: { APPLE_APPSTORE: "ios" }, LogLevel: { WARNING: 1 } };
}

async function loadNative(api: unknown, seed: Record<string, string>) {
  vi.resetModules();
  (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage(seed);
  (globalThis as Record<string, unknown>).window = { CdvPurchase: api };
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
  const { iap } = await import("./iap");
  const premium = await import("../state/premium");
  return { iap, isPremium: premium.isPremium };
}

afterEach(() => {
  vi.doUnmock("@capacitor/core");
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("iap: a launch before StoreKit reports ownership", () => {
  it("keeps a bought Premium through the launch refresh", async () => {
    const { iap, isPremium } = await loadNative(launchApi(), { [PREMIUM_KEY]: "1" });
    expect(isPremium()).toBe(true);
    await iap.refresh();
    expect(isPremium()).toBe(true);
  });

  it("keeps a bought Premium when the Settings price lookup starts the store", async () => {
    const { iap, isPremium } = await loadNative(launchApi(), { [PREMIUM_KEY]: "1" });
    expect(await iap.priceLabel()).toBe("£6.99");
    expect(isPremium()).toBe(true);
  });

  it("a Restore that finds nothing does not take away a Premium already held", async () => {
    const { iap, isPremium } = await loadNative(launchApi(), { [PREMIUM_KEY]: "1" });
    expect(await iap.restore()).toBe(true);
    expect(isPremium()).toBe(true);
  });

  it("still grants nothing to a lab that never bought it", async () => {
    const { iap, isPremium } = await loadNative(launchApi(), {});
    await iap.refresh();
    expect(isPremium()).toBe(false);
    expect(await iap.restore()).toBe(false);
    expect(isPremium()).toBe(false);
  });
});
