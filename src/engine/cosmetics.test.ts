import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { Big } from "./math/Big";
import { themeUnlocked, isUnlocked, collectionProgress, unlockHint, themes } from "./cosmetics";

describe("R6.3 — cosmetic unlocks (pure)", () => {
  it("free themes are always unlocked; premium gates on the flag", () => {
    const s = createInitialState();
    expect(themeUnlocked(s, false, "classic")).toBe(true);
    expect(themeUnlocked(s, false, "gold")).toBe(false);
    expect(themeUnlocked(s, true, "gold")).toBe(true);
  });

  it("unknown theme ids are treated as locked", () => {
    expect(themeUnlocked(createInitialState(), true, "nope")).toBe(false);
  });

  it("progress-gated themes unlock at their threshold", () => {
    const s = createInitialState();
    expect(themeUnlocked(s, false, "vaporwave")).toBe(false); // needs 2 ships
    s.stats.totalShips = 2;
    expect(themeUnlocked(s, false, "vaporwave")).toBe(true);

    expect(isUnlocked(s, false, { kind: "peakCompute", n: 1_000_000 })).toBe(false);
    s.stats.peakComputePerSec = Big.of(1_000_000);
    expect(isUnlocked(s, false, { kind: "peakCompute", n: 1_000_000 })).toBe(true);

    expect(isUnlocked(s, false, { kind: "playtimeHours", n: 5 })).toBe(false);
    s.stats.playtimeSec = 5 * 3600;
    expect(isUnlocked(s, false, { kind: "playtimeHours", n: 5 })).toBe(true);
  });

  it("unlocks are MONOTONIC across a prestige (read only lifetime stats)", () => {
    let s = createInitialState();
    s.stats.totalShips = 4;
    expect(themeUnlocked(s, false, "carbon")).toBe(true);
    s = prestige(s, "deploy"); // research/resources reset, lifetime stats persist
    expect(themeUnlocked(s, false, "carbon")).toBe(true); // still earned
  });

  it("collectionProgress counts the free wardrobe at a fresh start", () => {
    const free = themes.filter((t) => t.unlock.kind === "free").length;
    const p = collectionProgress(createInitialState(), false);
    expect(p.total).toBe(themes.length);
    expect(p.owned).toBe(free);
  });

  it("unlockHint gives readable 'how to earn' text", () => {
    expect(unlockHint({ kind: "ships", n: 2 })).toBe("Ship 2 models");
    expect(unlockHint({ kind: "peakCompute", n: 1_000_000 })).toBe("Reach 1M Compute/s");
    expect(unlockHint({ kind: "totalMoney", n: 1_000_000_000 })).toBe("Earn $1B all-time");
    expect(unlockHint({ kind: "ascensions", n: 1 })).toBe("Ascend to AGI");
    expect(unlockHint({ kind: "premium" })).toBe("Premium unlock");
  });
});
