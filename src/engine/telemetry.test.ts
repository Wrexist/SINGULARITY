import { describe, it, expect } from "vitest";
import { summarize, purchaseSignature, type TelemetryEvent } from "./telemetry";

describe("telemetry summarize (pure)", () => {
  it("returns a zeroed summary for no events", () => {
    const s = summarize([]);
    expect(s).toEqual({
      sessions: 0,
      totalEvents: 0,
      firstPrestigeSec: null,
      genTimes: [],
      eraArrivalSec: {},
      longestWallSec: 0,
      tabCounts: {},
    });
  });

  it("degrades gracefully on garbage input", () => {
    // @ts-expect-error — exercising the defensive guard
    expect(summarize(null).sessions).toBe(0);
    // @ts-expect-error
    expect(summarize(undefined).totalEvents).toBe(0);
  });

  it("counts sessions and tab switches", () => {
    const ev: TelemetryEvent[] = [
      { kind: "session", t: 1 },
      { kind: "session", t: 2 },
      { kind: "tab", t: 3, tab: "products" },
      { kind: "tab", t: 4, tab: "products" },
      { kind: "tab", t: 5, tab: "lab" },
    ];
    const s = summarize(ev);
    expect(s.sessions).toBe(2);
    expect(s.tabCounts).toEqual({ products: 2, lab: 1 });
    expect(s.totalEvents).toBe(5);
  });

  it("derives per-generation run times from cumulative playtime", () => {
    // playtimeSec survives prestige (monotonic): gen1 ships at 735s, gen2 at 866s.
    const ev: TelemetryEvent[] = [
      { kind: "prestige", t: 10, gen: 1, playtimeSec: 735, weights: 72, era: 3 },
      { kind: "prestige", t: 20, gen: 2, playtimeSec: 866, weights: 110, era: 3 },
    ];
    const s = summarize(ev);
    expect(s.firstPrestigeSec).toBe(735);
    expect(s.genTimes).toEqual([735, 131]); // 866 - 735 = 131
  });

  it("records the EARLIEST playtime per era", () => {
    const ev: TelemetryEvent[] = [
      { kind: "era", t: 1, era: 1, playtimeSec: 120 },
      { kind: "era", t: 2, era: 2, playtimeSec: 300 },
      { kind: "era", t: 3, era: 2, playtimeSec: 50 }, // a later run reached era 2 faster
    ];
    const s = summarize(ev);
    expect(s.eraArrivalSec).toEqual({ 1: 120, 2: 50 });
  });

  it("computes the longest within-generation wall between purchases", () => {
    const ev: TelemetryEvent[] = [
      { kind: "purchase", t: 1, gen: 1, playtimeSec: 10 },
      { kind: "purchase", t: 2, gen: 1, playtimeSec: 25 }, // gap 15
      { kind: "purchase", t: 3, gen: 1, playtimeSec: 90 }, // gap 65  ← longest
      // a different generation's gaps must not chain onto gen 1's
      { kind: "purchase", t: 4, gen: 2, playtimeSec: 5 },
      { kind: "purchase", t: 5, gen: 2, playtimeSec: 15 }, // gap 10
    ];
    const s = summarize(ev);
    expect(s.longestWallSec).toBe(65);
  });
});

describe("purchaseSignature (pure)", () => {
  it("sums upgrade levels plus owned research nodes", () => {
    expect(purchaseSignature({ rack_basic: 3, overclock: 2 }, ["backprop", "rlhf"])).toBe(7);
  });
  it("is zero for an empty fresh state", () => {
    expect(purchaseSignature({}, [])).toBe(0);
  });
  it("ignores non-finite values defensively", () => {
    expect(purchaseSignature({ a: 2, b: NaN as unknown as number }, [])).toBe(2);
  });
});
