import { describe, it, expect } from "vitest";
import { etaSecs, fmtEta, m$, numOf, fmtDur, fmtTime } from "./format";
import { Big } from "../engine/math/Big";

describe("formatters degrade gracefully on non-finite input (security round 2)", () => {
  it("m$ / numOf coerce NaN/Infinity to the zero value (no garbage currency)", () => {
    expect(m$(NaN)).toBe(m$(0));
    expect(m$(Infinity)).toBe(m$(0));
    expect(numOf(NaN)).toBe("0");
    expect(numOf(Infinity)).toBe("0");
  });
  it("fmtDur / fmtTime clamp non-finite + negative to '0s'", () => {
    expect(fmtDur(NaN)).toBe("0s");
    expect(fmtDur(Infinity)).toBe("0s");
    expect(fmtTime(NaN)).toBe("0s");
    expect(fmtTime(-5)).toBe("0s");
  });
});

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
