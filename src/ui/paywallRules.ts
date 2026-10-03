/**
 * When the Pro paywall may show ON ITS OWN (the Settings button always opens it).
 * The memory lives in its own localStorage key — never in the save, so a restored
 * backup or a hard reset neither re-arms nor silences it.
 *
 *  - "launch": once, the first launch the game UI is ready on (new AND existing
 *    players), once the stage is clear.
 *  - "ship":   once more after a Ship celebration closes — armed by the player's FIRST
 *    Ship on this install (a veteran updating the app is never re-armed by a later
 *    one). When that close lands inside the 24h window of the launch paywall it stays
 *    armed and shows after the next celebration that falls outside it.
 *  - "winback": once per lapse, for a FORMER subscriber whose plan the store has
 *    confirmed is over (keyed by the expiry it ended at), on a clear stage.
 *  - never while Pro is active, never twice in 24h automatically.
 *
 * And one follow-up that is not automatic: the EXIT offer — a one-time discounted
 * offering shown once per install, right after a player who has never paid closes
 * the paywall without buying (only when the store has such an offering).
 *
 * Pure decisions over an explicit `now`; storage read/write is kept separate and
 * treated as hostile input.
 */
export const PAYWALL_KEY = "singularity.paywall.v1";
export const PAYWALL_THROTTLE_MS = 24 * 3_600_000;

export type PaywallTrigger = "launch" | "ship" | "winback";

/**
 * Where a paywall was opened. Each is a RevenueCat PLACEMENT: the dashboard's
 * Targeting can give every moment its own offering, price test or experiment with no
 * app update; an unconfigured placement falls back to the current offering.
 */
export type PaywallPlacement = "onboarding" | "post_ship" | "settings" | "winback" | "exit";

/** The placement an automatic trigger opens. */
export function placementFor(trigger: PaywallTrigger): PaywallPlacement {
  return trigger === "launch" ? "onboarding" : trigger === "ship" ? "post_ship" : "winback";
}

export interface PaywallMemo {
  /** The first-launch paywall has shown. */
  launchShown: boolean;
  /** The player's first Ship happened on this install (arms the "ship" paywall). */
  shipArmed: boolean;
  /** The after-Ship paywall has shown. */
  shipShown: boolean;
  /** When a paywall last showed automatically (ms epoch), 0 = never. */
  lastAutoAt: number;
  /** The lapse (subscription expiry, ms epoch) the win-back paywall last showed for. */
  winbackFor: number;
  /** The one-time exit offer has shown on this install. */
  exitShown: boolean;
}

export const EMPTY_MEMO: PaywallMemo = { launchShown: false, shipArmed: false, shipShown: false, lastAutoAt: 0, winbackFor: 0, exitShown: false };

export function sanitizeMemo(raw: unknown): PaywallMemo {
  if (!raw || typeof raw !== "object") return { ...EMPTY_MEMO };
  const r = raw as Record<string, unknown>;
  const stamp = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return {
    launchShown: r.launchShown === true,
    shipArmed: r.shipArmed === true,
    shipShown: r.shipShown === true,
    lastAutoAt: stamp(r.lastAutoAt),
    winbackFor: stamp(r.winbackFor),
    exitShown: r.exitShown === true,
  };
}

export function loadMemo(): PaywallMemo {
  try {
    const raw = localStorage.getItem(PAYWALL_KEY);
    return raw ? sanitizeMemo(JSON.parse(raw)) : { ...EMPTY_MEMO };
  } catch {
    return { ...EMPTY_MEMO };
  }
}

export function saveMemo(m: PaywallMemo): void {
  try {
    localStorage.setItem(PAYWALL_KEY, JSON.stringify(m));
  } catch {
    /* storage refused — worst case the paywall shows once more, never a crash */
  }
}

/** Is the automatic 24h window still closed? A stamp in the future (clock moved back)
 *  counts as recent — the conservative reading is "don't show". */
function throttled(m: PaywallMemo, now: number): boolean {
  return m.lastAutoAt > 0 && now - m.lastAutoAt < PAYWALL_THROTTLE_MS;
}

/** May this trigger show the paywall right now? Pure. `lapsedAt` is the expiry a
 *  confirmed lapse ended at (0 = not a lapsed former subscriber); only "winback" reads it. */
export function shouldAutoShow(m: PaywallMemo, trigger: PaywallTrigger, now: number, pro: boolean, lapsedAt = 0): boolean {
  if (pro || !Number.isFinite(now)) return false;
  if (trigger === "launch" && m.launchShown) return false;
  if (trigger === "ship" && (!m.shipArmed || m.shipShown)) return false;
  if (trigger === "winback" && (!(lapsedAt > 0) || m.winbackFor === lapsedAt)) return false;
  return !throttled(m, now);
}

/**
 * May the one-time exit offer follow a paywall the player just closed? Only for a
 * player who has never paid (no lifetime unlock, never subscribed), never after a
 * win-back paywall (a former subscriber has their own offer) or an exit offer, and
 * once per install. Whether the store has an offer to show is the caller's next check.
 */
export function shouldOfferExit(m: PaywallMemo, closed: PaywallPlacement, everPaid: boolean, pro: boolean): boolean {
  if (pro || everPaid || m.exitShown) return false;
  return closed !== "winback" && closed !== "exit";
}

/** Record that the exit offer showed. Pure. */
export function markExitShown(m: PaywallMemo): PaywallMemo {
  return { ...m, exitShown: true };
}

/** Record that `trigger` showed automatically at `now`. Pure. */
export function markShown(m: PaywallMemo, trigger: PaywallTrigger, now: number, lapsedAt = 0): PaywallMemo {
  return {
    ...m,
    winbackFor: trigger === "winback" && lapsedAt > 0 ? lapsedAt : m.winbackFor,
    launchShown: m.launchShown || trigger === "launch",
    shipShown: m.shipShown || trigger === "ship",
    lastAutoAt: now,
  };
}

/** Arm the after-Ship paywall (the first Ship on this install). Pure. */
export function armShip(m: PaywallMemo): PaywallMemo {
  return m.shipArmed ? m : { ...m, shipArmed: true };
}
