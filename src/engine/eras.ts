import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Eras are a derived, deterministic read of progress that drives the hall
 * re-skin and the tentpole transition moment. Pure and testable. Thresholds
 * live in balance; the visual palette lives in the renderer.
 *
 * Eras 0–2 gate on early-run progress (research + first ship); eras 3–4 are
 * endgame spectacle gated by how many times you've shipped.
 */
export const ERA_COUNT = balance.eras.list.length;

export function currentEra(state: GameState): number {
  const ships = state.prestige.ships;
  if (ships >= balance.eras.agiAtShips) return 5; // Post-Singularity / AGI
  if (ships >= balance.eras.hyperscalerAtShips) return 4; // Hyperscaler
  if (ships >= balance.eras.frontierAtShips) return 3; // Frontier Lab
  // Scale-Up survives a prestige reset (research clears, but ships persists).
  if (ships > 0 || state.research.includes(balance.eras.scaleUpAtResearch)) return 2;
  if (state.research.length >= balance.eras.startupAtResearchCount) return 1;
  return 0;
}

export function eraName(era: number): string {
  return balance.eras.list[era]?.name ?? "";
}

/** The era press release. `seed` (typically the generation/ships count) rotates
 *  deterministically through the era's pool (R7.4), so re-crossing an era on a
 *  later run reads a fresh headline. Seed 0 = the original blurb. */
export function eraBlurb(era: number, seed = 0): string {
  const def = balance.eras.list[era];
  if (!def) return "";
  const pool = [def.blurb, ...(def.blurbAlts ?? [])];
  return pool[Math.abs(Math.floor(seed)) % pool.length] ?? def.blurb;
}
