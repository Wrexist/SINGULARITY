import { balance } from "./balance/config";
import type { ResearchDef } from "./balance/config";
import { researchEpochs, type EpochResearchDef } from "./balance/researchEpochs";
import type { GameState } from "./types";

/**
 * The research tree, base + unlocked epochs.
 *
 * `balance.research` is the BASE tree and stays exactly what it always was — it is
 * the array the balance sim iterates and buys greedily, so adding to it moves the
 * tuned curve. Epoch nodes live in their own array and are merged in here, only for
 * a state that owns the gating paradigm. See balance/researchEpochs.ts for the full
 * curve-safety argument.
 *
 * WHICH SCAN TO USE — this distinction is load-bearing, so it is written down:
 *
 *   `researchTree(state)` / `ALL_RESEARCH` — anything that must SEE epoch nodes:
 *   the Research panel, availability and cost lookups, derive's effect application,
 *   and the save sanitizer's id allow-list (an owned epoch node must survive a
 *   round-trip, or the player silently loses it).
 *
 *   `balance.research` (base only) — anything that measures COMPLETION or sets a
 *   THRESHOLD: the Preprints unlock (owning a paradigm must never delay preprints),
 *   the "own N nodes" achievement (must not become harder, or unreachable, for
 *   players without paradigms), the prestige panel's ship-readiness meter, and the
 *   balance sim itself.
 */

/** Every research node that exists anywhere — base and every epoch, gated or not.
 *  For lookups by id ONLY (cost, name, effect); never for availability. */
export const ALL_RESEARCH: readonly ResearchDef[] = [...balance.research, ...researchEpochs];

const EPOCH_BY_ID = new Map<string, EpochResearchDef>(researchEpochs.map((d) => [d.id, d]));

/** Is this id an epoch node (rather than a base-tree node)? */
export function isEpochNode(id: string): boolean {
  return EPOCH_BY_ID.has(id);
}

/** The epoch node for an id, or null for a base-tree node. */
export function epochNode(id: string): EpochResearchDef | null {
  return EPOCH_BY_ID.get(id) ?? null;
}

/**
 * Does this state have the paradigm an epoch node needs? Base-tree nodes are always
 * unlocked. Gated on paradigm OWNERSHIP only — never on ships or era, which the sim
 * reaches; the sim never spends Reputation, so it owns no paradigms, ever.
 */
export function epochUnlocked(state: GameState, id: string): boolean {
  const def = EPOCH_BY_ID.get(id);
  if (!def) return true;
  return state.paradigms.includes(def.requiresParadigm);
}

/** The base tree plus the epoch branches this state has unlocked, in display order. */
export function researchTree(state: GameState): ResearchDef[] {
  const unlocked = researchEpochs.filter((d) => state.paradigms.includes(d.requiresParadigm));
  return unlocked.length === 0 ? (balance.research as ResearchDef[]) : [...balance.research, ...unlocked];
}

/**
 * The epoch branches a given paradigm opens, for the Paradigm panel.
 *
 * Without this the connection is invisible at the moment it matters: a player
 * reads "+45% Compute, forever", buys it, and only discovers the new research
 * branch by chance later. Naming it on the card is what makes a Paradigm read as
 * a key rather than a percentage.
 */
export function epochsForParadigm(paradigmId: string): { epoch: string; nodes: number }[] {
  const out: { epoch: string; nodes: number }[] = [];
  for (const def of researchEpochs) {
    if (def.requiresParadigm !== paradigmId) continue;
    const found = out.find((g) => g.epoch === def.epoch);
    if (found) found.nodes += 1;
    else out.push({ epoch: def.epoch, nodes: 1 });
  }
  return out;
}

/** The epoch branches this state has unlocked, grouped for the Research panel. */
export function unlockedEpochs(state: GameState): { epoch: string; nodes: EpochResearchDef[] }[] {
  const out: { epoch: string; nodes: EpochResearchDef[] }[] = [];
  for (const def of researchEpochs) {
    if (!state.paradigms.includes(def.requiresParadigm)) continue;
    const group = out.find((g) => g.epoch === def.epoch);
    if (group) group.nodes.push(def);
    else out.push({ epoch: def.epoch, nodes: [def] });
  }
  return out;
}
