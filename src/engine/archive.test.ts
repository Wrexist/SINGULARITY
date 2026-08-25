import { describe, it, expect } from "vitest";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { balance } from "./balance/config";
import { archiveRows, careerArc } from "../ui/ArchiveBoard";
import { Big } from "./math/Big";
import type { GameState } from "./types";

const CAPABILITY = balance.prestige.capabilityResearch;

/** A state that can ship, with a recognisable generation behind it. */
function shippable(over: Partial<GameState> = {}): GameState {
  const s = createInitialState();
  return {
    ...s,
    research: [CAPABILITY, "seed"],
    lifetimeMoney: Big.of(1e9),
    resources: { ...s.resources, money: Big.of(1e9) },
    runPeakCompute: Big.of(1.5e7),
    stats: { ...s.stats, playtimeSec: 900 },
    ...over,
  };
}

/**
 * THE ARCHIVE (2026-08). Every shipped generation leaves a record of what it WAS.
 * Read-only by design: nothing in the engine reads it back, so it has zero economy
 * surface and cannot move the tuned curve — which is the whole reason it is safe to
 * add to a live game.
 */
describe("The Archive", () => {
  it("records the generation at the ship", () => {
    const s = shippable({ charter: "moonshot", employees: [] });
    const e = prestige(s, "open_source").shipLog.at(-1)!;
    expect(e.gen).toBe(1);
    expect(e.mode).toBe("open_source");
    expect(e.charter).toBe("moonshot");
    expect(e.research).toBe(2);
    expect(e.staff).toBe(0);
    expect(e.products).toBe(0);
    expect(e.atSec).toBe(900);
    // Magnitudes, not Bigs — 10^mag recovers the value.
    expect(Big.of(10).pow(e.peakComputeMag!).toNumber()).toBeCloseTo(1.5e7, -2);
    expect(e.legacyMag).toBeGreaterThan(0);
  });

  it("omits a charter that was never flown rather than writing null", () => {
    const e = prestige(shippable({ charter: null })).shipLog.at(-1)!;
    expect("charter" in e).toBe(false);
    expect("trial" in e).toBe(false);
  });

  it("credits a Trial only when the ship actually banked it", () => {
    // A "solo" Trial with staff on the roster fails its condition at ship.
    const withStaff = shippable({
      activeTrial: "trial_solo",
      employees: [{ id: "e1", name: "A", roleId: "researcher", level: 1, trait: null, assignedProductId: null, training: null }],
    });
    const failed = prestige(withStaff);
    expect(failed.trialsDone).not.toContain("trial_solo");
    expect("trial" in failed.shipLog.at(-1)!).toBe(false);

    const solo = prestige(shippable({ activeTrial: "trial_solo", employees: [] }));
    expect(solo.trialsDone).toContain("trial_solo");
    expect(solo.shipLog.at(-1)!.trial).toBe("trial_solo");
  });

  it("numbers generations in order and keeps the most recent within the cap", () => {
    let s = shippable();
    for (let i = 0; i < balance.prestige.shipLogCap + 3; i++) {
      s = { ...prestige(s), research: [CAPABILITY], lifetimeMoney: Big.of(1e9) };
    }
    expect(s.shipLog).toHaveLength(balance.prestige.shipLogCap);
    const gens = s.shipLog.map((e) => e.gen!);
    expect(gens).toEqual([...gens].sort((a, b) => a - b)); // ascending, no gaps in order
    expect(gens.at(-1)).toBe(balance.prestige.shipLogCap + 3); // the newest ship
  });

  it("derives each generation's length by differencing playtime stamps", () => {
    let s = shippable({ stats: { ...createInitialState().stats, playtimeSec: 600 } });
    s = prestige(s);
    s = { ...s, research: [CAPABILITY], lifetimeMoney: Big.of(1e9), stats: { ...s.stats, playtimeSec: 1000 } };
    s = prestige(s);
    const rows = archiveRows(s);
    expect(rows[0]!.durationSec).toBe(600); // first generation: from zero
    expect(rows[1]!.durationSec).toBe(400); // 1000 − 600
  });

  it("reports an unknown duration rather than a wrong one on a pre-v35 entry", () => {
    const s = shippable();
    const shipped = prestige(s);
    // An old entry with no playtime stamp sits before a new one.
    const mixed: GameState = { ...shipped, shipLog: [{ mode: "deploy", era: 0, asc: false }, ...shipped.shipLog] };
    const rows = archiveRows(mixed);
    expect(rows[0]!.durationSec).toBeNull(); // the old entry itself
    expect(rows[1]!.durationSec).toBeNull(); // and the one that would difference against it
    expect(rows[0]!.label).toBeNull();
  });

  it("round-trips a full record through save/load", () => {
    const s = prestige(shippable({ charter: "moonshot" }));
    const back = deserialize(serialize(s));
    expect(back.shipLog).toEqual(s.shipLog);
  });

  it("loads a pre-Archive save unchanged, inventing no history", () => {
    const s0 = createInitialState();
    const raw = JSON.parse(serialize({ ...s0, stats: { ...s0.stats, totalShips: 2 } }));
    raw.version = 34;
    raw.shipLog = [{ mode: "deploy", era: 1, asc: false }, { mode: "sell", era: 2, asc: true }];
    const back = deserialize(JSON.stringify(raw));
    expect(back.shipLog).toEqual([{ mode: "deploy", era: 1, asc: false }, { mode: "sell", era: 2, asc: true }]);
    for (const e of back.shipLog) {
      expect(e.gen).toBeUndefined();
      expect(e.legacyMag).toBeUndefined();
    }
  });

});

describe("The Archive — hostile saves", () => {
  const crafted = (shipLog: unknown[], totalShips = 99) => {
    const s0 = createInitialState();
    const raw = JSON.parse(serialize({ ...s0, stats: { ...s0.stats, totalShips } }));
    raw.shipLog = shipLog;
    return deserialize(JSON.stringify(raw));
  };

  it("drops a hostile optional field but keeps the entry", () => {
    const back = crafted([{
      mode: "deploy", era: 1, asc: false,
      gen: "one", legacyMag: Infinity, peakComputeMag: NaN,
      research: -5, products: 1e12, staff: {}, charter: 7, trial: null, atSec: "soon",
    }]);
    expect(back.shipLog).toHaveLength(1);
    const e = back.shipLog[0]!;
    expect(e.mode).toBe("deploy");
    expect(e.gen).toBeUndefined();
    expect(e.legacyMag).toBeUndefined();
    expect(e.peakComputeMag).toBeUndefined();
    expect(e.research).toBe(0);       // clamped, not dropped
    expect(e.products).toBe(512);     // clamped to the saved-id ceiling
    expect(e.staff).toBeUndefined();
    expect(e.charter).toBeUndefined();
    expect(e.trial).toBeUndefined();
    expect(e.atSec).toBeUndefined();
  });

  it("bounds a magnitude so the Archive can never render Infinity", () => {
    const back = crafted([{ mode: "deploy", era: 1, asc: false, legacyMag: 1e9, peakComputeMag: 1e9 }]);
    const e = back.shipLog[0]!;
    expect(Number.isFinite(Big.of(10).pow(e.legacyMag!).log10())).toBe(true);
    expect(Number.isFinite(Big.of(10).pow(e.peakComputeMag!).log10())).toBe(true);
  });

  it("still refuses a wall of generations the save never earned", () => {
    const flood = Array.from({ length: 5000 }, () => ({ mode: "deploy", era: 5, asc: true, gen: 1 }));
    expect(crafted(flood, 3).shipLog).toHaveLength(3);
    expect(crafted(flood, 9999).shipLog).toHaveLength(balance.prestige.shipLogCap);
  });
});

/**
 * Curve safety (CLAUDE.md hard rule). The Archive is WRITTEN by the sim — it ships,
 * so it fills the log like any player — but nothing ever reads it back. It is the
 * only depth feature so far whose safety needs no gate at all: there is no surface
 * through which it could reach the economy.
 */
describe("The Archive — curve safety", () => {
  it("no derived output depends on the shipLog", () => {
    const s = prestige(shippable({ charter: "moonshot" }));
    const blank: GameState = { ...s, shipLog: [] };
    const stuffed: GameState = {
      ...s,
      shipLog: Array.from({ length: balance.prestige.shipLogCap }, (_, i) => ({
        mode: "deploy", era: 5, asc: true, gen: i + 1, legacyMag: 300,
        peakComputeMag: 300, research: 99, products: 99, staff: 99, atSec: i * 1000,
      })),
    };
    // Compare the WHOLE derived object, not a hand-picked few fields: the claim is
    // that derive cannot see the Archive at all, and a three-field spot check would
    // pass even if some future lane started reading it.
    const stringify = (o: object) => JSON.stringify(o, (_k, v) => (v && typeof v === "object" && "toString" in v && typeof (v as { toNumber?: unknown }).toNumber === "function" ? String(v) : v));
    expect(stringify(derive(blank))).toBe(stringify(derive(stuffed)));
  });

  it("ticks identically with an empty and a full Archive", () => {
    const s = prestige(shippable());
    const blank: GameState = { ...s, shipLog: [] };
    const full: GameState = { ...s, shipLog: Array.from({ length: 40 }, (_, i) => ({ mode: "deploy", era: 3, asc: false, gen: i + 1 })) };
    const ta = tick(blank, 5000), tb = tick(full, 5000);
    expect(ta.resources.compute.toString()).toBe(tb.resources.compute.toString());
    expect(ta.resources.data.toString()).toBe(tb.resources.data.toString());
    expect(ta.resources.money.toString()).toBe(tb.resources.money.toString());
  });
});

/**
 * Regressions found reading back the shipped Archive code (2026-08).
 */
describe("The Archive — capped-log honesty", () => {
  it("does not report a whole career as one generation's length once the log rolls", () => {
    // A log that has already rolled past the cap: the oldest RETAINED entry is
    // generation 41, four hours into the career. Differencing its stamp against zero
    // would print "4h" as the length of that single run.
    const s0 = createInitialState();
    const log = Array.from({ length: 5 }, (_, i) => ({
      mode: "deploy", era: 3, asc: false, gen: 41 + i, atSec: 14_400 + i * 600,
    }));
    const rows = archiveRows({ ...s0, shipLog: log });
    expect(rows[0]!.durationSec).toBeNull();      // no generation below it to measure from
    expect(rows[1]!.durationSec).toBe(600);       // the rest still difference normally
    expect(rows[4]!.durationSec).toBe(600);
  });

  it("still measures the true first generation from zero", () => {
    const s0 = createInitialState();
    const log = [{ mode: "deploy", era: 0, asc: false, gen: 1, atSec: 900 }];
    expect(archiveRows({ ...s0, shipLog: log })[0]!.durationSec).toBe(900);
  });

  it("survives a full career without ever inventing a duration", () => {
    // Ship well past the cap and check no row claims more time than the whole run.
    let s = shippable();
    for (let i = 0; i < balance.prestige.shipLogCap + 10; i++) {
      const shipped = prestige(s);
      // Keep prestige's own stat updates (totalShips, totalLegacy) and add the next
      // generation's play time on top — rebuilding stats from the PRE-ship state would
      // quietly discard them and model a career no player has.
      s = { ...shipped, research: [CAPABILITY], lifetimeMoney: Big.of(1e9),
            stats: { ...shipped.stats, playtimeSec: shipped.stats.playtimeSec + 600 } };
    }
    expect(s.stats.totalShips).toBe(balance.prestige.shipLogCap + 10);
    const rows = archiveRows(s);
    expect(rows).toHaveLength(balance.prestige.shipLogCap);
    expect(rows[0]!.durationSec).toBeNull(); // the log rolled, so the oldest is unknowable
    for (const r of rows.slice(1)) {
      expect(r.durationSec).not.toBeNull();
      expect(r.durationSec!).toBeLessThanOrEqual(s.stats.playtimeSec);
    }
  });
});

/**
 * The career arc — the trace above the rows. Plots `legacyMag` (already a base-10 log)
 * for the CONTIGUOUS RECORDED TAIL only, so it never draws a slope between two points
 * that were never measured together.
 */
describe("The Archive — career arc", () => {
  const withLog = (log: GameState["shipLog"]) => ({ ...createInitialState(), shipLog: log });
  const rec = (gen: number, mag: number) => ({ mode: "deploy", era: 2, asc: false, gen, legacyMag: mag });

  it("needs two recorded generations before it draws anything", () => {
    expect(careerArc(withLog([]))).toBeNull();
    expect(careerArc(withLog([rec(1, 1)]))).toBeNull();
    expect(careerArc(withLog([rec(1, 1), rec(2, 2)]))).not.toBeNull();
  });

  it("plots the recorded tail, oldest first", () => {
    const arc = careerArc(withLog([rec(3, 1.5), rec(4, 2.5), rec(5, 3.5)]))!;
    expect(arc.mags).toEqual([1.5, 2.5, 3.5]);
    expect(arc.from).toBe(3);
    expect(arc.to).toBe(5);
  });

  it("never spans a pre-v35 gap — those generations were never measured", () => {
    const arc = careerArc(withLog([
      { mode: "deploy", era: 1, asc: false },        // pre-v35: recorded nothing
      { mode: "sell", era: 1, asc: false },          // pre-v35
      rec(3, 2), rec(4, 3),
    ]))!;
    expect(arc.mags).toEqual([2, 3]);
    expect(arc.from).toBe(3);
  });

  it("draws nothing when only pre-v35 entries exist", () => {
    expect(careerArc(withLog([
      { mode: "deploy", era: 1, asc: false },
      { mode: "sell", era: 2, asc: true },
    ]))).toBeNull();
  });

  it("stays finite across the magnitudes a real career spans", () => {
    const arc = careerArc(withLog(Array.from({ length: 40 }, (_, i) => rec(i + 1, i * 8))))!;
    expect(arc.mags).toHaveLength(40);
    for (const m of arc.mags) expect(Number.isFinite(m)).toBe(true);
  });
});
