import { describe, it, expect } from "vitest";
import { prestige } from "./prestige";
import { tick } from "./tick";
import { launchDraft } from "./products";
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
