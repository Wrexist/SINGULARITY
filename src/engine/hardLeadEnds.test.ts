import { describe, it, expect } from "vitest";
import { prestige, type ShipMode } from "./prestige";
import { tick } from "./tick";
import { launchDraft, typeDef, pushVersion, simulateProducts, reachableQuality } from "./products";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * A Hard ship's rival lead ends at the next Ship (round 8). It must END, not turn into
 * a permanent gain: the Hard ship added its leap to the frontier for good, and a
 * product's revenue scales with the quality a push reaches, so from the generation
 * after the Hard one every push landed 6 quality higher than a Deploy-only lab could
 * ever reach, and every later Hard ship stacked another 6. Over two generations Hard
 * out-earned Deploy on products as well as on Legacy.
 */
const GEN_SEC = 20 * 60;
const HARD = balance.prestige.shipModes.hard;

function readyLab(): GameState {
  let s = createInitialState();
  s.prestige.ships = 6;
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
/** Make a fresh run shippable again, as a player who finished it would. */
const shippable = (s: GameState): GameState =>
  ({ ...s, research: [balance.prestige.capabilityResearch], lifetimeMoney: Big.of(1e10) });
/** A run's carried product business after the player's first move (a version push). */
function runProductMoney(g: GameState): number {
  let s = rich(g);
  for (const p of s.products.active) s = pushVersion(s, p.id);
  return simulateProducts(s.products, GEN_SEC).moneyDelta;
}
const twoShips = (first: ShipMode, second: ShipMode) =>
  prestige(shippable(prestige(readyLab(), first)), second);

describe("a Hard ship's rival lead ends at the next Ship", () => {
  it("the generation after a Hard one earns what a Deploy-only lab earns, not more", () => {
    const afterHard = runProductMoney(twoShips("hard", "deploy"));
    const afterDeploy = runProductMoney(twoShips("deploy", "deploy"));
    expect(afterHard).toBeLessThanOrEqual(afterDeploy * 1.0001);
  });

  it("a push after the Hard generation reaches the same quality as a Deploy-only lab's", () => {
    const q = (s: GameState) => pushVersion(rich(s), "prod-1").products.active[0]!.quality;
    expect(q(twoShips("hard", "deploy"))).toBeCloseTo(q(twoShips("deploy", "deploy")), 6);
  });

  it("back-to-back Hard ships keep one lead, they do not stack it", () => {
    const hh = twoShips("hard", "hard");
    const dh = twoShips("deploy", "hard");
    expect(hh.products.frontier).toBeCloseTo(dh.products.frontier, 6);
    expect(hh.products.frontier - reachableQuality(hh)).toBeCloseTo(HARD.frontierPenalty, 6);
  });

  it("the model drafted at the end of a Hard generation is what the lab could build", () => {
    const hard = prestige(readyLab(), "hard");
    const next = prestige(shippable(hard), "deploy");
    const draft = next.products.drafts.at(-1)!;
    expect(draft.quality).toBeCloseTo(reachableQuality(hard), 6);
    expect(draft.quality).toBeLessThanOrEqual(next.products.frontier + 1e-9);
  });
});
