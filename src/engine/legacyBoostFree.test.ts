import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { legacyWeightsGain, legacyWeightsForMode, prestige } from "./prestige";
import { tick } from "./tick";
import { claimRun, grantDailyBoost } from "./actions";
import { boostFreeDerive, derive } from "./derive";
import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { ActiveModifier, GameState } from "./types";

/**
 * A timed boost taken while the player lingers at a ship-ready lab used to lift that
 * Ship's Legacy by far more than the boost itself (round 7 audit: about 100x). Legacy
 * is priced on the run's lifetime Money, and a lane boost reaches run payouts through
 * both Compute and Money (squared), so a x2 all-lane boost quadrupled the Legacy base
 * while it ran. The Legacy base now accrues income priced with timed buffs divided
 * out; everything the player sees as Money, and all-time earnings, still count the
 * boost in full.
 */

/** A ship-ready lab with auto-claim/auto-train running and passive income. */
function lab(): GameState {
  const s = createInitialState();
  s.prestige.ships = 5;
  s.stats.totalShips = 5;
  s.research = balance.research.map((r) => r.id);
  s.lifetimeMoney = Big.of(1e9);
  s.stats.totalMoney = Big.of(1e9);
  s.upgrades = { ...s.upgrades, rack_basic: 20, rack_server: 10, rack_tpu: 5, monetize: 5, auto_claim: 1, auto_train: 1, batching: 3 };
  s.computeFocus = 1;
  return s;
}

const allLanes = (id: string, factor: number, sec: number): ActiveModifier[] =>
  (["computeMult", "dataMult", "moneyMult"] as const).map((target) => ({
    id: `${id}_${target}`, target, factor, remainingSec: sec, label: `x${factor}`, tone: factor < 1 ? "bad" as const : "good" as const,
  }));

/** Equal up to one training run's payout: a boost shifts when the runs land, so the
 *  last one can fall either side of the window's edge. */
const near = (a: Big, b: Big) => Math.abs(a.toNumber() / b.toNumber() - 1) < 0.02;

function linger(s: GameState, sec: number): GameState {
  for (let i = 0; i < sec * 10; i++) s = tick(s, 100);
  return s;
}

describe("a timed boost can't multiply a Ship's Legacy", () => {
  it("a x2 boost claimed at ship-ready earns at most 2x (here: the same) Legacy as of the same lab without it", () => {
    const plain = linger(lab(), 240);
    const boosted = linger({ ...lab(), modifiers: allLanes("daily", 2, 180) }, 240);
    const p = legacyWeightsGain(plain), b = legacyWeightsGain(boosted);
    expect(b.lte(p.mul(2))).toBe(true);
    // No purchases in between, so the boost buys nothing that lasts: the Ship pays
    // what boost-free play pays (it used to pay about 2x here, 4x on what lingering added).
    expect(near(b, p)).toBe(true);
    expect(near(boosted.lifetimeMoney, plain.lifetimeMoney)).toBe(true);
    // The boost is still worth having: the Money it paid is real, and so is the lab's
    // all-time earnings record.
    expect(boosted.resources.money.gt(plain.resources.money.mul(3))).toBe(true);
    expect(boosted.stats.totalMoney.gt(plain.stats.totalMoney.mul(3))).toBe(true);
  });

  it("the Daily Boost, a world-event buff and a stacked Objective boost are all divided out", () => {
    const plain = linger(lab(), 200);
    let s = grantDailyBoost(lab());
    s = { ...s, modifiers: [...s.modifiers, ...allLanes("ev_boom", 1.8, 120), { id: "obj_o_money4", target: "moneyMult", factor: 2.7, remainingSec: 100, label: "x", tone: "good" }] };
    const boosted = linger(s, 200);
    for (const mode of Object.keys(balance.prestige.shipModes) as (keyof typeof balance.prestige.shipModes)[]) {
      expect(near(legacyWeightsForMode(boosted, mode), legacyWeightsForMode(plain, mode)), mode).toBe(true);
    }
    expect(near(prestige(boosted).prestige.legacyWeights, prestige(plain).prestige.legacyWeights)).toBe(true);
  });

  it("a debuff still costs Legacy, as it always has (only buffs are divided out)", () => {
    const plain = linger(lab(), 120);
    const hurt = linger({ ...lab(), modifiers: allLanes("ev_outage", 0.5, 120) }, 120);
    expect(hurt.lifetimeMoney.lt(plain.lifetimeMoney)).toBe(true);
  });

  it("a hand-claimed run is priced boost-free for Legacy too, but pays its full Money", () => {
    const ready = (mods: ActiveModifier[]): GameState => {
      const s = lab();
      return { ...s, upgrades: { ...s.upgrades, auto_claim: 0, auto_train: 0 }, modifiers: mods, run: { active: false, progress: 1, readyToClaim: true, focus: 1 } };
    };
    const a = claimRun(ready([]));
    const b = claimRun(ready(allLanes("daily", 2, 180)));
    expect(b.lifetimeMoney.toNumber()).toBeCloseTo(a.lifetimeMoney.toNumber(), 3);
    expect(b.resources.money.gt(a.resources.money.mul(3))).toBe(true);
    expect(b.stats.totalMoney.sub(lab().stats.totalMoney).gt(a.stats.totalMoney.sub(lab().stats.totalMoney).mul(3))).toBe(true);
  });

  it("with no timed buff the boost-free pricing is the live derive itself (honest play is untouched)", () => {
    const s = lab();
    const d = derive(s);
    expect(boostFreeDerive(s, d)).toBe(d);
    const withDebuff = { ...s, modifiers: allLanes("ev_outage", 0.5, 60) };
    const dd = derive(withDebuff);
    expect(boostFreeDerive(withDebuff, dd)).toBe(dd);
  });
});
