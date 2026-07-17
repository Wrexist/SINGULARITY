/**
 * The Institute (2026-07) — the third meta-layer, above AGI ascension. Ascension used
 * to dead-end into a linear +8% and a decisionless Endowment; the Institute gives the
 * deepest players a whole new tree. It is a SOFT layer: founding wipes NOTHING — your
 * ascensions simply mint "Grants", a meta-currency spent on a small tree of powerful,
 * permanent, content-bearing unlocks. A new mountain, no lost progress.
 *
 * Curve-safe by construction: Grants come only from `stats.ascensions`, and the deploy-
 * only sim never spends them (it never buys a meta perk) — so the Institute tree stays
 * empty and instituteMods is identity through the whole tuned run. (The sim does ascend,
 * so it EARNS Grants — exactly like it earns Reputation it never spends. Earning is
 * harmless; only spending would move the curve, and the sim never spends.)
 */

export type InstituteEffectKind = "computeMult" | "dataMult" | "moneyMult" | "globalMult";

export interface InstitutePerkDef {
  id: string;
  name: string;
  desc: string;
  /** Grants spent to found this wing. */
  cost: number;
  /** Optional prerequisite perk id. */
  requires?: string;
  effect: { kind: InstituteEffectKind; value: number };
}

export const institute = {
  enabled: true,
  /** Ascensions needed before the Institute reveals (the founding milestone). */
  foundAtAscensions: 1,
  /** Grants minted per AGI ascension. */
  grantsPerAscension: 1,
  perks: [
    // Entry wings — one Grant each, so the very first ascension already funds a choice.
    { id: "inst_compute", name: "Institutional Compute", desc: "A national-scale cluster with your name on the door. +40% Compute, forever.", cost: 1, effect: { kind: "computeMult", value: 0.4 } },
    { id: "inst_data", name: "Sovereign Data Trust", desc: "Every archive on Earth, on tap. +40% Data, forever.", cost: 1, effect: { kind: "dataMult", value: 0.4 } },
    { id: "inst_revenue", name: "Endowment Fund", desc: "The Institute's investments compound quietly. +40% Money, forever.", cost: 1, effect: { kind: "moneyMult", value: 0.4 } },
    // Synthesis — a whole-lab boost, gated behind an entry wing.
    { id: "inst_synthesis", name: "Interdisciplinary Synthesis", desc: "The wings talk to each other. +40% to ALL output, forever.", cost: 2, requires: "inst_compute", effect: { kind: "globalMult", value: 0.4 } },
    // Capstone — the reason to keep ascending.
    { id: "inst_singularity", name: "The Singularity Institute", desc: "An institution that outlives any one lab. +80% to ALL output, forever.", cost: 4, requires: "inst_synthesis", effect: { kind: "globalMult", value: 0.8 } },
  ] satisfies InstitutePerkDef[],
};
