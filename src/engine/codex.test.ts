import { describe, it, expect } from "vitest";
import { codexUnlocked, codexUnlockedCount, codexEntries, codexBalance, codexBody } from "./codex";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

describe("codex (Field Notes)", () => {
  describe("A4 — entries re-read by tenure + stance", () => {
    const factions = codexBalance.entries.find((e) => e.id === "factions")!;
    const closet = codexBalance.entries.find((e) => e.id === "closet")!;

    it("returns the default body when no variant applies", () => {
      expect(codexBody(createInitialState(), factions)).toBe(factions.body);
    });

    it("a committed doomer vs accel read different faction lore", () => {
      const doomer = codexBody({ ...createInitialState(), alignment: -0.8 }, factions);
      const accel = codexBody({ ...createInitialState(), alignment: 0.8 }, factions);
      expect(doomer).toBe(factions.variants!.doomer);
      expect(accel).toBe(factions.variants!.accel);
      expect(doomer).not.toBe(accel);
    });

    it("a veteran (deep ship count) sees the matured 'closet' entry", () => {
      const fresh = createInitialState();
      expect(codexBody(fresh, closet)).toBe(closet.body);
      const vet = createInitialState();
      vet.stats.totalShips = 5;
      expect(codexBody(vet, closet)).toBe(closet.variants!.veteran!.body);
    });
  });

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

  it("unlocks entries from live (non-stats) state: contracts, market, legacy tree", () => {
    const s = createInitialState();
    const contract = codexBalance.entries.find((e) => e.id === "the_contract")!;
    const tree = codexBalance.entries.find((e) => e.id === "the_tree")!;
    expect(codexUnlocked(s, contract)).toBe(false);
    expect(codexUnlocked(s, tree)).toBe(false);

    s.contracts.completed = ["c1"];
    s.legacyInvestments = ["compute_focus"];
    expect(codexUnlocked(s, contract)).toBe(true);
    expect(codexUnlocked(s, tree)).toBe(true);
  });

  it("market entries unlock from the BEST-so-far rivals stat (one-way, can't re-lock)", () => {
    const s = createInitialState();
    const board = codexBalance.entries.find((e) => e.id === "the_board")!; // rivalsBeaten ≥ 1
    expect(codexUnlocked(s, board)).toBe(false);
    // Live products are empty (live rivalsBeaten would be 0), but the best-so-far
    // stat is what gates the codex — so a past peak keeps the entry unlocked.
    s.stats.bestRivalsBeaten = 1;
    expect(codexUnlocked(s, board)).toBe(true);
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
