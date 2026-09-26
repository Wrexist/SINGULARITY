import type { Goal } from "../engine/goals";
import type { AdvisorItem, LabSection } from "../engine/advisor";
import type { GoalsSection } from "./GoalsPanel";

/** The bottom-nav destinations. */
export type AppTab = "lab" | "products" | "employees" | "goals";

/** Where a tap should land: a tab, plus the pane inside it when it has panes. */
export interface Destination {
  tab: AppTab;
  labSection?: LabSection;
  goalsSection?: GoalsSection;
}

/**
 * Where the "Next goal" strip lands: wherever that goal resolves. Contracts and
 * the daily sponsor sit on GOALS › Now (they moved out of Lab › HQ, which used to
 * receive them and now shows no contract at all); achievements and milestones on
 * GOALS › Collection. The road to the first Ship and the first era both advance
 * through research; once shipping is possible, the ship goal lives on HQ.
 */
export function goalDestination(
  goal: Pick<Goal, "kind">,
  ctx: { shipReady: boolean; era: number; labSectioned: boolean },
): Destination {
  if (goal.kind === "achievement" || goal.kind === "milestone") return { tab: "goals", goalsSection: "collection" };
  if (goal.kind === "contract") return { tab: "goals", goalsSection: "now" };
  const toResearch = (goal.kind === "ship" && !ctx.shipReady) || (goal.kind === "era" && ctx.era === 0);
  return ctx.labSectioned ? { tab: "lab", labSection: toResearch ? "research" : "hq" } : { tab: "lab" };
}

/**
 * Where the advisor chip lands: the tab AND the pane that resolves the item. Lab
 * items deep-link into their section only while the section switcher exists —
 * before that the Lab renders Build alone, and setting a hidden section would
 * both dead-tap now and mis-land later. Every GOALS item is a contract or sponsor
 * claim, which lives on Now; without naming the horizon the chip reopened whatever
 * was last viewed, e.g. the achievements wall.
 */
export function nudgeDestination(nudge: Pick<AdvisorItem, "tab" | "section">, labSectioned: boolean): Destination {
  if (nudge.tab === "lab" && nudge.section && labSectioned) return { tab: "lab", labSection: nudge.section };
  if (nudge.tab === "goals") return { tab: "goals", goalsSection: "now" };
  return { tab: nudge.tab };
}
