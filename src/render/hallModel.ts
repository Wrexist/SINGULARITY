import { balance } from "../engine/balance/config";
import { canBuyUpgrade, upgradeCost } from "../engine/actions";
import type { GameState } from "../engine/types";
import { currentEra } from "../engine/eras";
import { RACK_IDS, hallDims, hallCapacity, type Dir } from "../engine/hall";

export { hallDims, hallExpansion, type Dir } from "../engine/hall";

/**
 * The hall VIEW-MODEL: a pure description of what to draw, derived from game
 * state. The manifestation rule lives here: rack counts → boxes, and floor
 * expansions bought on each SIDE → a bigger room (grown in that direction) that
 * fits more of them. No canvas, no React, no engine mutation.
 */

export interface HallRack {
  /** 0 = consumer GPU, 1 = server GPU, 2 = TPU pod. */
  tier: number;
  /** 0..1 — how packed the room reads (height/glow). */
  density: number;
}

/** A buyable expansion affordance shown on one side of the floor. */
export interface SideMarker {
  dir: Dir;
  id: string;
  cost: number;
  maxed: boolean;
  affordable: boolean;
}

export interface HallModel {
  racks: HallRack[];
  /** Floor dimensions (grow with expansions). */
  cols: number;
  rows: number;
  /** Grid origin offset so growth is directional (west/north push into negatives). */
  gxMin: number;
  gyMin: number;
  sides: SideMarker[];
  active: boolean;
  readyToClaim: boolean;
  progress: number;
  era: number;
  total: number;
}

// Only the two OPEN sides are expandable — the back-left and back-right edges
// have walls (see drawRoom). So no north/west expansion.
const SIDE_DEFS: { dir: Dir; id: string }[] = [
  { dir: "s", id: "expand_s" },
  { dir: "e", id: "expand_e" },
];

const upgById = (id: string) => balance.upgrades.find((u) => u.id === id)!;

function sideMarkers(game: GameState): SideMarker[] {
  return SIDE_DEFS.map(({ dir, id }) => {
    const def = upgById(id);
    const lvl = game.upgrades[id] ?? 0;
    return {
      dir,
      id,
      cost: upgradeCost(def, lvl).toNumber(),
      maxed: lvl >= def.max,
      affordable: canBuyUpgrade(game, id),
    };
  });
}

export function buildHallModel(game: GameState): HallModel {
  const { cols, rows, gxMin, gyMin } = hallDims(game);
  const capacity = hallCapacity(game);

  const owned = RACK_IDS.map((id) => game.upgrades[id] ?? 0);
  const totalOwned = owned[0]! + owned[1]! + owned[2]!;
  const fits = totalOwned <= capacity;
  const density = totalOwned > 0 ? Math.max(0.45, Math.min(1, totalOwned / Math.max(1, capacity))) : 0;

  // Per-tier draw counts. When oversubscribed we downsample proportionally, but
  // flooring each tier independently can leave the floor under-filled (e.g.
  // owned [1,1,100], capacity 10 → [0,0,9]). Distribute the floored-away
  // remainder by largest fractional part so all `capacity` slots are used.
  const drawCounts = fits
    ? [...owned]
    : owned.map((count) => Math.floor((capacity * count) / totalOwned));
  if (!fits) {
    let leftover = capacity - drawCounts.reduce((sum, c) => sum + c, 0);
    const byFraction = owned
      .map((count, tier) => ({ tier, frac: (capacity * count) / totalOwned - drawCounts[tier]! }))
      .sort((a, b) => b.frac - a.frac);
    for (const { tier } of byFraction) {
      if (leftover <= 0) break;
      drawCounts[tier]! += 1;
      leftover--;
    }
  }

  const racks: HallRack[] = [];
  let remaining = capacity;
  for (let tier = 0; tier < drawCounts.length && remaining > 0; tier++) {
    const draw = Math.min(drawCounts[tier]!, remaining);
    for (let i = 0; i < draw; i++) racks.push({ tier, density });
    remaining -= draw;
  }

  return {
    racks,
    cols,
    rows,
    gxMin,
    gyMin,
    sides: sideMarkers(game),
    active: game.run.active,
    readyToClaim: game.run.readyToClaim,
    progress: game.run.progress,
    era: currentEra(game),
    total: racks.length,
  };
}
