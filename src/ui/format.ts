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

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
