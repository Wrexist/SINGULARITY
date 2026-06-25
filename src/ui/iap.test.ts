import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * IAP path coverage (issue #3 acceptance criteria). The real StoreKit transaction
 * can only be verified on a device, so here we mock the CdvPurchase global + the
 * Capacitor platform flag to exercise the JS glue: web-stub gating, native
 * purchase success/failure, and restore found/not-found.
 */

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
  };
}

/** A minimal CdvPurchase stand-in. `ownsAfter` decides whether an order/restore
 *  results in an owned non-consumable (success) or not (cancel / nothing to restore). */
function fakeApi(ownsAfter: boolean) {
  let owned = false;
  const h: Record<string, (() => void) | ((t: { finish(): void }) => void)> = {};
  const store = {
    verbosity: 0,
    register() {},
    when() {
      const w = {
        approved(cb: (t: { finish(): void }) => void) { h.approved = cb; return w; },
        receiptUpdated(cb: () => void) { h.receipt = cb; return w; },
        productUpdated(cb: () => void) { h.product = cb; return w; },
      };
      return w;
    },
    error() {},
    async initialize() {},
    async restorePurchases() {
      if (ownsAfter) { owned = true; (h.receipt as () => void)?.(); }
    },
    get() {
      return {
        getOffer: () => ({
          order: async () => {
            if (!ownsAfter) throw new Error("cancelled");
            owned = true;
            (h.approved as (t: { finish(): void }) => void)?.({ finish() {} });
            (h.receipt as () => void)?.();
          },
        }),
      };
    },
    owned() { return owned; },
  };
  return { store, ProductType: { NON_CONSUMABLE: "n" }, Platform: { APPLE_APPSTORE: "ios" }, LogLevel: { WARNING: 1 } };
}

async function loadIap(native: boolean, api?: unknown) {
  vi.resetModules();
  (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage();
  (globalThis as Record<string, unknown>).window = native ? { CdvPurchase: api } : {};
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native } }));
  const mod = await import("./iap");
  return mod.iap;
}

afterEach(() => {
  vi.doUnmock("@capacitor/core");
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("iap (premium unlock)", () => {
  it("web/dev: grants the stub so the unlock UI is testable in a browser", async () => {
    const iap = await loadIap(false);
    expect(await iap.purchasePremium()).toBe(true);
    expect(iap.isPremium()).toBe(true);
  });

  it("native purchase success: grants only after a verified transaction", async () => {
    const iap = await loadIap(true, fakeApi(true));
    expect(await iap.purchasePremium()).toBe(true);
    expect(iap.isPremium()).toBe(true);
  });

  it("native purchase failure: does NOT grant (self-grant unreachable on native)", async () => {
    const iap = await loadIap(true, fakeApi(false));
    expect(await iap.purchasePremium()).toBe(false);
    expect(iap.isPremium()).toBe(false);
  });

  it("native restore found: re-grants the entitlement", async () => {
    const iap = await loadIap(true, fakeApi(true));
    expect(await iap.restore()).toBe(true);
    expect(iap.isPremium()).toBe(true);
  });

  it("native restore not found: leaves the player without premium", async () => {
    const iap = await loadIap(true, fakeApi(false));
    expect(await iap.restore()).toBe(false);
    expect(iap.isPremium()).toBe(false);
  });
});
