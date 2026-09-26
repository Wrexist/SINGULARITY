import { describe, it, expect } from "vitest";
import { prestige } from "./prestige";
import { tick } from "./tick";
import { launchDraft, marketingCap, productMetrics, setProductMarketing, typeDef } from "./products";
import { claimRun, startRun, upgradeCost } from "./actions";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/** A late run, ready to Ship, with one live product carried from an earlier ship. */
function readyToShipWithProduct(): GameState {
  const s = createInitialState();
  s.prestige.ships = 2;
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e8);
  s.products.frontier = 6;
  s.products.drafts = [{ id: "draft-1", quality: 6, ships: 1 }];
  return launchDraft(s, { draftId: "draft-1", type: "code", name: "Coder", id: "prod-1" });
}

/** The fresh lab a moment into the new run: a little Compute/Data already banked. */
function withFreshBank(s: GameState): GameState {
  return { ...s, resources: { ...s.resources, compute: Big.of(1_000), data: Big.of(1_000) } };
}

describe("a version upgrade in flight at the Ship", () => {
  it("does not follow the product into the fresh run and drain its Data/Compute", () => {
    const base = readyToShipWithProduct();
    // "Research v2" tapped late in the run (by hand or by the Version Autopilot): its
    // remaining cost was priced from the OLD run's Data rate (600 s of output).
    const inFlight: GameState = {
      ...base,
      products: {
        ...base.products,
        active: base.products.active.map((p) => ({
          ...p,
          upgrade: { targetVersion: 2, remainingCompute: 18_000, remainingData: 163_824, remainingSec: 80, totalSec: 90 },
        })),
      },
    };

    const control = withFreshBank(prestige(base));
    const shipped = withFreshBank(prestige(inFlight));
    expect(shipped.products.active).toHaveLength(1);

    // Ten seconds into the new generation the lab holds exactly what it would have
    // without the upgrade: nothing drains the Data research needs.
    let a = control;
    let b = shipped;
    for (let i = 0; i < 10; i++) { a = tick(a, 1000); b = tick(b, 1000); }
    expect(b.resources.data.toNumber()).toBeCloseTo(a.resources.data.toNumber(), 6);
    expect(b.resources.compute.toNumber()).toBeCloseTo(a.resources.compute.toNumber(), 6);
    // The half-finished upgrade is simply dropped: its upfront share came out of pools
    // the Ship wipes anyway, and the product keeps its current version.
    expect(b.products.active[0]!.upgrade).toBeNull();
    expect(b.products.active[0]!.version).toBe(1);
  });
});

/** A General Assistant at its whole market with a settled paying base, ready to Ship. */
function saturatedAssistant(): GameState {
  let s = createInitialState();
  s.prestige.ships = 2;
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e8);
  s.products.frontier = 10;
  s.products.drafts = [{ id: "draft-1", quality: 10, ships: 1 }];
  s = launchDraft(s, { draftId: "draft-1", type: "general", name: "Chat", id: "prod-1" });
  s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, mau: typeDef("general").tam })) } };
  for (let i = 0; i < 600; i++) s = tick(s, 1000); // the paying base settles
  return s;
}

/** Play the fresh lab by hand for `sec` seconds: keep a training run going, claim it. */
function playFreshLab(s: GameState, sec: number): GameState {
  let g = s;
  for (let i = 0; i < sec * 4; i++) {
    g = tick(g, 250);
    if (g.run.readyToClaim) g = claimRun(g);
    if (!g.run.active && !g.run.readyToClaim) g = startRun(g);
  }
  return g;
}

const margin = (s: GameState) => {
  const p = s.products.active[0]!;
  return productMetrics(p, s.products.frontier, derive(s).productModsById[p.id]).margin;
};
const firstRack = () => upgradeCost(balance.upgrades.find((u) => u.id === "rack_basic")!, 0);

describe("a marketing campaign carried across the Ship", () => {
  it("can't hold the fresh lab's Money at $0 when the product runs at a loss", () => {
    const base = saturatedAssistant();
    // Dialed to the cap while the old lab's income covered it: the product runs at a loss.
    const atCap = setProductMarketing(base, "prod-1", marketingCap(base.products.active[0]!));
    expect(margin(atCap)).toBeLessThan(0);

    const control = playFreshLab(prestige(setProductMarketing(base, "prod-1", 0)), 60);
    const shipped = playFreshLab(prestige(atCap), 60);
    // A minute in, the lab with no campaign can afford its first rack…
    expect(control.resources.money.gte(firstRack())).toBe(true);
    // …and so can the one that carried the loss-making campaign (it sat at $0 before).
    expect(shipped.resources.money.gte(firstRack())).toBe(true);
  });

  it("cuts a loss-making campaign back to what its own product funds, with headroom", () => {
    const base = saturatedAssistant();
    const atCap = setProductMarketing(base, "prod-1", marketingCap(base.products.active[0]!));
    const shipped = prestige(atCap);
    const p = shipped.products.active[0]!;
    expect(p.marketingPerSec).toBeGreaterThan(0); // growth isn't switched off outright
    expect(p.marketingPerSec).toBeLessThan(atCap.products.active[0]!.marketingPerSec);
    expect(margin(shipped)).toBeGreaterThan(0);
  });

  it("carries a campaign that pays for itself untouched", () => {
    const base = saturatedAssistant();
    const modest = setProductMarketing(base, "prod-1", 1_000);
    expect(margin(modest)).toBeGreaterThan(0);
    expect(prestige(modest).products.active[0]!.marketingPerSec).toBe(1_000);
  });

  it("prices a hard ship's frontier leap into the judgement", () => {
    const base = saturatedAssistant();
    // Pays for itself at today's frontier with a thin margin…
    const m0 = productMetrics(base.products.active[0]!, base.products.frontier);
    const thin = setProductMarketing(base, "prod-1", (m0.mrr - m0.serve) * 0.9);
    const budget = thin.products.active[0]!.marketingPerSec;
    expect(margin(thin)).toBeGreaterThan(0);
    expect(prestige(thin, "deploy").products.active[0]!.marketingPerSec).toBe(budget);
    // …but not once a hard ship leaps the frontier and the paying base will fall away.
    expect(prestige(thin, "hard").products.active[0]!.marketingPerSec).toBeLessThan(budget);
  });
});
