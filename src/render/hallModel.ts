import { balance } from "../engine/balance/config";
import { canBuyUpgrade, upgradeCost } from "../engine/actions";
import type { GameState } from "../engine/types";
import { currentEra } from "../engine/eras";

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

export type Dir = "n" | "s" | "e" | "w";

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

const RACK_IDS = ["rack_basic", "rack_server", "rack_tpu"];
// Only the two OPEN sides are expandable — the back-left and back-right edges
// have walls (see drawRoom). So no north/west expansion.
const SIDE_DEFS: { dir: Dir; id: string }[] = [
  { dir: "s", id: "expand_s" },
  { dir: "e", id: "expand_e" },
];

const upgById = (id: string) => balance.upgrades.find((u) => u.id === id)!;

/** Tiles added on each open side from that side's expansion level. */
export function hallExpansion(game: GameState): Record<Dir, number> {
  const tiles = (id: string): number => {
    const def = upgById(id);
    const lvl = game.upgrades[id] ?? 0;
    const per = def.effect.kind === "floorCols" || def.effect.kind === "floorRows" ? def.effect.perLevel : 0;
    return lvl * per;
  };
  return { n: 0, w: 0, s: tiles("expand_s"), e: tiles("expand_e") };
}

/** Floor size + grid origin from base + open-side expansions. Pure. */
export function hallDims(game: GameState): { cols: number; rows: number; gxMin: number; gyMin: number } {
  const ex = hallExpansion(game);
  return {
    cols: balance.hall.baseCols + ex.e,
    rows: balance.hall.baseRows + ex.s,
    gxMin: 0, // walls anchor the back-left/back-right; the floor grows front/right
    gyMin: 0,
  };
}

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
  const capacity = Math.min(cols * rows, balance.hall.maxDrawnRacks);

  const owned = RACK_IDS.map((id) => game.upgrades[id] ?? 0);
  const totalOwned = owned[0]! + owned[1]! + owned[2]!;
  const fits = totalOwned <= capacity;
  const density = totalOwned > 0 ? Math.max(0.45, Math.min(1, totalOwned / Math.max(1, capacity))) : 0;

  const racks: HallRack[] = [];
  let remaining = capacity;
  for (let tier = 0; tier < owned.length && remaining > 0; tier++) {
    const want = fits ? owned[tier]! : Math.floor((capacity * owned[tier]!) / totalOwned);
    const draw = Math.min(want, remaining);
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
