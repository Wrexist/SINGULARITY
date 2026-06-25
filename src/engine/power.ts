import { balance } from "./balance/config";
import { RACK_IDS } from "./hall";
import type { GameState } from "./types";

/**
 * PHASE 2 — Power & Heat (PHASE2_PLAN §P2-A). Pure, deterministic derivation of
 * the power soft-cap: total rack draw vs. power capacity → a `thermalFactor` that
 * throttles Compute when over-subscribed. No React, no mutation.
 *
 * Gated by `balance.power.enabled` (default false): until turned on, derive()
 * never applies the factor, so the live game is unchanged. Power-CAPACITY upgrades
 * (PSU / cooling loop) are added as content when the system is switched on; for
 * now capacity is the flat base budget.
 */

export interface PowerStats {
  /** Total power the racks draw (kW). */
  drawKw: number;
  /** Available power capacity (kW). */
  capacityKw: number;
  /** Compute multiplier from thermal state: 1 when within budget, <1 when throttled. */
  thermalFactor: number;
  /** True when draw exceeds capacity (UI shows a "throttled" warning). */
  throttled: boolean;
}

export function powerStats(game: GameState): PowerStats {
  const p = balance.power;
  let drawKw = 0;
  for (let tier = 0; tier < RACK_IDS.length; tier++) {
    drawKw += (game.upgrades[RACK_IDS[tier]!] ?? 0) * (p.drawPerRackKw[tier] ?? 0);
  }
  let capacityKw = p.baseCapacityKw;
  for (const u of balance.upgrades) {
    if (u.effect.kind === "powerCapacity") {
      capacityKw += (game.upgrades[u.id] ?? 0) * u.effect.perLevel;
    }
  }
  const thermalFactor = drawKw <= capacityKw ? 1 : Math.max(p.throttleFloor, capacityKw / drawKw);
  return { drawKw, capacityKw, thermalFactor, throttled: drawKw > capacityKw };
}
