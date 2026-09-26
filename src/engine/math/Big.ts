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

  /** True unless this is NaN or ±∞. A tampered/absurd save string (e.g. an exponent
   *  past break_infinity's limit) can construct a non-finite Decimal; callers loading
   *  untrusted values reject those. break_infinity stores NaN as mantissa=NaN and ±∞ as
   *  an exponent sentinel (~9e15), mirroring the detection in formatBig. */
  isFinite(): boolean {
    return !Number.isNaN(this.d.mantissa) && this.d.exponent < 1e15;
  }

  /** For UI ratios only (progress bars etc). May lose precision on huge values. */
  toNumber(): number {
    return this.d.toNumber();
  }

  /** Base-10 magnitude as a native number — finite at ANY scale (unlike
   *  toNumber, which overflows to Infinity past ~1e308). -Infinity at zero.
   *  Pure; used for sparkline normalization and the Reputation records ladder. */
  log10(): number {
    const m = Math.abs(this.d.mantissa);
    return m > 0 ? this.d.exponent + Math.log10(m) : -Infinity;
  }

  /** Serialization form — round-trips through Big.of(). */
  toJSON(): string {
    return this.d.toString();
  }

  /** Human-readable idle-game notation: 12, 3.4K, 9.9M, 1.2B … then scientific.
   *  `down` rounds toward zero at the shown precision instead of to nearest, for the
   *  progress side of an "X / target" counter: 4,996 of 5,000 reads "4.99K", never
   *  the target's own "5K". */
  format(down = false): string {
    return formatBig(this.d, down);
  }

  /** Scientific notation for endgame players (settings toggle): 1.23e9 from a
   *  thousand up; sub-thousand stays plain. Display-only, like format(). `down` as
   *  in format(). */
  formatScientific(down = false): string {
    const d = this.d;
    if (Number.isNaN(d.mantissa)) return "0";
    if (d.exponent >= 1e15) return d.mantissa < 0 ? "-∞" : "∞";
    if (d.lt(1000)) return this.format(down);
    let exp = Math.floor(d.e);
    let mant = d.div(new Decimal(10).pow(exp)).toNumber();
    if (down) return `${floorTo(mant, 2).toFixed(2)}e${exp}`;
    // toFixed(2) rounds 9.995+ up to "10.00" — carry into the next exponent
    // instead (mirrors formatBig's 999.5 tier roll-up).
    if (mant >= 9.995) { mant /= 10; exp += 1; }
    return `${mant.toFixed(2)}e${exp}`;
  }
}

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

function formatBig(d: Decimal, down = false): string {
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
    if (down) return n < 10 ? floorTo(n, 1).toFixed(1) : String(floorTo(n, 0));
    return n.toFixed(n < 10 ? 1 : 0);
  }
  // Determine which 1000-power bucket we land in.
  let exp = Math.floor(d.e); // base-10 exponent
  let tier = Math.floor(exp / 3);
  if (tier < SUFFIXES.length) {
    let scaled = d.div(new Decimal(1000).pow(tier)).toNumber();
    // trim() rounds to integers at ≥100, so 999.5K-and-up would render "1000K".
    // Roll such values into the next tier instead ("1M").
    if (!down && scaled >= 999.5) { tier += 1; scaled /= 1000; }
    if (tier < SUFFIXES.length) return `${trim(scaled, down)}${SUFFIXES[tier]}`;
  }
  // Beyond named suffixes: scientific notation, e.g. 1.23e42.
  let mantissa = d.div(new Decimal(10).pow(exp)).toNumber();
  // Same boundary in scientific form: 9.995+ would trim to "10e42" — carry it.
  if (!down && mantissa >= 9.995) { mantissa /= 10; exp += 1; }
  return `${trim(mantissa, down)}e${exp}`;
}

function trim(n: number, down = false): string {
  // 1–2 significant decimals, no trailing zeros: 1.2, 12, 999, 1.23
  if (down) return String(floorTo(n, n >= 100 ? 0 : n >= 10 ? 1 : 2));
  if (n >= 100) return Math.round(n).toString();
  if (n >= 10) return (Math.round(n * 10) / 10).toString();
  return (Math.round(n * 100) / 100).toString();
}

/** n rounded toward zero to `places` decimals (n ≥ 0). The nudge keeps a value that
 *  sits exactly on a step (1.15 is 1.1499999… in binary) from dropping a whole step. */
function floorTo(n: number, places: number): number {
  const k = 10 ** places;
  return Math.floor(n * k + 1e-9) / k;
}
