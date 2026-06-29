import { Big } from "../engine/math/Big";
import type { Derived } from "../engine/types";

/** Effective income per second for a resource, amortizing per-run yields over the
 *  run duration (a rough but honest "how fast it's coming in" for ETA estimates).
 *  NOTE: the "money" lane here is base income only (passive + amortized run); live
 *  product net margin and payroll fluctuate, so callers that show money ETAs add
 *  those in (see UpgradePanel). */
export function effRate(d: Derived, resource: "compute" | "data" | "money"): Big {
  const perRun = (yield_: Big) => (d.runDurationSec > 0 ? yield_.div(d.runDurationSec) : Big.ZERO);
  if (resource === "compute") return d.computePerSec;
  if (resource === "data") return d.dataPerSec.add(perRun(d.runDataYield));
  return d.passiveMoneyPerSec.add(perRun(d.runMoneyYield));
}

/** Seconds-to-afford for one resource, or null when affordable / unknowable / too far. */
export function etaSecs(cost: Big, have: Big, rate: Big): number | null {
  if (have.gte(cost) || rate.lte(Big.ZERO)) return null;
  const secs = cost.sub(have).div(rate).toNumber();
  if (!Number.isFinite(secs) || secs <= 0 || secs > 3600 * 24 * 99) return null;
  return secs;
}

/** "~3m" time-to-afford, or null. */
export function fmtEta(cost: Big, have: Big, rate: Big): string | null {
  const secs = etaSecs(cost, have, rate);
  return secs === null ? null : `~${fmtDur(secs)}`;
}

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
  if (!Number.isFinite(ms) || ms < 0) return "0s";
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
  const x = Number.isFinite(n) ? n : 0; // a non-finite product value can't print garbage
  return x < 0 ? `-${fmtMoney(Big.of(Math.round(-x)))}` : fmtMoney(Big.of(Math.round(x)));
}

/** Rounded count via the K/M/B formatter. */
export function numOf(n: number): string {
  return fmt(Big.of(Number.isFinite(n) ? Math.round(n) : 0));
}

/** Short, human duration ("90s", "3m 20s", "1h 5m") for research timers. */
export function fmtDur(sec: number): string {
  if (!Number.isFinite(sec)) return "0s";
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}
