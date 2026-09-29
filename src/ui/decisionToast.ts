import type { WorldEventResult } from "../engine/actions";

type Choice = NonNullable<WorldEventResult["choices"]>[number];

/** The confirmation toast for a decision-card pick: the decision (its parenthesised
 *  cost/effect note dropped — the summary restates it), what it did, and the tone of
 *  what it did. A costly pick ("Back them — -12% $") used to toast in the win tone,
 *  under the win check-mark. */
export function decisionToast(choice: Choice): { text: string; tone: Choice["tone"] } {
  const decision = choice.label.replace(/\s*\([^)]*\)\s*$/, "");
  return {
    text: choice.summary ? `${decision} — ${choice.summary}` : `Decided: ${decision}`,
    tone: choice.tone ?? "neutral",
  };
}
