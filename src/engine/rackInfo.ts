import { balance } from "./balance/config";
import { RACK_IDS } from "./hall";
import type { GameState } from "./types";

/**
 * Tappable-rack info (R2.1) — pure read model for the hall's rack popover. Given a
 * rack tier (0=consumer, 1=server, 2=TPU), report its name, how many you own, and
 * its flat Compute contribution (per rack and tier total). Read-only; no engine
 * mutation, no clock — trivially testable and safe to call on a tap.
 */

export interface RackInfo {
  tier: number;
  id: string;
  name: string;
  desc: string;
  owned: number;
  /** Flat Compute/sec each rack of this tier adds (before global multipliers). */
  computeEach: number;
  /** Flat Compute/sec this whole tier adds (computeEach × owned). */
  computeTotal: number;
}

export function rackInfo(state: GameState, tier: number): RackInfo | null {
  const id = RACK_IDS[tier];
  if (!id) return null;
  const def = balance.upgrades.find((u) => u.id === id);
  if (!def) return null;
  const owned = state.upgrades[id] ?? 0;
  const computeEach = def.effect.kind === "computeFlat" ? def.effect.perLevel : 0;
  return {
    tier,
    id,
    name: def.name,
    desc: def.desc,
    owned,
    computeEach,
    computeTotal: computeEach * owned,
  };
}
