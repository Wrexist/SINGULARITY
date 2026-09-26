import { describe, it, expect } from "vitest";
import { earnedReputation, recordsCount, nextRecordProgress, nextRecordMag, reputationBalance } from "./reputation";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";

const R = reputationBalance.records;

/** A lab whose career-peak Compute/sec is `peak`. */
function withPeak(peak: Big | number) {
  const s = createInitialState();
  s.stats = { ...s.stats, peakComputePerSec: typeof peak === "number" ? Big.of(peak) : peak };
  return s;
}

describe("Reputation from personal Compute records", () => {
  it("holds no records on a fresh lab (the sim's first minutes)", () => {
    const s = createInitialState();
    expect(recordsCount(s)).toBe(0);
    expect(nextRecordProgress(s)).toBe(0);
    expect(nextRecordMag(s)).toBe(R.floorMag + 1);
  });

  it("counts each power of ten above the floor, including an exact one", () => {
    expect(recordsCount(withPeak(9_999))).toBe(0);
    expect(recordsCount(withPeak(10 ** (R.floorMag + 1)))).toBe(1);
    expect(recordsCount(withPeak(99_999))).toBe(1);
    expect(recordsCount(withPeak(1e5))).toBe(2);
    expect(recordsCount(withPeak(1e7))).toBe(4);
  });

  it("adds perMagnitude Rep per record to earnedReputation", () => {
    const base = earnedReputation(withPeak(0));
    expect(earnedReputation(withPeak(1e7))).toBe(base + 4 * R.perMagnitude);
  });

  it("caps a runaway or crafted peak", () => {
    const huge = withPeak(Big.of("1e5000"));
    expect(recordsCount(huge)).toBe(R.maxRecords);
    expect(nextRecordMag(huge)).toBeNull();
    expect(nextRecordProgress(huge)).toBe(0);
    expect(Number.isFinite(earnedReputation(huge))).toBe(true);
  });

  it("measures progress to the next record on the log scale", () => {
    expect(nextRecordProgress(withPeak(500))).toBe(0); // below 1K/s: nothing yet
    expect(nextRecordProgress(withPeak(1e4))).toBeCloseTo(0, 9); // a record just taken
    expect(nextRecordProgress(withPeak(5e4))).toBeCloseTo(Math.log10(5), 9);
    expect(nextRecordProgress(withPeak(5e3))).toBeCloseTo(Math.log10(5), 9); // toward the first
    expect(nextRecordMag(withPeak(5e4))).toBe(5);
  });

  it("needs no save field: records come back from the saved peak", () => {
    const s = withPeak(3.2e8);
    const back = deserialize(serialize(s));
    expect(recordsCount(back)).toBe(recordsCount(s));
    expect(earnedReputation(back)).toBe(earnedReputation(s));
  });
});
