import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { challengeMods } from "./challenges";
import { challenges as C } from "./balance/challenges";
import type { GameState } from "./types";

/**
 * The passive Data lane (scrapers, botnets, Rig Bay interconnects) deliberately skips the
 * research/upgrade/staff `dataMult`, but every PERMANENT all-lane or Data reward reaches
 * it: Legacy, ascension, preprints, reputation, charter, trials, paradigms, doctrine,
 * the Institute, the legacy tree. Grand Challenge rewards ("+30% to ALL output,
 * forever", "+40% Data yield, forever"), the megaproject bonus and the Data / Synthesis
 * Mandates promise the same, and used to be missing from that chain entirely.
 */
function scraperLab(): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 20, web_scraper: 10, botnet: 5 };
  return s;
}

describe("passive Data lane — Grand Challenge / Megaproject / Mandate rewards", () => {
  it("an ALL-output challenge lifts the scraper lane by exactly its Data factor", () => {
    const base = scraperLab();
    const done = { ...base, challenges: { ...base.challenges, completed: ["bitter_lesson"] } };
    const factor = challengeMods(done).data.toNumber();
    expect(factor).toBeCloseTo(1.3, 9);
    const d0 = derive(base);
    const d1 = derive(done);
    expect(d0.dataPerSec.gt(0)).toBe(true);
    expect(d1.dataPerSec.div(d0.dataPerSec).toNumber()).toBeCloseTo(factor, 9);
  });

  it("Mandates and the megaproject bonus reach it too", () => {
    const base = scraperLab();
    const all = C.list.map((c) => c.id);
    const lab = {
      ...base,
      challenges: { ...base.challenges, completed: all },
      megaprojects: { ...base.megaprojects, level: 3, mandates: ["mand_data", "mand_all", "mand_data"] },
    };
    const noMandates = { ...lab, megaprojects: { ...lab.megaprojects, mandates: [] } };
    const ratio = derive(lab).dataPerSec.div(derive(noMandates).dataPerSec).toNumber();
    const expected = challengeMods(lab).data.div(challengeMods(noMandates).data).toNumber();
    expect(expected).toBeGreaterThan(1.2);
    expect(ratio).toBeCloseTo(expected, 9);
  });

  it("is identity with nothing completed (the tuned curve cannot move)", () => {
    const s = scraperLab();
    expect(challengeMods(s).data.toNumber()).toBe(1);
    // Compute-only / money-only rewards never touch the Data lane.
    const computeOnly = { ...s, challenges: { ...s.challenges, completed: ["trillion_context"] } };
    expect(derive(computeOnly).dataPerSec.eq(derive(s).dataPerSec)).toBe(true);
  });
});
