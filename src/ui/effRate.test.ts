import { describe, it, expect } from "vitest";
import { effRate } from "./format";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { tick } from "../engine/tick";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * effRate is what the resource bar's Data/s and $/s, the Research panel's Data ETAs and
 * the Upgrade panel's money ETAs claim. It amortized every run payout over one
 * runDurationSec, but auto-train can only fire as often as Compute refills a run: once
 * speed upgrades push the run under its 2s cost, runs are compute-bound and the claim
 * overstated income by up to 4x. With training held (intensity 0) it still counted run
 * income that was not happening at all.
 */
function lab(focus: number, fast: boolean): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 20, rack_server: 10, auto_claim: 1, auto_train: 1, ...(fast ? { batching: 12 } : {}) };
  s.research = fast ? ["caching", "distillation", "flash_attention"] : [];
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  s.computeFocus = focus;
  return s;
}

/** Real Data/s and $/s over 120s of live 100ms ticks, after a 60s warm-up. */
function measured(s: GameState): { data: number; money: number } {
  for (let i = 0; i < 600; i++) s = tick(s, 100);
  const d0 = s.resources.data;
  const m0 = s.resources.money;
  for (let i = 0; i < 1200; i++) s = tick(s, 100);
  return { data: s.resources.data.sub(d0).toNumber() / 120, money: s.resources.money.sub(m0).toNumber() / 120 };
}

describe("effRate — run income at the cadence auto-train really fires", () => {
  for (const [label, focus, fast] of [
    ["compute-bound runs at full intensity", 1, true],
    ["compute-bound runs at half intensity", 0.5, true],
    ["duration-bound runs", 1, false],
  ] as const) {
    it(`matches what tick() pays: ${label}`, () => {
      const s = lab(focus, fast);
      const d = derive(s);
      const real = measured(s);
      expect(real.money).toBeGreaterThan(0);
      expect(effRate(d, "money", s.computeFocus).toNumber() / real.money).toBeCloseTo(1, 1);
      expect(effRate(d, "data", s.computeFocus).toNumber() / real.data).toBeCloseTo(1, 1);
    });
  }

  it("counts no run income while training is held", () => {
    const s = lab(0, false);
    s.upgrades.web_scraper = 5; // some passive Data so the lane is non-zero
    const d = derive(s);
    expect(effRate(d, "data", 0).eq(d.dataPerSec)).toBe(true);
    expect(effRate(d, "money", 0).eq(d.passiveMoneyPerSec)).toBe(true);
    const real = measured(s);
    expect(real.money).toBeCloseTo(0, 9); // and none is paid
  });
});
