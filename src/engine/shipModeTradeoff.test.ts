import { describe, it, expect } from "vitest";
import { prestige, legacyWeightsForMode, type ShipMode } from "./prestige";
import { tick } from "./tick";
import {
  launchDraft, typeDef, pushVersion, startUpgrade, releaseProduct, simulateProducts,
} from "./products";
import { earnedReputation } from "./reputation";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * Ship-mode rebalance (round 8, owner call). A Hard ship leaps the competitive frontier
 * so "your products start behind" for +50% Legacy, but the next version push caught a
 * product straight back up to the leapt frontier, which is HIGHER than a Deploy lab's.
 * So after one push Hard earned more from products than Deploy did, and banked more
 * Legacy: it won on every axis. The rivals' lead now holds for the whole generation
 * the Hard ship starts: pushes, finished upgrades and new launches reach the frontier
 * minus the lead, until the next Ship.
 */
const MODES = Object.keys(balance.prestige.shipModes) as ShipMode[];
const HARD = balance.prestige.shipModes.hard;
const GEN_SEC = 20 * 60;

/** A late run, ready to Ship, with a settled General Assistant on the market. */
function readyLab(): GameState {
  let s = createInitialState();
  s.prestige.ships = 6; // every ship mode unlocked
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e10);
  s.products.frontier = 10;
  s.products.drafts = [{ id: "draft-1", quality: 10, ships: 1 }];
  s = launchDraft(s, { draftId: "draft-1", type: "general", name: "Chat", id: "prod-1" });
  s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, mau: typeDef("general").tam })) } };
  for (let i = 0; i < 600; i++) s = tick(s, 1000);
  return s;
}
const rich = (s: GameState): GameState =>
  ({ ...s, resources: { ...s.resources, compute: Big.of(1e12), data: Big.of(1e12) } });

/** The next run's carried product business: catch every product up with a version
 *  push (the player's first move), then run the portfolio for 20 minutes. */
function nextRunProductMoney(shipped: GameState): number {
  let g = rich(shipped);
  for (const p of g.products.active) g = pushVersion(g, p.id);
  return simulateProducts(g.products, GEN_SEC).moneyDelta;
}

/** What a ship banks (Legacy, Reputation) and what it hands the next run (the carried
 *  products' earnings, a model draft to commercialise, a momentum wave, cash). */
interface Levers { legacy: number; rep: number; products: number; drafts: number; momentum: number; cash: number }
function levers(base: GameState, mode: ShipMode): Levers {
  const shipped = prestige(base, mode);
  const m = balance.prestige.shipModes[mode].momentum;
  return {
    legacy: legacyWeightsForMode(base, mode).toNumber(),
    rep: earnedReputation(shipped),
    products: nextRunProductMoney(shipped),
    drafts: shipped.products.drafts.length,
    momentum: m ? (m.factor - 1) * m.durationSec : 0,
    cash: shipped.resources.money.toNumber(),
  };
}
/** a ≥ b on every lever and > on one: a is simply the better ship. */
function dominates(a: Levers, b: Levers): boolean {
  const keys = Object.keys(a) as (keyof Levers)[];
  return keys.every((k) => a[k] >= b[k] - 1e-9) && keys.some((k) => a[k] > b[k] + 1e-9);
}

describe("ship modes are real trade-offs", () => {
  it("no mode beats another on both what it banks and what it hands the next run", () => {
    const base = readyLab();
    const all = Object.fromEntries(MODES.map((m) => [m, levers(base, m)])) as Record<ShipMode, Levers>;
    for (const a of MODES) {
      for (const b of MODES) {
        if (a !== b) expect(dominates(all[a], all[b]), `${a} dominates ${b}`).toBe(false);
      }
    }
    // The case that used to fail: Hard banks more Legacy, so it must hand over less.
    expect(all.hard.legacy).toBeGreaterThan(all.deploy.legacy);
    expect(all.hard.products).toBeLessThan(all.deploy.products);
  });

  it("a version push in a Hard generation stays behind the frontier by the rivals' lead", () => {
    const hard = rich(prestige(readyLab(), "hard"));
    const pushed = pushVersion(hard, "prod-1");
    const p = pushed.products.active[0]!;
    expect(p.version).toBe(hard.products.active[0]!.version + 1);
    expect(pushed.products.frontier - p.quality).toBeCloseTo(HARD.frontierPenalty, 6);
  });

  it("so does a finished timed upgrade and a brand-new launch, all generation long", () => {
    let g = rich(prestige(readyLab(), "hard"));
    g = startUpgrade(g, "prod-1");
    expect(g.products.active[0]!.upgrade).not.toBeNull();
    for (let i = 0; i < 1800 && g.products.active[0]!.upgrade; i++) g = rich(tick(g, 1000));
    const p = g.products.active[0]!;
    expect(p.upgrade).toBeNull();
    expect(g.products.frontier - p.quality).toBeGreaterThan(HARD.frontierPenalty - 1);
    const launched = releaseProduct(g, { type: "general", name: "Fresh", id: "prod-fresh" });
    const fresh = launched.products.active.find((x) => x.id === "prod-fresh")!;
    expect(launched.products.frontier - fresh.quality).toBeCloseTo(HARD.frontierPenalty, 6);
  });

  it("the lead ends at the next Ship: a Deploy after a Hard catches up in full", () => {
    let g = rich(prestige(readyLab(), "hard"));
    g = { ...g, research: [balance.prestige.capabilityResearch], lifetimeMoney: Big.of(1e10) };
    const next = rich(prestige(g, "deploy"));
    const pushed = pushVersion(next, "prod-1");
    expect(pushed.products.active[0]!.quality).toBeCloseTo(pushed.products.frontier, 6);
  });

  it("a Deploy generation is untouched: a push reaches the frontier", () => {
    const pushed = pushVersion(rich(prestige(readyLab(), "deploy")), "prod-1");
    expect(pushed.products.active[0]!.quality).toBeCloseTo(pushed.products.frontier, 6);
  });
});
