import type { GameState } from "../engine/types";

/**
 * The hall VIEW-MODEL: a pure description of what to draw, derived from game
 * state. No canvas, no React, no engine mutation — just "given the lab, what's
 * in the room?". The renderer consumes this; the manifestation rule (every
 * purchasable rack appears in the hall) lives here as a count→racks mapping.
 */

export interface HallRack {
  /** 0 = consumer GPU, 1 = server GPU, 2 = TPU pod. Drives size/colour. */
  tier: number;
  /** 0..1 — how loaded this rack reads (height/glow), grows as you buy more. */
  density: number;
}

export interface HallModel {
  racks: HallRack[];
  /** A training run is consuming compute right now (racks "work"). */
  active: boolean;
  readyToClaim: boolean;
  /** 0..1 fill of the current run (drives the work pulse). */
  progress: number;
  /** Visual era (re-skin): 0 garage closet, 1 startup, 2 scale-up. */
  era: number;
  /** Total racks placed (ambient intensity). */
  total: number;
}

// Rack tiers map to the existing hardware upgrades. perTierCap bounds how many
// boxes we DRAW (GDD: "represent 1000 GPUs as one upgraded rack visual, not
// 1000 objects") — past the cap the racks read as fuller/taller, not more.
const TIERS = [
  { id: "rack_basic", cap: 18 },
  { id: "rack_server", cap: 16 },
  { id: "rack_tpu", cap: 12 },
];

export function buildHallModel(game: GameState): HallModel {
  const racks: HallRack[] = [];
  TIERS.forEach((t, tier) => {
    const owned = game.upgrades[t.id] ?? 0;
    const drawn = Math.min(owned, t.cap);
    const density = owned <= 0 ? 0 : Math.min(1, owned / t.cap);
    for (let i = 0; i < drawn; i++) racks.push({ tier, density });
  });

  // Era re-skin: a coarse read of progress so the room visibly evolves.
  let era = 0;
  if (game.prestige.ships > 0 || game.research.includes("inference_api")) era = 2;
  else if (game.research.length >= 2) era = 1;

  return {
    racks,
    active: game.run.active,
    readyToClaim: game.run.readyToClaim,
    progress: game.run.progress,
    era,
    total: racks.length,
  };
}
