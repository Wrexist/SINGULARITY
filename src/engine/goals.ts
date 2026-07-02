import { balance } from "./balance/config";
import { contractBoard } from "./contracts";
import { achievementDefs, achievementProgress } from "./achievements";
import { currentEra, eraName } from "./eras";
import type { GameState } from "./types";

/**
 * The "next goal" carrot — a pure scan across every chase system (eras,
 * contracts, achievements) for the goal CLOSEST to completion. The UI shows it
 * as a quiet, always-ticking progress strip, so the player constantly sees the
 * next thing about to pop ("feel progressing"). Honest by construction: it only
 * reads real progress the systems already track — no timers, nothing to buy.
 * Deterministic; no React, no clock.
 */

export type GoalKind = "era" | "contract" | "achievement";

export interface Goal {
  kind: GoalKind;
  /** Player-facing name of the goal ("Seed Round", "Next era: Startup Garage"). */
  label: string;
  /** What it takes ("Earn $10K lifetime", "4/9 models shipped"). */
  desc: string;
  /** 0..1, always < 1 (completed goals are not candidates). */
  progress: number;
}

/** All goals currently in progress, unordered. Exported for tests/inspection. */
export function goalCandidates(state: GameState): Goal[] {
  const goals: Goal[] = [];

  // Era transitions with a scalar to show. Era 0→1 counts research; eras 2→5
  // count ships. (1→2 is a single named research node — binary, so no bar.)
  const era = currentEra(state);
  const ships = state.prestige.ships;
  if (era === 0 && balance.eras.startupAtResearchCount > 0) {
    goals.push({
      kind: "era",
      label: `Next era: ${eraName(1)}`,
      desc: `${state.research.length}/${balance.eras.startupAtResearchCount} research done`,
      progress: state.research.length / balance.eras.startupAtResearchCount,
    });
  } else if (era >= 2 && era <= 4) {
    const target =
      era === 2 ? balance.eras.frontierAtShips :
      era === 3 ? balance.eras.hyperscalerAtShips :
      balance.eras.agiAtShips;
    if (target > ships) {
      goals.push({
        kind: "era",
        label: `Next era: ${eraName(era + 1)}`,
        desc: `${ships}/${target} models shipped`,
        progress: ships / target,
      });
    }
  }

  // Contracts already on the board and not yet met (a MET one is an action —
  // the advisor owns "go claim it"; this strip owns "you're getting there").
  for (const c of contractBoard(state)) {
    if (!c.ready && c.progress < 1) {
      goals.push({ kind: "contract", label: c.def.title, desc: c.def.desc, progress: c.progress });
    }
  }

  // Achievements: locked and visible. Secret ones stay a surprise.
  const have = new Set(state.achievements);
  for (const def of achievementDefs) {
    if (have.has(def.id) || def.secret) continue;
    const p = achievementProgress(state, def);
    if (p < 1) goals.push({ kind: "achievement", label: def.label, desc: def.desc, progress: p });
  }

  return goals;
}

/** The single goal closest to popping (highest progress), or null when quiet. */
export function nextGoal(state: GameState): Goal | null {
  let best: Goal | null = null;
  for (const g of goalCandidates(state)) {
    if (!best || g.progress > best.progress) best = g;
  }
  return best;
}
