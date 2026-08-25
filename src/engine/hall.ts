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

/** Tiles the multi-room view gives up to walkways (the renderer skips them), so
 *  capacity == the drawable tile count and every owned rack manifests. */
function reservedWalkways(game: GameState): number {
  const { cols, rows } = hallDims(game);
  const { splitGx, splitGy } = hallRoomSplit(game);
  return (
    (splitGx !== null ? rows : 0) +
    (splitGy !== null ? cols : 0) -
    (splitGx !== null && splitGy !== null ? 1 : 0) // shared corner counted once
  );
}

/**
 * FACILITY WINGS (2026-08).
 *
 * The lease runs out. `wingCapacity` is clamped by `maxDrawnRacks`, and the floor
 * hits that clamp at expansion 3/3 — so the last level of each expansion bought
 * escalating money for almost nothing, and past 120 racks the lab could not grow
 * again, ever. The whole "your rented closet becomes a planet-scale cluster"
 * promise stopped at one room.
 *
 * A wing is a WHOLE additional floor, funded with Lab Reputation rather than money:
 * you have leased everything the block has, so the next room is founded on the lab's
 * standing instead. The renderer draws ONE wing at a time, so total capacity grows
 * without a single frame ever drawing more boxes than the cap allows — the
 * manifestation rule survives intact: every owned rack is one visible box, in its
 * wing.
 *
 * Curve-safe by the established meta-currency argument: the deploy-only sim earns
 * Reputation but never spends it (the same reason Paradigm Research and the Endowment
 * are safe), so `facilityWings` stays 0 for it and `hallCapacity` is byte-identical
 * to the pre-wings value.
 */

/** Floors the facility has. Always ≥ 1 — the original hall is wing 1. */
export function hallWings(game: GameState): number {
  return 1 + Math.max(0, game.facilityWings ?? 0);
}

/**
 * How many rack slots ONE floor holds. Capped by `maxDrawnRacks` so the renderer
 * never has to draw more boxes than that in a frame (perf) — which also keeps the
 * manifestation rule honest: every owned rack is one visible box.
 */
export function wingCapacity(game: GameState): number {
  const { cols, rows } = hallDims(game);
  return Math.min(cols * rows - reservedWalkways(game), balance.hall.maxDrawnRacks);
}

/** Total rack slots across every wing. Identical to `wingCapacity` until the first
 *  wing is founded, so every existing save and the sim are unaffected. */
export function hallCapacity(game: GameState): number {
  return wingCapacity(game) * hallWings(game);
}

/** True when the CURRENT floor's geometry already meets the per-frame draw cap, so
 *  another expansion level would add tiles that can hold no rack. Buying into that is
 *  a dead purchase; the Build panel stops offering it and points at a wing instead. */
export function floorDrawnOut(game: GameState): boolean {
  const { cols, rows } = hallDims(game);
  return cols * rows - reservedWalkways(game) >= balance.hall.maxDrawnRacks;
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
