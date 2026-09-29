/**
 * Pro entitlement persistence — kept in the state layer so the store (offline cap,
 * offline rate, autopilots) and the UI's IAP module can read it without a layering
 * inversion. The actual PURCHASE flow lives in src/ui/iap.ts.
 *
 * Pro is unlocked by ANY of:
 *  - the lifetime unlock (non-consumable `com.wrexist.singularityinc.premium`, the
 *    original "Premium"): a local flag that is GRANT-ONLY — a "not owned" answer
 *    from the store never takes it away (existing buyers keep Pro forever);
 *  - a yearly or weekly subscription: persisted as an expiry timestamp (ms epoch)
 *    mirrored from the store's entitlement. Unlike the lifetime flag it CAN lapse.
 *
 * Local storage is hostile input like the save: the stored expiry is validated and a
 * value no real subscription could carry (non-finite, negative, or further out than
 * any plan's period plus grace) is ignored instead of granting Pro forever.
 *
 * The wall clock is read HERE (state layer), never in the engine: the engine takes
 * Pro in as a plain boolean / rate parameter.
 */
const KEY = "singularity.premium.v1";
export const PRO_UNTIL_KEY = "singularity.pro.until.v1";

/** Longest a stored subscription expiry may sit in the future: a yearly period plus
 *  a generous billing-grace/clock-skew margin. Anything beyond is not a real expiry. */
export const MAX_PRO_AHEAD_MS = 400 * 24 * 3_600_000;

const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** Subscribe to Pro/Premium changes (purchase, restore, lapse). Returns an unsubscribe. */
export function onProChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function isPremium(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setPremium(owned: boolean): void {
  try {
    const before = localStorage.getItem(KEY);
    localStorage.setItem(KEY, owned ? "1" : "0");
    if (before !== (owned ? "1" : "0")) emit();
  } catch {
    /* ignore */
  }
}

/** A stored expiry, validated against `now`. 0 when absent or not believable. */
export function sanitizeProUntil(raw: unknown, now: number): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(now)) return 0;
  if (n > now + MAX_PRO_AHEAD_MS) return 0;
  return Math.floor(n);
}

/** The subscription's expiry (ms epoch), or 0 when there is none / it is invalid. */
export function proUntil(now: number = Date.now()): number {
  try {
    return sanitizeProUntil(localStorage.getItem(PRO_UNTIL_KEY), now);
  } catch {
    return 0;
  }
}

/**
 * Mirror the subscription expiry from the store. `null` (or anything not a positive
 * finite number) clears it — a lapsed subscription. Never touches the lifetime flag.
 */
export function setProUntil(until: number | null, now: number = Date.now()): void {
  try {
    const before = localStorage.getItem(PRO_UNTIL_KEY);
    const v = until === null ? 0 : sanitizeProUntil(until, now);
    if (v > 0) localStorage.setItem(PRO_UNTIL_KEY, String(v));
    else localStorage.removeItem(PRO_UNTIL_KEY);
    if (before !== (v > 0 ? String(v) : null)) emit();
  } catch {
    /* ignore */
  }
}

/** Is Pro active right now? Lifetime owners always; subscribers until expiry. */
export function hasPro(now: number = Date.now()): boolean {
  if (isPremium()) return true;
  return proUntil(now) > now;
}
