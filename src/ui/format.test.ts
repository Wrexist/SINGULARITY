import { describe, it, expect } from "vitest";
import { etaSecs, fmtEta } from "./format";
import { Big } from "../engine/math/Big";

describe("time-to-afford helpers", () => {
  it("returns null when already affordable", () => {
    expect(etaSecs(Big.of(100), Big.of(100), Big.of(5))).toBeNull();
    expect(etaSecs(Big.of(100), Big.of(150), Big.of(5))).toBeNull();
  });

  it("returns null when there is no income", () => {
    expect(etaSecs(Big.of(100), Big.of(0), Big.ZERO)).toBeNull();
  });

  it("computes (cost − have) / rate", () => {
    expect(etaSecs(Big.of(100), Big.of(40), Big.of(6))).toBeCloseTo(10, 5); // 60 / 6
  });

  it("hides absurdly far-out estimates (> 99 days)", () => {
    expect(etaSecs(Big.of(1e12), Big.of(0), Big.of(1))).toBeNull();
  });

  it("formats as a ~duration", () => {
    expect(fmtEta(Big.of(100), Big.of(40), Big.of(6))).toBe("~10s");
    expect(fmtEta(Big.of(100), Big.of(100), Big.of(6))).toBeNull();
  });
});
