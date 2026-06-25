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
  // The multi-room view reserves the split column/row as walkways (the renderer
  // skips those tiles). Subtract them so capacity == the drawable tile count and
  // every owned rack manifests (no silently-undrawn tail racks).
  const { splitGx, splitGy } = hallRoomSplit(game);
  const reserved =
    (splitGx !== null ? rows : 0) +
    (splitGy !== null ? cols : 0) -
    (splitGx !== null && splitGy !== null ? 1 : 0); // shared corner counted once
  return Math.min(cols * rows - reserved, balance.hall.maxDrawnRacks);
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

/**
 * Multi-room view (Phase 2 spectacle): once the floor has been expanded past the
 * base in a direction, it visually splits into rooms at the midpoint of that
 * direction. Pure geometry — returns the grid lines (in tile coords) to divide
 * on, or null for no split. Up to a 2×2 = 4-room facility.
 */
export function hallRoomSplit(game: GameState): { splitGx: number | null; splitGy: number | null } {
  const { cols, rows, gxMin, gyMin } = hallDims(game);
  return {
    splitGx: cols > balance.hall.baseCols ? gxMin + Math.floor(cols / 2) : null,
    splitGy: rows > balance.hall.baseRows ? gyMin + Math.floor(rows / 2) : null,
  };
}

/** How many rooms the lab reads as (1, 2, or 4). */
export function hallRooms(game: GameState): number {
  const { splitGx, splitGy } = hallRoomSplit(game);
  return (splitGx !== null ? 2 : 1) * (splitGy !== null ? 2 : 1);
}

/** Tier rank of a rack id (0 = consumer, 1 = server, 2 = TPU); -1 if not a rack. */
export function rackTier(id: string): number {
  return (RACK_IDS as readonly string[]).indexOf(id);
}

/**
 * When the floor is full, a higher-tier rack upgrades in place by evicting the
 * lowest lower-tier rack you own. Returns that rack's id, or null if there's
 * nothing lower to replace (then you genuinely must expand the hall).
 */
export function evictableRackFor(game: GameState, id: string): string | null {
  const tier = rackTier(id);
  if (tier <= 0) return null; // not a rack, or the lowest tier (nothing below it)
  for (let t = 0; t < tier; t++) {
    const rid = RACK_IDS[t]!;
    if ((game.upgrades[rid] ?? 0) > 0) return rid;
  }
  return null;
}
