import { Big } from "../engine/math/Big";
import { runsPerSec } from "../engine/derive";
import { productMetrics } from "../engine/products";
import { payrollPaid } from "../engine/employees";
import { useSettings } from "./settings";
import type { Derived, GameState } from "../engine/types";

/** The live portfolio's net margin per second (revenue − serving − marketing), priced
 *  with each product's own mods — staff, the Product Company charter's ×2.5 revenue,
 *  Heat and alignment — exactly as tick() pays it into Money. The Money/s rate and the
 *  money ETAs used the bare figure, so a profitable Product Company lab could read as
 *  losing money (no $/s shown, no money ETAs at all). Non-finite → 0. */
export function productMarginPerSec(game: GameState, d: Derived): number {
  let margin = 0;
  for (const p of game.products.active) {
    margin += productMetrics(p, game.products.frontier, d.productModsById[p.id]).margin;
  }
  return Number.isFinite(margin) ? margin : 0;
}

/** Effective income per second for a resource, amortizing per-run yields over the
 *  runs actually fired — one per run duration, or fewer when Compute can't fund them
 *  that fast, and none while training is held (see runsPerSec). A rough but honest
 *  "how fast it's coming in" for ETA estimates. "compute" is gross production; a
 *  Compute countdown should use computeBankEtaSecs, which knows what runs drain.
 *  NOTE: the "money" lane here is base income only (passive + amortized run); callers
 *  that show a Money rate or ETA fold in product margin and payroll with netMoneyRate. */
export function effRate(d: Derived, resource: "compute" | "data" | "money", computeFocus: number): Big {
  if (resource === "compute") return d.computePerSec;
  const rps = runsPerSec(d, computeFocus);
  if (resource === "data") return d.dataPerSec.add(d.runDataYield.mul(rps));
  return d.passiveMoneyPerSec.add(d.runMoneyYield.mul(rps));
}

/** Money per second as tick() really moves it, from the caller's `base` income
 *  (passive, plus amortized run income where runs count — see effRate). Adds the live
 *  products' net margin WITH the per-product buffs the sim applies (assigned Sales
 *  Execs, SREs, the Product Company charter…), then takes payroll the way tick() does:
 *  out of what the lab earns, never more than payrollMaxShareOfIncome of it. The full
 *  wage bill used to be subtracted instead, so a roster costing more than half the
 *  income read as a loss — the $/s line and every Money ETA vanished while Money
 *  climbed — and the staff product buffs never showed up in the rate at all. */
export function netMoneyRate(game: GameState, d: Derived, base: Big): Big {
  const margin = productMarginPerSec(game, d);
  // tick() counts product profit toward earnings only when the portfolio nets positive.
  const earned = base.add(Big.of(Math.max(0, margin)));
  return base.add(Big.of(margin)).sub(payrollPaid(d.payrollPerSec, earned));
}

/** A seconds-to-afford figure worth showing: finite, positive and under ~99 days; else null. */
export function shownEta(secs: number | null): number | null {
  if (secs === null || !Number.isFinite(secs) || secs <= 0 || secs > 3600 * 24 * 99) return null;
  return secs;
}

/** Seconds-to-afford for one resource, or null when affordable / unknowable / too far. */
export function etaSecs(cost: Big, have: Big, rate: Big): number | null {
  if (have.gte(cost) || rate.lte(Big.ZERO)) return null;
  return shownEta(cost.sub(have).div(rate).toNumber());
}

/** "~3m" time-to-afford, or null. */
export function fmtEta(cost: Big, have: Big, rate: Big): string | null {
  const secs = etaSecs(cost, have, rate);
  return secs === null ? null : `~${fmtDur(secs)}`;
}

/** Format a Big for display — suffix notation by default, scientific when the
 *  player has flipped the endgame setting (IMPROVEMENTS #14). Every display
 *  path routes through here, so one toggle re-skins every number in the app. */
export function fmt(v: Big): string {
  return useSettings.getState().scientificNotation ? v.formatScientific() : v.format();
}

/** A multiplier for display (the "×" is the caller's): two decimals while small
 *  ("1.04", "0.96"), the compact format once it reaches 100 ("250B"). The resource
 *  formatter keeps one decimal under 10, which read a ×1.04 boost or a ×0.96 penalty
 *  as "×1.0". */
export function fmtMult(m: Big): string {
  return m.isFinite() && m.lt(99.995) ? m.toNumber().toFixed(2) : fmt(m);
}

/** Money is shown as currency: $1.2K, $58, etc. */
export function fmtMoney(v: Big): string {
  return `$${fmt(v)}`;
}

/** Format a per-second rate, trimming to the Big formatter. */
export function fmtRate(v: Big): string {
  return `${fmt(v)}/s`;
}

/** A per-hour projection (used by the "while you were away" screen). */
export function fmtPerHour(v: Big, prefix = ""): string {
  return `${prefix}${fmt(v)}/hr`;
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
 *  the ungrouped "$-5000" that overflowed cards). Same precision as fmtMoney — it
 *  used to round to whole dollars first, so a $1.20/s salary read "$1/s" beside a
 *  "$1.2" Payroll /s, and a $0.30/s loss read "-$0". Anything that shows as zero
 *  (under a nickel) is plain "$0", never signed. */
export function m$(n: number): string {
  const x = Number.isFinite(n) ? n : 0; // a non-finite product value can't print garbage
  const a = Math.abs(x);
  if (a < 0.05) return fmtMoney(Big.ZERO);
  return x < 0 ? `-${fmtMoney(Big.of(a))}` : fmtMoney(Big.of(a));
}

/** A signed effect size as a percent: "+6%", "-35%", and — below one percent — one
 *  decimal ("+0.3%", "-0.2%", "+<0.1%"). Whole-percent rounding read a real +0.3%
 *  Compute tilt as "+0%" and a −0.2% loss as "0%" (Math.round gives −0, which prints
 *  unsigned). Exact zero (or a non-finite input) reads "+0%". */
export function fmtSignedPct(x: number): string {
  if (!Number.isFinite(x) || x === 0) return "+0%";
  const sign = x > 0 ? "+" : "-";
  const a = Math.abs(x) * 100;
  const body = a >= 0.95 ? String(Math.round(a)) : a >= 0.05 ? a.toFixed(1) : "<0.1";
  return `${sign}${body}%`;
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
