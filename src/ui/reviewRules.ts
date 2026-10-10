/**
 * When to ask for an App Store rating (StoreKit's review request, through the
 * in-app-review plugin). Apple decides whether its sheet actually appears — at most
 * three times a year, never in TestFlight — so this only decides when a request would
 * be WELCOME, never pushy:
 *
 *  - only as a Ship celebration closes (the game's high moment), from the player's
 *    second Ship on — they have played enough to have an opinion;
 *  - never on the close that raised the after-Ship paywall, and never within 24h of
 *    any automatic paywall: one ask per moment, and money asks take precedence;
 *  - at most three asks on an install, at least 120 days apart.
 *
 * Pure decisions over an explicit `now`; the memory lives in its own localStorage key
 * (never in the save, so a restored backup or a hard reset neither re-arms nor
 * silences it) and is treated as hostile input.
 */
export const REVIEW_KEY = "singularity.review.v1";
export const REVIEW_MIN_SHIPS = 2;
export const REVIEW_MAX_ASKS = 3;
export const REVIEW_GAP_MS = 120 * 86_400_000;
export const REVIEW_PAYWALL_QUIET_MS = 24 * 3_600_000;

export interface ReviewMemo {
  /** When each request was made (ms epoch), oldest first. */
  asks: number[];
}

export function sanitizeReviewMemo(raw: unknown): ReviewMemo {
  if (!raw || typeof raw !== "object") return { asks: [] };
  const a = (raw as { asks?: unknown }).asks;
  if (!Array.isArray(a)) return { asks: [] };
  const asks = a
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .map((v) => Math.floor(v))
    .sort((x, y) => x - y)
    .slice(-REVIEW_MAX_ASKS);
  return { asks };
}

export interface ReviewMoment {
  now: number;
  /** Ships completed, counting the one whose celebration just closed. */
  ships: number;
  /** When a paywall last showed automatically (ms epoch, 0 = never). */
  lastPaywallAt: number;
  /** This same close raised (or is about to raise) the after-Ship paywall. */
  paywallThisClose: boolean;
}

export function shouldAskReview(memo: ReviewMemo, m: ReviewMoment): boolean {
  if (!(m.ships >= REVIEW_MIN_SHIPS)) return false;
  if (m.paywallThisClose) return false;
  if (m.lastPaywallAt > 0 && m.now - m.lastPaywallAt < REVIEW_PAYWALL_QUIET_MS) return false;
  if (memo.asks.length >= REVIEW_MAX_ASKS) return false;
  const last = memo.asks[memo.asks.length - 1];
  if (last !== undefined && m.now - last < REVIEW_GAP_MS) return false;
  return true;
}

export function markAsked(memo: ReviewMemo, now: number): ReviewMemo {
  return sanitizeReviewMemo({ asks: [...memo.asks, now] });
}

export function loadReviewMemo(): ReviewMemo {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    return raw ? sanitizeReviewMemo(JSON.parse(raw)) : { asks: [] };
  } catch {
    return { asks: [] };
  }
}

export function saveReviewMemo(m: ReviewMemo): void {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(m));
  } catch {
    /* storage off: it may ask again next time, which Apple still caps */
  }
}
