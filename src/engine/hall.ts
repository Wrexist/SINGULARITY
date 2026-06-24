import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Pure hall geometry + capacity rules (no React, no canvas). Lives in the engine
 * because rack capacity is now a GAME RULE, not just a view concern: you can only
 * own as many racks as the floor has tiles, so you must expand the hall to grow.
 * Both the engine (purchase gating) and the renderer's view-model consume this.
 */

export const RACK_IDS = ["rack_basic", "rack_server", "rack_tpu"] as const;

export type Dir = "n" | "s" | "e" | "w";

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

/**
 * How many rack slots the current floor holds. Capped by `maxDrawnRacks` so the
 * renderer never has to draw more boxes than that (perf) — which also keeps the
 * manifestation rule honest: every owned rack is one visible box.
 */
export function hallCapacity(game: GameState): number {
  const { cols, rows } = hallDims(game);
  return Math.min(cols * rows, balance.hall.maxDrawnRacks);
}

export function isRackId(id: string): boolean {
  return (RACK_IDS as readonly string[]).includes(id);
}

/** Total racks owned across all tiers — what consumes floor capacity. */
export function totalRacks(game: GameState): number {
  let n = 0;
  for (const id of RACK_IDS) n += game.upgrades[id] ?? 0;
  return n;
}

/** A rack purchase is floor-blocked when the room is full (must expand first). */
export function floorFull(game: GameState): boolean {
  return totalRacks(game) >= hallCapacity(game);
}
