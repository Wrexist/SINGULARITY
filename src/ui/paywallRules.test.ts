import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  shouldAutoShow, markShown, armShip, sanitizeMemo, loadMemo, saveMemo, EMPTY_MEMO, PAYWALL_KEY, PAYWALL_THROTTLE_MS, type PaywallMemo,
  placementFor, shouldOfferExit, markExitShown,
} from "./paywallRules";
import { ctaLabel, termsLine } from "./ProPaywall";
import type { Plan } from "./iap";

/**
 * When the Pro paywall may show on its own: once on the first launch, once more after
 * the first Ship's celebration, never with Pro, never twice in 24 hours. And what it
 * says: the button and the exact renewal terms follow the chosen plan.
 */

const T0 = 1_800_000_000_000;
const H = 3_600_000;

describe("paywall show rules", () => {
  it("shows once on the first launch, for a player without Pro", () => {
    expect(shouldAutoShow(EMPTY_MEMO, "launch", T0, false)).toBe(true);
    const m = markShown(EMPTY_MEMO, "launch", T0);
    expect(shouldAutoShow(m, "launch", T0 + 30 * 24 * H, false)).toBe(false);
  });

  it("never shows to a Pro player", () => {
    expect(shouldAutoShow(EMPTY_MEMO, "launch", T0, true)).toBe(false);
    expect(shouldAutoShow(armShip(EMPTY_MEMO), "ship", T0, true)).toBe(false);
  });

  it("the after-Ship paywall needs the first Ship to arm it, and shows once", () => {
    expect(shouldAutoShow(EMPTY_MEMO, "ship", T0, false)).toBe(false); // not armed (e.g. a veteran)
    const armed = armShip(EMPTY_MEMO);
    expect(shouldAutoShow(armed, "ship", T0, false)).toBe(true);
    const shown = markShown(armed, "ship", T0);
    expect(shouldAutoShow(shown, "ship", T0 + 100 * 24 * H, false)).toBe(false);
    expect(armShip(armed)).toBe(armed); // idempotent
  });

  it("never twice within 24 hours automatically", () => {
    const launched = armShip(markShown(EMPTY_MEMO, "launch", T0));
    expect(shouldAutoShow(launched, "ship", T0 + 1 * H, false)).toBe(false);
    expect(shouldAutoShow(launched, "ship", T0 + PAYWALL_THROTTLE_MS - 1, false)).toBe(false);
    expect(shouldAutoShow(launched, "ship", T0 + PAYWALL_THROTTLE_MS, false)).toBe(true); // stays armed until then
  });

  it("a clock moved back reads as 'recent' (never shows early)", () => {
    const m = armShip(markShown(EMPTY_MEMO, "launch", T0));
    expect(shouldAutoShow(m, "ship", T0 - 5 * 24 * H, false)).toBe(false);
    expect(shouldAutoShow(m, "ship", NaN, false)).toBe(false);
  });
});

describe("paywall memory is hostile storage", () => {
  let store: Record<string, string>;
  let prev: unknown;
  beforeEach(() => {
    store = {};
    prev = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
    };
  });
  afterEach(() => { (globalThis as { localStorage?: unknown }).localStorage = prev; });

  it("round-trips", () => {
    const m: PaywallMemo = { launchShown: true, shipArmed: true, shipShown: false, lastAutoAt: T0, winbackFor: T0 - 5, exitShown: true };
    saveMemo(m);
    expect(loadMemo()).toEqual(m);
  });

  it.each([["not json", "{"], ["array", "[1,2]"], ["null", "null"], ["wrong types", JSON.stringify({ launchShown: "yes", lastAutoAt: "soon" })]])(
    "reads %s as a fresh memory",
    (_l, raw) => {
      store[PAYWALL_KEY] = raw;
      const m = loadMemo();
      expect(m.launchShown).toBe(false);
      expect(m.lastAutoAt).toBe(0);
    },
  );

  it("sanitizes a non-finite or negative stamp to 0", () => {
    expect(sanitizeMemo({ lastAutoAt: -5 }).lastAutoAt).toBe(0);
    expect(sanitizeMemo({ lastAutoAt: Infinity }).lastAutoAt).toBe(0);
  });

  it("a storage that throws never breaks the app", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadMemo()).toEqual(EMPTY_MEMO);
    expect(() => saveMemo(EMPTY_MEMO)).not.toThrow();
  });
});

describe("paywall copy follows the plan", () => {
  const annual: Plan = { id: "annual", priceString: "$24.99", periodLabel: "year", trialDays: 7, perWeekString: "$0.48" };
  const annualNoTrial: Plan = { ...annual, trialDays: null };
  const weekly: Plan = { id: "weekly", priceString: "$4.99", periodLabel: "week", trialDays: null };
  const lifetime: Plan = { id: "lifetime", priceString: "$6.99", periodLabel: "once", trialDays: null };

  it("names the action", () => {
    expect(ctaLabel(annual)).toBe("Start 7-day free trial");
    expect(ctaLabel(annualNoTrial)).toBe("Subscribe");
    expect(ctaLabel(weekly)).toBe("Subscribe");
    expect(ctaLabel({ ...weekly, trialDays: 7 })).toBe("Start 7-day free trial");
    expect(termsLine({ ...weekly, trialDays: 7 })).toBe("7 days free, then $4.99/week. Auto-renews until cancelled. Cancel anytime in Settings › Apple ID at least 24 hours before the trial ends.");
    expect(ctaLabel(lifetime)).toBe("Unlock forever");
  });

  it("states the exact terms under the button", () => {
    expect(termsLine(annual)).toBe("7 days free, then $24.99/year. Auto-renews until cancelled. Cancel anytime in Settings › Apple ID at least 24 hours before the trial ends.");
    expect(termsLine(weekly)).toMatch(/^\$4\.99\/week, auto-renews until cancelled\. Cancel anytime in Settings › Apple ID/);
    expect(termsLine(annualNoTrial)).toMatch(/^\$24\.99\/year, auto-renews until cancelled/);
    expect(termsLine(lifetime)).toBe("One-time purchase of $6.99. No subscription.");
  });
});

describe("win-back (a former subscriber, once per lapse)", () => {
  const lapsed = T0 - 3 * 86_400_000;
  it("shows for a confirmed lapse, once for that lapse", () => {
    expect(shouldAutoShow(EMPTY_MEMO, "winback", T0, false, lapsed)).toBe(true);
    const m = markShown(EMPTY_MEMO, "winback", T0, lapsed);
    expect(m.winbackFor).toBe(lapsed);
    expect(shouldAutoShow(m, "winback", T0 + 2 * 86_400_000, false, lapsed)).toBe(false);
  });
  it("a later lapse (resubscribed, lapsed again) gets its own", () => {
    const m = markShown(EMPTY_MEMO, "winback", T0, lapsed);
    const next = lapsed + 40 * 86_400_000;
    expect(shouldAutoShow(m, "winback", next + 86_400_000, false, next)).toBe(true);
  });
  it("never for a player who isn't a lapsed subscriber, while Pro, or inside the 24h window", () => {
    expect(shouldAutoShow(EMPTY_MEMO, "winback", T0, false, 0)).toBe(false);
    expect(shouldAutoShow(EMPTY_MEMO, "winback", T0, true, lapsed)).toBe(false);
    const recent = markShown(EMPTY_MEMO, "launch", T0 - 3_600_000);
    expect(shouldAutoShow(recent, "winback", T0, false, lapsed)).toBe(false);
  });
  it("opens the winback placement", () => {
    expect(placementFor("winback")).toBe("winback");
    expect(placementFor("launch")).toBe("onboarding");
    expect(placementFor("ship")).toBe("post_ship");
  });
});

describe("exit offer (once per install, never-paid players)", () => {
  it("may follow a closed paywall once", () => {
    expect(shouldOfferExit(EMPTY_MEMO, "onboarding", false, false)).toBe(true);
    expect(shouldOfferExit(markExitShown(EMPTY_MEMO), "settings", false, false)).toBe(false);
  });
  it("never for payers, Pro, or after a win-back / exit paywall", () => {
    expect(shouldOfferExit(EMPTY_MEMO, "onboarding", true, false)).toBe(false);
    expect(shouldOfferExit(EMPTY_MEMO, "onboarding", false, true)).toBe(false);
    expect(shouldOfferExit(EMPTY_MEMO, "winback", false, false)).toBe(false);
    expect(shouldOfferExit(EMPTY_MEMO, "exit", false, false)).toBe(false);
  });
});
