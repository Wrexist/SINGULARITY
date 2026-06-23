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
});
