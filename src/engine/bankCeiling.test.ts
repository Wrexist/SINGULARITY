import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { derive, computeBankCeiling, computeBankEtaSecs } from "./derive";
import { tick } from "./tick";
import { researchStalled, canBuyResearch } from "./actions";
import { advisorItems } from "./advisor";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * computeBankCeiling promises "under auto-train the Compute bank can never climb past
 * runCost / focus". That holds only while runs are COMPUTE-bound: a run's own duration
 * refills less Compute than the next run costs, so every refill is drained again. Once a
 * run lasts longer than it costs to fund (the base 5s run against a 2s cost, i.e. most
 * of the opening after auto-train), each cycle banks the surplus and the bank climbs
 * without limit — so the panel's "walled, ease intensity" label, the advisor nudge and
 * the TrainingDock's "banks up to" figure all described a wall that is not there.
 */
function lab(fast: boolean, focus = 1): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 20, rack_server: 10, auto_claim: 1, auto_train: 1, ...(fast ? { batching: 12 } : {}) };
  s.research = fast ? ["caching", "distillation"] : [];
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  s.computeFocus = focus;
  return s;
}

/** Highest Compute bank seen over `secs` of live 100ms ticks. */
function peakBank(s: GameState, secs: number): { peak: Big; end: GameState } {
  let peak = Big.ZERO;
  for (let i = 0; i < secs * 10; i++) {
    s = tick(s, 100);
    peak = peak.max(s.resources.compute);
  }
  return { peak, end: s };
}

describe("computeBankCeiling — only a ceiling when runs are compute-bound", () => {
  it("duration-bound runs: the bank climbs past runCost/focus, so there is no ceiling", () => {
    const s = lab(false);
    const d = derive(s);
    expect(d.computePerSec.mul(d.runDurationSec).gt(d.runComputeCost)).toBe(true); // 5s run, 2s cost
    const { peak } = peakBank(s, 60);
    expect(peak.gt(d.runComputeCost.mul(5))).toBe(true); // far past the old "ceiling"
    expect(computeBankCeiling(s, d)).toBeNull();
  });

  it("…so a node the bank reaches by waiting is not reported as walled or stalled", () => {
    const s = lab(false);
    s.resources.data = Big.of(1e9); // Compute is the only thing missing
    const d = derive(s);
    expect(canBuyResearch(s, "backprop")).toBe(false);
    expect(researchStalled(s, d)).toBe(false);
    expect(advisorItems(s, d).some((i) => i.text.toLowerCase().includes("save for it"))).toBe(false);
    // And waiting really does get there, with the slider untouched.
    let t = s;
    let bought = false;
    for (let i = 0; i < 600 && !bought; i++) {
      t = tick(t, 100);
      bought = canBuyResearch(t, "backprop");
    }
    expect(bought).toBe(true);
  });

  it("compute-bound runs: the ceiling is real, and the bank never climbs past it", () => {
    const s = lab(true);
    const d = derive(s);
    expect(d.computePerSec.mul(d.runDurationSec).lt(d.runComputeCost)).toBe(true);
    const ceiling = computeBankCeiling(s, d);
    expect(ceiling).not.toBeNull();
    expect(ceiling!.eq(d.runComputeCost)).toBe(true);
    const { peak } = peakBank(s, 60);
    // One 100ms tick of production is the only slack the tick granularity allows.
    expect(peak.lte(ceiling!.add(d.computePerSec.mul(0.1)))).toBe(true);
  });
});

describe("computeBankEtaSecs — the honest Compute countdown", () => {
  it("matches the climb tick() produces when runs drain the bank above their firing level", () => {
    const s = lab(false);
    const d = derive(s);
    const target = d.runComputeCost.mul(20);
    const eta = computeBankEtaSecs(s, d, s.resources.compute, target)!;
    let t = s;
    let secs = 0;
    while (t.resources.compute.lt(target) && secs < 600) {
      t = tick(t, 100);
      secs += 0.1;
    }
    expect(eta).toBeGreaterThan(secs * 0.85);
    expect(eta).toBeLessThan(secs * 1.15);
    // A raw cost / production figure ignores the runs' drain and promised far sooner.
    expect(target.div(d.computePerSec).toNumber()).toBeLessThan(secs * 0.7);
  });

  it("is full production below the firing level, null past a binding ceiling, raw without auto-train", () => {
    const fast = lab(true);
    const d = derive(fast);
    const ceiling = computeBankCeiling(fast, d)!;
    const below = ceiling.mul(0.5);
    expect(computeBankEtaSecs(fast, d, Big.ZERO, below)).toBeCloseTo(below.div(d.computePerSec).toNumber(), 9);
    expect(computeBankEtaSecs(fast, d, Big.ZERO, ceiling.mul(2))).toBeNull();

    const manual = { ...fast, upgrades: { ...fast.upgrades, auto_train: 0 } };
    const dm = derive(manual);
    const far = ceiling.mul(100);
    expect(computeBankEtaSecs(manual, dm, Big.ZERO, far)).toBeCloseTo(far.div(dm.computePerSec).toNumber(), 9);
    expect(computeBankEtaSecs(manual, dm, far, far)).toBe(0);
  });
});
