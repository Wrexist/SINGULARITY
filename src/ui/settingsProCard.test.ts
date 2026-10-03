import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";

/**
 * Settings' Pro card (replaces the Premium card): a door to the paywall for players
 * without Pro, "Pro — active" with the expiry for subscribers, and "Founder · Pro
 * forever" for owners of the original lifetime unlock. Restore stays reachable.
 */

const g = globalThis as unknown as Record<string, unknown>;
const saved = { localStorage: g.localStorage, window: g.window, document: g.document };

async function render(stored: Record<string, string>) {
  vi.resetModules();
  const store = { ...stored };
  g.localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  g.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  g.document = { documentElement: { getAttribute: () => null, setAttribute() {} }, querySelector: () => null };
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { SettingsSheet } = await import("./SettingsSheet");
  const html = renderToStaticMarkup(createElement(SettingsSheet, { onClose: () => {}, onReset: () => {}, onOpenPro: () => {} }));
  return /<div class="premium-card[^"]*">(.*?)<div class="set-list">/s.exec(html)?.[1] ?? "";
}

// Warm the module transform once: under the full suite's parallel load a cold first
// import can outlast the default 5s test timeout.
beforeAll(async () => { await import("./SettingsSheet"); }, 60_000);

afterEach(() => {
  g.localStorage = saved.localStorage;
  g.window = saved.window;
  g.document = saved.document;
});

describe("Settings Pro card", () => {
  it("offers the plans (and Restore) without Pro", async () => {
    const card = await render({});
    expect(card).toContain("See Pro plans");
    expect(card).toContain("Restore");
    expect(card).not.toContain("active");
  });

  it("shows an active subscription with its expiry, no sales button", async () => {
    const card = await render({ "singularity.pro.until.v1": String(Date.now() + 10 * 86_400_000) });
    expect(card).toContain("Pro — active");
    expect(card).toContain("Through ");
    expect(card).not.toContain("See Pro plans");
    expect(card).toContain("Restore");
  });

  it("names lifetime owners Founders with Pro forever", async () => {
    const card = await render({ "singularity.premium.v1": "1" });
    expect(card).toContain("Founder · Pro forever");
    expect(card).not.toContain("See Pro plans");
  });

  it("a cancelled subscription says it won't renew, not that it renews", async () => {
    const card = await render({
      "singularity.pro.until.v1": String(Date.now() + 3 * 86_400_000),
      "singularity.pro.renews.v1": "0",
    });
    expect(card).toContain("Pro — active");
    expect(card).toContain("Cancelled");
    expect(card).not.toContain("Renews automatically");
  });

    it("an expired subscription reads as no Pro", async () => {
    const card = await render({ "singularity.pro.until.v1": String(Date.now() - 1000) });
    expect(card).toContain("See Pro plans");
  });
});
