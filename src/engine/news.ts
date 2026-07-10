import type { GameState } from "./types";
import { industryNews } from "./balance/news";
import { balance } from "./balance/config";
import { currentEra } from "./eras";
import { playerMarketRank, rivalsBeaten } from "./market";

/**
 * The industry newswire, personalised. A handful of headlines that reference the
 * PLAYER's own standing (rank, era, faction lean, ship count) are mixed in front of
 * the evergreen pool, so the ambient ticker reacts to you and not just the world.
 * Pure flavor — reads state, never writes it, never touches the economy.
 */

/** Lines about the player's lab, chosen for the current state. */
export function reactiveNews(state: GameState): string[] {
  const out: string[] = [];
  const rank = playerMarketRank(state);
  const era = currentEra(state);
  const ships = state.prestige.ships;
  const align = state.alignment;

  if (rank === 1) out.push("Singularity Inc. tops the AI market; rivals announce 'a renewed focus on fundamentals'.");
  else if (rank != null && rank <= 3) out.push("Singularity Inc. cracks the top three; a rival's CFO is 'exploring strategic options'.");

  if (era >= 5) out.push("Singularity Inc. declared post-singularity; its press releases now write themselves — this one included.");
  else if (era >= 4) out.push("Analysts struggle to classify Singularity Inc., settle on 'a hyperscaler, allegedly'.");
  else if (era >= 3) out.push("Singularity Inc. declares itself a 'frontier lab', a term it also coined.");

  if (align <= -0.4) out.push("Safety community praises Singularity Inc.'s caution; e/acc forums log off in disgust.");
  else if (align >= 0.4) out.push("e/acc forums crown Singularity Inc. 'based'; a safety researcher writes a concerned thread.");

  if (ships >= 10) out.push(`Singularity Inc. ships model #${ships + 1}; the press release was written by model #${ships}.`);
  else if (ships >= 1) out.push("Singularity Inc. ships another model; the benchmarks never saw it coming.");

  const beaten = rivalsBeaten(state);
  if (beaten >= 3) out.push(`Singularity Inc. now outranks ${beaten} named rivals, who are 'focusing on safety'.`);

  // Team, scrutiny, and endgame dimensions — so the ticker reacts to more than
  // just market rank. All read-only flavor; the tuned economy never sees these.
  const emps = state.employees.length;
  if (emps >= 25) out.push("Singularity Inc. headcount passes 25; the all-hands needs a bigger room and a shorter agenda.");
  else if (emps >= 10) out.push("Singularity Inc. staffs up again; someone drew an org chart, then quietly deleted it.");

  if (state.heat >= balance.heat.max * 0.66) out.push("Regulators name-check Singularity Inc. in a hearing; the founder 'welcomes thoughtful oversight' through a fixed smile.");

  if (state.repEndowment > 0) out.push("The Singularity Inc. Endowment funds a chair in 'Applied Inevitability' at three universities at once.");
  else if (state.preprints >= 5) out.push(`Singularity Inc. posts preprint #${state.preprints}; peer review is a formality it has elected to skip.`);

  if (state.products.active.length >= 4) out.push("Singularity Inc.'s product line sprawls; even the sales team keeps a cheat sheet.");

  return out;
}

/** The full ticker pool for the current state: reactive lines first, then evergreen. */
export function buildNews(state: GameState): string[] {
  return [...reactiveNews(state), ...industryNews];
}
