import { balance } from "./balance/config";
import { contractBoard, sponsorView } from "./contracts";
import { achievementDefs, achievementProgress } from "./achievements";
import { currentEra, eraName } from "./eras";
import { productMilestones } from "./balance/products";
import { milestoneValue, productsUnlocked } from "./products";
import { canPrestige, shipPath, nextRunMultiplier } from "./prestige";
import { FIRST_SHIP_WORTH_IT } from "./derive";
import type { GameState } from "./types";

/**
 * The "next goal" carrot — a pure scan across every chase system (eras,
 * contracts, achievements) for the goal CLOSEST to completion. The UI shows it
 * as a quiet, always-ticking progress strip, so the player constantly sees the
 * next thing about to pop ("feel progressing"). Honest by construction: it only
 * reads real progress the systems already track — no timers, nothing to buy.
 * Deterministic; no React, no clock.
 */

export type GoalKind = "ship" | "era" | "contract" | "achievement" | "milestone";

export interface Goal {
  kind: GoalKind;
  /** Player-facing name of the goal ("Seed Round", "Next era: Startup Garage"). */
  label: string;
  /** What it takes ("Earn $10K lifetime", "4/9 models shipped"). */
  desc: string;
  /** 0..1, always < 1 (completed goals are not candidates). */
  progress: number;
}

/** Achievement metrics that are collection counters, not something to work toward. */
const UNACTIONABLE = new Set<string>(["themesUnlocked"]);

/** All goals currently in progress, unordered. Exported for tests/inspection. */
export function goalCandidates(state: GameState): Goal[] {
  const goals: Goal[] = [];

  // The first Ship is THE goal of generation 1, and it used to be missing from this
  // strip entirely, so the whole first hour showed whatever side-chase happened to
  // be furthest along. Its progress is the research path the capability node needs.
  if (state.prestige.ships === 0 && !canPrestige(state)) {
    const p = shipPath(state);
    goals.push({
      kind: "ship",
      label: "Ship your first model",
      desc: `${p.done}/${p.total} research on the path`,
      progress: p.total > 0 ? p.done / p.total : 0,
    });
  } else if (state.prestige.ships === 0) {
    // Shippable, but not yet worth much: show the first Ship's value GROWING toward
    // the point where the reset clearly pays (then the advisor says "ship").
    const mult = nextRunMultiplier(state).toNumber();
    if (Number.isFinite(mult) && mult < FIRST_SHIP_WORTH_IT) {
      goals.push({
        kind: "ship",
        label: "Grow your first Ship",
        desc: `next run ×${mult.toFixed(2)} of ×${FIRST_SHIP_WORTH_IT.toFixed(2)}`,
        progress: Math.max(0, Math.min(0.999, (mult - 1) / (FIRST_SHIP_WORTH_IT - 1))),
      });
    }
  }

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

  // The daily sponsor objective (the post-ladder endgame chase) is a live goal too —
  // without this the "always-ticking" strip goes blank once the finite ladder is done.
  const sp = sponsorView(state);
  if (sp && !sp.ready && !sp.claimed && sp.progress < 1) {
    goals.push({ kind: "contract", label: sp.def.title, desc: sp.def.desc, progress: sp.progress });
  }

  // Product milestones: mid-game carrots once the business exists. The board's
  // achieved list persists, so only unreached ladder rungs are candidates.
  if (productsUnlocked(state)) {
    for (const m of productMilestones) {
      if (state.products.milestones.includes(m.id)) continue;
      const v = milestoneValue(state, m.metric);
      if (m.threshold > 0 && v < m.threshold) {
        goals.push({ kind: "milestone", label: m.label, desc: m.desc, progress: v / m.threshold });
      }
    }
  }

  // Achievements: locked and visible. Secret ones stay a surprise.
  const have = new Set(state.achievements);
  for (const def of achievementDefs) {
    // Cosmetic collection counts start part-full (the free themes) and move on their
    // own, so "Wardrobe 67%" beat every real goal from the first second of play.
    if (have.has(def.id) || def.secret || UNACTIONABLE.has(def.metric)) continue;
    const p = achievementProgress(state, def);
    if (p < 1) goals.push({ kind: "achievement", label: def.label, desc: def.desc, progress: p });
  }

  return goals;
}

/** The single goal closest to popping (highest progress), or null when quiet. The
 *  first-Ship goal, while it exists, always wins: it is the run's actual objective,
 *  and a side-chase at 80% must not bury it. */
export function nextGoal(state: GameState): Goal | null {
  let best: Goal | null = null;
  for (const g of goalCandidates(state)) {
    if (g.kind === "ship") return g;
    if (!best || g.progress > best.progress) best = g;
  }
  return best;
}
