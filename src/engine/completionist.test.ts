import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { evaluateAchievements, applyAchievements, achievementProgress, achievementDefs } from "./achievements";
import { balance } from "./balance/config";
import { researchEpochs } from "./balance/researchEpochs";
import { deserialize, serialize } from "./save";
import type { GameState } from "./types";

/**
 * "Completionist — Own every research node in a single run" (round 8, owner call).
 * Its threshold is the base research tree's ownable size, but it compared
 * stats.peakResearchCount, which also counts Paradigm Epoch nodes. A veteran with an
 * Epoch branch open could earn it holding only part of the base tree. It now counts
 * the base-tree nodes owned this run; a player who already earned it keeps it.
 */

const COMPLETIONIST = achievementDefs.find((a) => a.id === "research_30")!;

/** One sibling per mutually-exclusive group, every other base node. */
function wholeBaseTree(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of balance.research) {
    if (r.exclusiveGroup) {
      if (seen.has(r.exclusiveGroup)) continue;
      seen.add(r.exclusiveGroup);
    }
    out.push(r.id);
  }
  return out;
}

function lab(research: string[]): GameState {
  const s = createInitialState();
  const paradigms = [...new Set(researchEpochs.map((e) => e.requiresParadigm))];
  return {
    ...s,
    paradigms,
    research,
    stats: { ...s.stats, peakResearchCount: research.length },
  };
}

describe("Completionist measures the base research tree", () => {
  it("the threshold is the whole ownable base tree", () => {
    expect(COMPLETIONIST.threshold).toBe(wholeBaseTree().length);
  });

  it("Epoch nodes do not stand in for missing base nodes", () => {
    const base = wholeBaseTree();
    const epochs = researchEpochs.map((e) => e.id);
    expect(epochs.length).toBeGreaterThan(1);
    // Two base nodes short, padded past the threshold with Epoch nodes.
    const s = lab([...base.slice(0, base.length - 2), ...epochs]);
    expect(s.stats.peakResearchCount).toBeGreaterThanOrEqual(COMPLETIONIST.threshold);
    expect(evaluateAchievements(s)).not.toContain(COMPLETIONIST.id);
    expect(achievementProgress(s, COMPLETIONIST)).toBeLessThan(1);
  });

  it("owning the whole base tree earns it", () => {
    const s = lab(wholeBaseTree());
    expect(evaluateAchievements(s)).toContain(COMPLETIONIST.id);
    expect(achievementProgress(s, COMPLETIONIST)).toBeCloseTo(1, 9);
  });

  it("a player who already earned it keeps it, through a save round-trip and a fresh run", () => {
    const earned: GameState = { ...lab([]), achievements: [COMPLETIONIST.id] };
    const loaded = deserialize(serialize(earned));
    expect(loaded.achievements).toContain(COMPLETIONIST.id);
    expect(applyAchievements(loaded).state.achievements).toContain(COMPLETIONIST.id);
    expect(achievementProgress(loaded, COMPLETIONIST)).toBeLessThan(1); // this run's bar
  });
});
