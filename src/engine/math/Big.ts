import Decimal from "break_infinity.js";

/**
 * Thin wrapper around the BigNumber library (CLAUDE.md hard rule: numbers use a
 * BigNumber abstraction from the start, wrapped so the lib can be swapped).
 *
 * The rest of the engine imports ONLY from this module — never `break_infinity.js`
 * directly. That keeps the dependency swappable and the surface area tiny.
 */
export type BigSource = number | string | Big;

export class Big {
  private d: Decimal;

  private constructor(d: Decimal) {
    this.d = d;
  }

  static of(v: BigSource): Big {
    if (v instanceof Big) return v;
    return new Big(new Decimal(v));
  }

  static get ZERO(): Big {
    return Big.of(0);
  }

  static get ONE(): Big {
    return Big.of(1);
  }

  add(v: BigSource): Big {
    return new Big(this.d.add(Big.of(v).d));
  }

  sub(v: BigSource): Big {
    return new Big(this.d.sub(Big.of(v).d));
  }

  mul(v: BigSource): Big {
    return new Big(this.d.mul(Big.of(v).d));
  }

  div(v: BigSource): Big {
    return new Big(this.d.div(Big.of(v).d));
  }

  pow(v: number): Big {
    return new Big(this.d.pow(v));
  }

  floor(): Big {
    return new Big(this.d.floor());
  }

  abs(): Big {
    return new Big(this.d.abs());
  }

  gte(v: BigSource): boolean {
    return this.d.gte(Big.of(v).d);
  }

  gt(v: BigSource): boolean {
    return this.d.gt(Big.of(v).d);
  }

  lt(v: BigSource): boolean {
    return this.d.lt(Big.of(v).d);
  }

  lte(v: BigSource): boolean {
    return this.d.lte(Big.of(v).d);
  }

  eq(v: BigSource): boolean {
    return this.d.eq(Big.of(v).d);
  }

  max(v: BigSource): Big {
    return new Big(Decimal.max(this.d, Big.of(v).d));
  }

  min(v: BigSource): Big {
    return new Big(Decimal.min(this.d, Big.of(v).d));
  }

  /** For UI ratios only (progress bars etc). May lose precision on huge values. */
  toNumber(): number {
    return this.d.toNumber();
  }

  /** Serialization form — round-trips through Big.of(). */
  toJSON(): string {
    return this.d.toString();
  }

  /** Human-readable idle-game notation: 12, 3.4K, 9.9M, 1.2B … then scientific. */
  format(): string {
    return formatBig(this.d);
  }

  /** Scientific notation for endgame players (settings toggle): 1.23e9 from a
   *  thousand up; sub-thousand stays plain. Display-only, like format(). */
  formatScientific(): string {
    const d = this.d;
    if (Number.isNaN(d.mantissa)) return "0";
    if (d.exponent >= 1e15) return d.mantissa < 0 ? "-∞" : "∞";
    if (d.lt(1000)) return this.format();
    let exp = Math.floor(d.e);
    let mant = d.div(new Decimal(10).pow(exp)).toNumber();
    // toFixed(2) rounds 9.995+ up to "10.00" — carry into the next exponent
    // instead (mirrors formatBig's 999.5 tier roll-up).
    if (mant >= 9.995) { mant /= 10; exp += 1; }
    return `${mant.toFixed(2)}e${exp}`;
  }
}

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

function formatBig(d: Decimal): string {
  // Never render a non-finite value as the nonsense string formatBig would otherwise
  // compute ("1e9000000000000000"). break_infinity stores NaN as mantissa=NaN and ±∞
  // as a sentinel exponent (~9e15), so detect both explicitly. Defensive: every entry
  // path is now sanitized, but a display helper must degrade gracefully regardless.
  if (Number.isNaN(d.mantissa)) return "0";
  if (d.exponent >= 1e15) return d.mantissa < 0 ? "-∞" : "∞";
  if (d.lt(1000)) {
    // Sub-thousand: show integers cleanly, small decimals with one place.
    const n = d.toNumber();
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(n < 10 ? 1 : 0);
  }
  // Determine which 1000-power bucket we land in.
  let exp = Math.floor(d.e); // base-10 exponent
  let tier = Math.floor(exp / 3);
  if (tier < SUFFIXES.length) {
    let scaled = d.div(new Decimal(1000).pow(tier)).toNumber();
    // trim() rounds to integers at ≥100, so 999.5K-and-up would render "1000K".
    // Roll such values into the next tier instead ("1M").
    if (scaled >= 999.5) { tier += 1; scaled /= 1000; }
    if (tier < SUFFIXES.length) return `${trim(scaled)}${SUFFIXES[tier]}`;
  }
  // Beyond named suffixes: scientific notation, e.g. 1.23e42.
  let mantissa = d.div(new Decimal(10).pow(exp)).toNumber();
  // Same boundary in scientific form: 9.995+ would trim to "10e42" — carry it.
  if (mantissa >= 9.995) { mantissa /= 10; exp += 1; }
  return `${trim(mantissa)}e${exp}`;
}

function trim(n: number): string {
  // 1–2 significant decimals, no trailing zeros: 1.2, 12, 999, 1.23
  if (n >= 100) return Math.round(n).toString();
  if (n >= 10) return (Math.round(n * 10) / 10).toString();
  return (Math.round(n * 100) / 100).toString();
}
