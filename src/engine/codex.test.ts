import { describe, it, expect } from "vitest";
import { codexUnlocked, codexUnlockedCount, codexEntries, codexBalance } from "./codex";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

describe("codex (Field Notes)", () => {
  it("unlocks the always-on intro and nothing gated above the start", () => {
    const s = createInitialState();
    const intro = codexBalance.entries.find((e) => e.threshold === 0)!;
    expect(codexUnlocked(s, intro)).toBe(true);
    // A high-threshold entry is locked on a fresh lab.
    const agi = codexBalance.entries.find((e) => e.id === "agi")!;
    expect(codexUnlocked(s, agi)).toBe(false);
  });

  it("unlocks entries as the matching lifetime stat crosses the threshold", () => {
    const s = createInitialState();
    s.stats.totalShips = 1;
    expect(codexUnlocked(s, codexBalance.entries.find((e) => e.id === "the_ship")!)).toBe(true);
    s.stats.peakComputePerSec = Big.of(2_000_000);
    expect(codexUnlocked(s, codexBalance.entries.find((e) => e.id === "scaling")!)).toBe(true);
  });

  it("orders unlocked entries before locked ones, and counts correctly", () => {
    const s = createInitialState();
    s.stats.totalShips = 5; // unlocks several
    const views = codexEntries(s);
    const firstLocked = views.findIndex((v) => !v.unlocked);
    // every entry before the first locked one is unlocked
    expect(views.slice(0, firstLocked).every((v) => v.unlocked)).toBe(true);
    expect(codexUnlockedCount(s)).toBe(views.filter((v) => v.unlocked).length);
  });
});
