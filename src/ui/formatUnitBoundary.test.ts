import { describe, it, expect, afterEach } from "vitest";
import { Big } from "../engine/math/Big";
import { fmt, fmtMoney } from "./format";
import { useSettings } from "./settings";
import { fmtShort } from "../render/hallRenderer";
import { perUserPrice } from "./ProductDetail";

/**
 * Rounding that crosses a display unit (bug hunt r4, reported-only; fixed r6).
 * The sub-thousand branch rounded with toFixed, so 9.96 read "10.0" (one decimal kept
 * past 10, unlike every other value from 10 up) and 999.6 read "1000" (a four-digit
 * number where every other thousand reads "1K"). The same class lived in the hall's
 * expansion price tag ("$1000.0K") and the per-user price ("$10.0/s ea.").
 */

afterEach(() => useSettings.setState({ scientificNotation: false }));

describe("sub-thousand values that round onto the next unit", () => {
  it("9.96 reads 10, not 10.0", () => {
    expect(Big.of(9.96).format()).toBe("10");
    expect(Big.of(9.94).format()).toBe("9.9");
    expect(fmtMoney(Big.of(9.97))).toBe("$10");
  });

  it("999.6 reads 1K, not 1000", () => {
    expect(Big.of(999.6).format()).toBe("1K");
    expect(Big.of(999.4).format()).toBe("999");
    expect(fmt(Big.of(999.7))).toBe("1K");
  });

  it("the scientific setting carries 999.6 into 1.00e3", () => {
    useSettings.setState({ scientificNotation: true });
    expect(fmt(Big.of(999.6))).toBe("1.00e3");
    expect(fmt(Big.of(999.4))).toBe("999");
  });

  it("rounding down never crosses a unit", () => {
    expect(Big.of(9.96).format(true)).toBe("9.9");
    expect(Big.of(999.6).format(true)).toBe("999");
  });
});

describe("hall expansion price tag", () => {
  it("rolls into the next suffix instead of '$1000.0K'", () => {
    expect(fmtShort(999_960)).toBe("$1.0M");
    expect(fmtShort(999.6)).toBe("$1.0K");
    expect(fmtShort(999_960_000)).toBe("$1.0B");
    expect(fmtShort(1_500)).toBe("$1.5K");
    expect(fmtShort(42)).toBe("$42");
  });
});

describe("per-user price", () => {
  it("drops to the coarser precision once rounding reaches it", () => {
    expect(perUserPrice(9.96)).toBe("$10/s ea.");
    expect(perUserPrice(0.9996)).toBe("$1.0/s ea.");
    expect(perUserPrice(0.009996)).toBe("$0.01/s ea.");
    expect(perUserPrice(2.5)).toBe("$2.5/s ea.");
    expect(perUserPrice(0.004)).toBe("$0.004/s ea.");
  });
});
