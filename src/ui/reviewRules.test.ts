import { describe, it, expect } from "vitest";
import {
  shouldAskReview, markAsked, sanitizeReviewMemo,
  REVIEW_GAP_MS, REVIEW_MAX_ASKS, REVIEW_PAYWALL_QUIET_MS,
  type ReviewMoment,
} from "./reviewRules";

/**
 * The rating request is a favour asked of a happy player: only at a high moment,
 * never stacked on a paywall, and rarely. Apple caps the sheet anyway; these rules
 * keep the game from even trying when the ask would be unwelcome.
 */
const DAY = 86_400_000;
const at = (over: Partial<ReviewMoment> = {}): ReviewMoment => ({ now: 1_000 * DAY, ships: 2, lastPaywallAt: 0, paywallThisClose: false, ...over });

describe("rating request rules", () => {
  it("asks from the second Ship on, never on the first", () => {
    expect(shouldAskReview({ asks: [] }, at({ ships: 1 }))).toBe(false);
    expect(shouldAskReview({ asks: [] }, at({ ships: 2 }))).toBe(true);
    expect(shouldAskReview({ asks: [] }, at({ ships: 9 }))).toBe(true);
  });

  it("never shares a moment with the paywall, nor follows one within a day", () => {
    expect(shouldAskReview({ asks: [] }, at({ paywallThisClose: true }))).toBe(false);
    const now = 1_000 * DAY;
    expect(shouldAskReview({ asks: [] }, at({ now, lastPaywallAt: now - REVIEW_PAYWALL_QUIET_MS + 1 }))).toBe(false);
    expect(shouldAskReview({ asks: [] }, at({ now, lastPaywallAt: now - REVIEW_PAYWALL_QUIET_MS }))).toBe(true);
  });

  it("asks at most three times on an install, at least 120 days apart", () => {
    let memo = { asks: [] as number[] };
    let now = 1_000 * DAY;
    let asked = 0;
    for (let k = 0; k < 40; k++, now += 30 * DAY) {
      if (shouldAskReview(memo, at({ now }))) {
        memo = markAsked(memo, now);
        asked++;
      }
    }
    expect(asked).toBe(REVIEW_MAX_ASKS);
    for (let i = 1; i < memo.asks.length; i++) expect(memo.asks[i]! - memo.asks[i - 1]!).toBeGreaterThanOrEqual(REVIEW_GAP_MS);
  });

  it("treats stored memory as hostile input", () => {
    expect(sanitizeReviewMemo(null)).toEqual({ asks: [] });
    expect(sanitizeReviewMemo({ asks: "x" })).toEqual({ asks: [] });
    expect(sanitizeReviewMemo({ asks: [3, -1, Number.NaN, "2", 1, 2, 5.7] })).toEqual({ asks: [2, 3, 5] });
    // A forged long history can only make it ask LESS, never more.
    expect(shouldAskReview(sanitizeReviewMemo({ asks: [1, 2, 3, 4, 5] }), at())).toBe(false);
  });
});
