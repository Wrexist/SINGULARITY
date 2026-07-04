import { describe, it, expect } from "vitest";
import { Big } from "./Big";

describe("Big arithmetic", () => {
  it("adds, subtracts, multiplies, divides", () => {
    expect(Big.of(2).add(3).eq(5)).toBe(true);
    expect(Big.of(10).sub(4).eq(6)).toBe(true);
    expect(Big.of(6).mul(7).eq(42)).toBe(true);
    expect(Big.of(20).div(4).eq(5)).toBe(true);
  });

  it("handles values far beyond Number.MAX_VALUE without overflow", () => {
    const huge = Big.of("1e300").mul("1e300"); // 1e600, well past JS max
    expect(huge.gt("1e308")).toBe(true);
  });

  it("compares correctly", () => {
    expect(Big.of(5).gte(5)).toBe(true);
    expect(Big.of(5).gt(5)).toBe(false);
    expect(Big.of(4).lt(5)).toBe(true);
    expect(Big.of(9).max(3).eq(9)).toBe(true);
    expect(Big.of(9).min(3).eq(3)).toBe(true);
  });

  it("round-trips through JSON serialization", () => {
    const v = Big.of("123456789.987");
    const restored = Big.of(v.toJSON());
    expect(restored.eq(v)).toBe(true);
  });
});

describe("Big formatting", () => {
  it("formats sub-thousand values cleanly", () => {
    expect(Big.of(0).format()).toBe("0");
    expect(Big.of(42).format()).toBe("42");
    expect(Big.of(999).format()).toBe("999");
  });

  it("uses K/M/B/T suffixes", () => {
    expect(Big.of(1500).format()).toBe("1.5K");
    expect(Big.of(2_300_000).format()).toBe("2.3M");
    expect(Big.of(5_000_000_000).format()).toBe("5B");
    expect(Big.of(1_200_000_000_000).format()).toBe("1.2T");
  });

  it("falls back to scientific notation past named suffixes", () => {
    const s = Big.of("1.23e42").format();
    expect(s).toMatch(/e42$/);
  });

  it("rolls to the next suffix at rounding boundaries (never '1000K')", () => {
    expect(Big.of(999_990).format()).toBe("1M");
    expect(Big.of(999_400).format()).toBe("999K");
    expect(Big.of(999_990_000).format()).toBe("1B");
    expect(Big.of("9.9999e42").format()).toBe("1e43");
  });
});

describe("Big.formatScientific (endgame notation setting)", () => {
  it("stays plain under a thousand, scientific from 1000 up", () => {
    expect(Big.of(0).formatScientific()).toBe("0");
    expect(Big.of(999).formatScientific()).toBe("999");
    expect(Big.of(1000).formatScientific()).toBe("1.00e3");
    expect(Big.of(1_230_000).formatScientific()).toBe("1.23e6");
    expect(Big.of("1.5e42").formatScientific()).toBe("1.50e42");
  });

  it("degrades gracefully on non-finite values like format()", () => {
    expect(Big.of(Number.NaN).formatScientific()).toBe("0");
  });
});

describe("formatScientific rounding boundary", () => {
  it("carries into the next exponent instead of rendering '10.00eN'", () => {
    expect(Big.of("9.996e42").formatScientific()).toBe("1.00e43");
    expect(Big.of(9995).formatScientific()).toBe("1.00e4");
  });
});
