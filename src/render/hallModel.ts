import { balance } from "../engine/balance/config";
import { canBuyUpgrade, upgradeCost } from "../engine/actions";
import type { GameState } from "../engine/types";
import { currentEra } from "../engine/eras";
import { RACK_IDS, hallDims, hallCapacity, hallRoomSplit, type Dir } from "../engine/hall";

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
  /** The lab is "running the business": a training run OR live products earning.
   *  Keeps the hall visibly alive between manual runs once you have products. */
  busy: boolean;
  readyToClaim: boolean;
  progress: number;
  era: number;
  total: number;
  /** Interior partition lines (tile coords) that split the floor into rooms, or null. */
  splitGx: number | null;
  splitGy: number | null;
  /** Wall-mounted cooling units PER WALL — grows as you buy power/cooling gear so
   *  the manifestation rule holds (GDD §5: "upgrade cooling, fans spin"). */
  coolingUnits: number;
  /** 0..1 overclock intensity (from the Overclock Firmware upgrade). Drives a
   *  hotter rack glow so this software multiplier actually shows in the hall. */
  overclock: number;
  /** Auto-train owned → a little "ops bot" roams the floor (the automation, made
   *  visible). */
  autoBot: boolean;
}

/** Power/cooling infrastructure ids (drive the visible wall units). Exported so
 *  HallCanvas's cache signature derives from the same source and never goes
 *  stale if a new powerCapacity upgrade is added. */
export const POWER_IDS = balance.upgrades.filter((u) => u.effect.kind === "powerCapacity").map((u) => u.id);

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
  const era = currentEra(game);

  // Cooling/power gear manifests as wall units (per wall), capped so a huge
  // facility still reads cleanly (parametric: many → one upgraded visual).
  const powerLevels = POWER_IDS.reduce((s, id) => s + (game.upgrades[id] ?? 0), 0);
  const coolingUnits = Math.min(3, (era >= 2 ? 1 : 0) + powerLevels);

  // Manifest software upgrades that used to change only a number: overclock makes
  // racks visibly run hotter; auto-train puts a little ops bot on the floor.
  const overclock = Math.min(1, (game.upgrades["overclock"] ?? 0) * 0.1);
  const autoBot = (game.upgrades["auto_train"] ?? 0) > 0;

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
    busy: game.run.active || game.products.active.length > 0,
    readyToClaim: game.run.readyToClaim,
    progress: game.run.progress,
    era,
    total: racks.length,
    coolingUnits,
    overclock,
    autoBot,
    ...hallRoomSplit(game),
  };
}
