import type { ModifierTarget } from "../types";

/**
 * POST_LAUNCH R3.3 — "Press the Big Red Button": a player-initiated gamble. Events only
 * HAPPEN to you; this one you start. A cooldown-gated button on the hall rolls one of
 * the outcomes below — most are a short surge, some are a small disaster (a "bad"
 * modifier, so it manifests as a workable incident on a rack). Every effect is a
 * TEMPORARY modifier behind a player tap: the balance sim never presses it, so the
 * tuned curve cannot move. Humour lives in the writing, not the math.
 */
export interface BigRedOutcome {
  id: string;
  weight: number;
  target: ModifierTarget;
  factor: number;
  durationSec: number;
  headline: string;
  body: string;
}

export const bigRed = {
  enabled: true,
  /** Unlocks with the first Ship: a brand-new lab already has enough buttons. */
  openAtShips: 1,
  /** Seconds of play between presses. A fresh run (after a Ship) starts ready. */
  cooldownSec: 600,
  outcomes: [
    { id: "emergent", weight: 12, target: "computeMult", factor: 3, durationSec: 90, headline: "Emergent capability!", body: "Nobody knows why it works. Nobody is asking. Compute ×3 for 90s." },
    { id: "viral", weight: 16, target: "moneyMult", factor: 2.5, durationSec: 120, headline: "The demo went viral", body: "A 14-second clip, forty million views, nobody watched to the end. Money ×2.5 for 2 min." },
    { id: "dataset", weight: 16, target: "dataMult", factor: 2.5, durationSec: 120, headline: "A dataset fell off a truck", body: "Legally distinct. Probably. Data ×2.5 for 2 min." },
    { id: "benchmark", weight: 14, target: "computeMult", factor: 1.8, durationSec: 180, headline: "A benchmark fell over", body: "You beat it. Its authors are calling it \"contamination\". Compute ×1.8 for 3 min." },
    { id: "allhands", weight: 12, target: "moneyMult", factor: 1.6, durationSec: 240, headline: "Investor all-hands", body: "You said \"agentic\" eleven times. The wire cleared before lunch. Money ×1.6 for 4 min." },
    { id: "fire", weight: 14, target: "computeMult", factor: 0.6, durationSec: 60, headline: "Small rack fire", body: "Mostly small. Compute ×0.6 for 60s — tap the smoking rack to work the problem." },
    { id: "chatbot", weight: 9, target: "moneyMult", factor: 0.7, durationSec: 75, headline: "The support bot sold a server for $1", body: "Legal says it's binding. Legal is also a chatbot. Money ×0.7 for 75s." },
    { id: "testset", weight: 7, target: "dataMult", factor: 0.6, durationSec: 75, headline: "Someone trained on the test set", body: "Retraction pending. The data team is \"taking a walk\". Data ×0.6 for 75s." },
  ] as BigRedOutcome[],
};
