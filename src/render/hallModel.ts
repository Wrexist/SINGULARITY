import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";
import { currentEra } from "../engine/eras";

/**
 * The hall VIEW-MODEL: a pure description of what to draw, derived from game
 * state. No canvas, no React, no engine mutation. The manifestation rule lives
 * here: rack counts → boxes, and bought floor expansions → a bigger room that
 * fits more of them.
 */

export interface HallRack {
  /** 0 = consumer GPU, 1 = server GPU, 2 = TPU pod. Drives size/colour. */
  tier: number;
  /** 0..1 — how packed the room reads (height/glow), grows as you fill it. */
  density: number;
}

export interface HallModel {
  racks: HallRack[];
  /** Floor dimensions (grow with expansions). */
  cols: number;
  rows: number;
  active: boolean;
  readyToClaim: boolean;
  progress: number;
  era: number;
  total: number;
}

const RACK_IDS = ["rack_basic", "rack_server", "rack_tpu"];

/** Floor size from base + expansion upgrades. Pure; also used by the renderer. */
export function hallDims(game: GameState): { cols: number; rows: number } {
  let cols = balance.hall.baseCols;
  let rows = balance.hall.baseRows;
  for (const def of balance.upgrades) {
    const level = game.upgrades[def.id] ?? 0;
    if (level <= 0) continue;
    if (def.effect.kind === "floorCols") cols += def.effect.perLevel * level;
    else if (def.effect.kind === "floorRows") rows += def.effect.perLevel * level;
  }
  return { cols, rows };
}

export function buildHallModel(game: GameState): HallModel {
  const { cols, rows } = hallDims(game);
  const capacity = Math.min(cols * rows, balance.hall.maxDrawnRacks);

  const owned = RACK_IDS.map((id) => game.upgrades[id] ?? 0);
  const totalOwned = owned[0]! + owned[1]! + owned[2]!;

  // Boxes shown per tier: everything fits 1:1 until the room is full, then we
  // distribute the capacity proportionally (a packed room reads "full", and the
  // remaining racks are implied by higher density). 1000 GPUs ≠ 1000 objects.
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
    active: game.run.active,
    readyToClaim: game.run.readyToClaim,
    progress: game.run.progress,
    era: currentEra(game),
    total: racks.length,
  };
}
