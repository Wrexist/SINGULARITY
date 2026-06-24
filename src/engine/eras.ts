import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Eras are a derived, deterministic read of progress that drives the hall
 * re-skin and the tentpole transition moment. Pure and testable. Thresholds
 * live in balance; the visual palette lives in the renderer. Phase 1 = eras 0–2.
 *
 * Note: gating is written explicitly for the three Phase-1 eras. When eras 3+
 * arrive, generalize this to walk balance.eras with per-era requirement data.
 */
export const ERA_COUNT = balance.eras.list.length;

export function currentEra(state: GameState): number {
  // Scale-Up survives a prestige reset (research clears, but ships persists).
  if (state.prestige.ships > 0 || state.research.includes(balance.eras.scaleUpAtResearch)) return 2;
  if (state.research.length >= balance.eras.startupAtResearchCount) return 1;
  return 0;
}

export function eraName(era: number): string {
  return balance.eras.list[era]?.name ?? "";
}

export function eraBlurb(era: number): string {
  return balance.eras.list[era]?.blurb ?? "";
}
