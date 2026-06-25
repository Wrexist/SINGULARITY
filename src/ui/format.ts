import { Big } from "../engine/math/Big";

/** Format a Big for display (idle-game notation). */
export function fmt(v: Big): string {
  return v.format();
}

/** Money is shown as currency: $1.2K, $58, etc. */
export function fmtMoney(v: Big): string {
  return `$${v.format()}`;
}

/** Format a per-second rate, trimming to the Big formatter. */
export function fmtRate(v: Big): string {
  return `${v.format()}/s`;
}

/** A per-hour projection (used by the "while you were away" screen). */
export function fmtPerHour(v: Big, prefix = ""): string {
  return `${prefix}${v.format()}/hr`;
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ---- Product-tab number helpers (shared by the portfolio card + detail screen) ----

/** Sign-aware money from a plain number: the sign sits OUTSIDE the $ (−$5K, not
 *  the ungrouped "$-5000" that overflowed cards). */
export function m$(n: number): string {
  return n < 0 ? `-${fmtMoney(Big.of(Math.round(-n)))}` : fmtMoney(Big.of(Math.round(n)));
}

/** Rounded count via the K/M/B formatter. */
export function numOf(n: number): string {
  return fmt(Big.of(Math.round(n)));
}

/** Short, human duration ("90s", "3m 20s", "1h 5m") for research timers. */
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}
