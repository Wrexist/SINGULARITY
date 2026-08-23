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

  /**
   * FELLOWSHIPS (2026-08) — the Institute's infinite tail.
   *
   * The wing tree costs 9 Grants total and Grants arrive one per ascension, so the
   * deepest layer in the game was fully exhausted nine ships after it opened — and it
   * is the LAST panel a player ever unlocks, so the game ended on its flattest note.
   * Once every wing is founded, Grants instead endow Fellowships: an escalating,
   * repeatable chair with a small permanent all-lane boost and a named Fellow.
   *
   * Curve-safe by the same argument as the wings above, quoted verbatim: Grants come
   * only from `stats.ascensions`, and the deploy-only sim never SPENDS them. The gate
   * is stricter still — Fellowships require all 5 wings, which the sim never buys.
   */
  fellowships: {
    enabled: true,
    /** Grants for the first chair; each subsequent one costs ×growth more. */
    baseCost: 2,
    growth: 1.35,
    /** Permanent all-lane boost per chair (additive: mult = 1 + n × perLevel). */
    perLevel: 0.05,
    /** Finite safety bound so a crafted save can't drive the cost sum to Infinity. */
    maxLevel: 500,
    /**
     * Named chairs, in order. Deterministic: chair N is always the same person, so the
     * Institute reads as an institution with a history rather than a counter. Cycles
     * with a numbered suffix past the end of the list (see fellowName).
     */
    names: [
      "The Turing Chair in Machine Cognition",
      "The Lovelace Chair in Program Synthesis",
      "The Shannon Chair in Information Theory",
      "The Hopper Chair in Systems Engineering",
      "The Noether Chair in Symmetry & Invariance",
      "The Wiener Chair in Cybernetics",
      "The McCarthy Chair in Symbolic Reasoning",
      "The Hinton Chair in Representation Learning",
      "The Ashby Chair in Requisite Variety",
      "The Kolmogorov Chair in Complexity",
    ],
  },
};
