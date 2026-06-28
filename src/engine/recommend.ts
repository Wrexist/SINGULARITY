import { balance } from "./balance/config";
import { derive } from "./derive";
import { upgradeCost, canBuyUpgrade } from "./actions";
import { powerStats } from "./power";
import { totalRacks } from "./hall";
import type { GameState } from "./types";

/**
 * "Recommended next" upgrade — the best-VALUE buy, not the cheapest one.
 *
 * The old heuristic just picked the cheapest affordable upgrade, which could
 * recommend a strictly-worse buy: e.g. a Consumer GPU Rack (+2 compute/s for
 * $106) over a Server GPU Rack (+12 compute/s for $220) — the player gets ~2.9×
 * more compute per dollar from the Server rack. This scores each affordable
 * upgrade by its marginal benefit per cost and recommends the highest.
 *
 * Benefit is measured in a single currency — "money-equivalent throughput" — so
 * heterogeneous upgrades (flat compute, multipliers, passive data, even power
 * capacity when it's unthrottling you) compare on one axis. Each lane is priced
 * via the run's OWN exchange rates (compute→money and data→money), so the score
 * needs no magic weights. Pure & deterministic (folds through `derive`).
 */

type UpgradeDef = (typeof balance.upgrades)[number];

const isExpansionKind = (k: string) => k === "floorCols" || k === "floorRows";

/**
 * Money-equivalent productive throughput of a state. Values the compute lane by
 * how much money a unit of compute yields through a run, and the passive-data
 * lane by money/data co-production, then adds passive money. Higher = a more
 * productive lab. (runComputeCost scales with compute, so money-per-compute
 * reduces to a constant × moneyMult — stable regardless of current compute.)
 */
function moneyEquivRate(state: GameState): number {
  const d = derive(state);
  const runMoney = d.runMoneyYield.toNumber();
  const runCompute = d.runComputeCost.toNumber();
  const runData = d.runDataYield.toNumber();
  const moneyPerCompute = runCompute > 0 ? runMoney / runCompute : 0;
  const moneyPerData = runData > 0 ? runMoney / runData : 0;
  return (
    d.passiveMoneyPerSec.toNumber() +
    d.computePerSec.toNumber() * moneyPerCompute +
    d.dataPerSec.toNumber() * moneyPerData
  );
}

/** An upgrade's cost converted to money-equivalent (so data-priced upgrades —
 *  the only non-money cost any upgrade uses — compare on the same scale). The
 *  data→money rate is the run's own co-production ratio (money/data per run). */
function costMoneyEquiv(state: GameState, def: UpgradeDef): number {
  const cost = upgradeCost(def, state.upgrades[def.id] ?? 0).toNumber();
  if (def.cost.resource === "money") return cost;
  const d = derive(state);
  const runMoney = d.runMoneyYield.toNumber();
  const runData = d.runDataYield.toNumber();
  return runData > 0 ? cost * (runMoney / runData) : cost;
}

/** Visible, non-maxed, currently-buyable upgrades — the same set the panel shows. */
function candidates(state: GameState): UpgradeDef[] {
  const racks = totalRacks(state);
  const showExpansions = racks >= balance.hall.expansionRevealRacks;
  const power = powerStats(state);
  const showPower = balance.power.enabled && power.drawKw >= balance.power.revealAtDrawKw;
  return balance.upgrades.filter((def) => {
    if (def.market === "darkweb") return false;
    if (!showExpansions && isExpansionKind(def.effect.kind)) return false;
    if (!showPower && def.effect.kind === "powerCapacity") return false;
    if ((state.upgrades[def.id] ?? 0) >= def.max) return false;
    return canBuyUpgrade(state, def.id);
  });
}

/**
 * The id of the best-value upgrade to buy next, or null if nothing is buyable.
 * NOTE: on a full floor, a higher-tier rack evicts a lower one — the simulated
 * "after" state here doesn't model the eviction, so a replacing rack's gain is
 * slightly overstated; acceptable for a hint (it still favours the better tier).
 */
export function recommendedUpgrade(state: GameState): string | null {
  const cands = candidates(state);
  if (cands.length === 0) return null;

  const base = moneyEquivRate(state);
  let best: { id: string; value: number; cost: number } | null = null;
  for (const def of cands) {
    // Simulate owning one more level and measure the marginal throughput gain.
    // A shallow clone with a fresh upgrades map is enough — derive() only reads
    // (never mutates) state, and the employees array reference is preserved so
    // the staff-aggregation memo still hits.
    const after: GameState = {
      ...state,
      upgrades: { ...state.upgrades, [def.id]: (state.upgrades[def.id] ?? 0) + 1 },
    };
    const gain = moneyEquivRate(after) - base;
    const cost = costMoneyEquiv(state, def);
    const value = cost > 0 ? gain / cost : 0;
    if (!best || value > best.value || (value === best.value && cost < best.cost)) {
      best = { id: def.id, value, cost };
    }
  }

  // Nothing measurably moved the needle (e.g. only automations / floor expansions
  // are affordable) — fall back to the cheapest so the panel still has an anchor.
  if (!best || best.value <= 0) {
    const cheapest = cands.reduce((a, b) =>
      upgradeCost(a, state.upgrades[a.id] ?? 0).toNumber() <=
      upgradeCost(b, state.upgrades[b.id] ?? 0).toNumber()
        ? a
        : b,
    );
    return cheapest.id;
  }
  return best.id;
}
