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
 *  - never while Pro is active, never twice in 24h automatically.
 *
 * Pure decisions over an explicit `now`; storage read/write is kept separate and
 * treated as hostile input.
 */
export const PAYWALL_KEY = "singularity.paywall.v1";
export const PAYWALL_THROTTLE_MS = 24 * 3_600_000;

export type PaywallTrigger = "launch" | "ship";

export interface PaywallMemo {
  /** The first-launch paywall has shown. */
  launchShown: boolean;
  /** The player's first Ship happened on this install (arms the "ship" paywall). */
  shipArmed: boolean;
  /** The after-Ship paywall has shown. */
  shipShown: boolean;
  /** When a paywall last showed automatically (ms epoch), 0 = never. */
  lastAutoAt: number;
}

export const EMPTY_MEMO: PaywallMemo = { launchShown: false, shipArmed: false, shipShown: false, lastAutoAt: 0 };

export function sanitizeMemo(raw: unknown): PaywallMemo {
  if (!raw || typeof raw !== "object") return { ...EMPTY_MEMO };
  const r = raw as Record<string, unknown>;
  const at = typeof r.lastAutoAt === "number" && Number.isFinite(r.lastAutoAt) && r.lastAutoAt > 0 ? Math.floor(r.lastAutoAt) : 0;
  return { launchShown: r.launchShown === true, shipArmed: r.shipArmed === true, shipShown: r.shipShown === true, lastAutoAt: at };
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

/** May this trigger show the paywall right now? Pure. */
export function shouldAutoShow(m: PaywallMemo, trigger: PaywallTrigger, now: number, pro: boolean): boolean {
  if (pro || !Number.isFinite(now)) return false;
  if (trigger === "launch" && m.launchShown) return false;
  if (trigger === "ship" && (!m.shipArmed || m.shipShown)) return false;
  return !throttled(m, now);
}

/** Record that `trigger` showed automatically at `now`. Pure. */
export function markShown(m: PaywallMemo, trigger: PaywallTrigger, now: number): PaywallMemo {
  return {
    ...m,
    launchShown: m.launchShown || trigger === "launch",
    shipShown: m.shipShown || trigger === "ship",
    lastAutoAt: now,
  };
}

/** Arm the after-Ship paywall (the first Ship on this install). Pure. */
export function armShip(m: PaywallMemo): PaywallMemo {
  return m.shipArmed ? m : { ...m, shipArmed: true };
}
