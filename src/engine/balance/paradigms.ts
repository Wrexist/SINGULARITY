/**
 * Paradigm Research (2026-07 depth pass) — the fix for the audit's #1 finding: the
 * 25-node research tree is byte-identical every generation, so prestige only makes the
 * SAME nodes cheaper, never reveals new ones. Paradigms are genuinely NEW capability
 * nodes that appear only in the deep endgame and are bought with REPUTATION (the meta-
 * currency that otherwise dead-ends), so for the first time a veteran sees research
 * nodes they've never seen before.
 *
 * Curve-safe by construction: cost is Reputation (charged to reputation.spent, like the
 * perk tree + endowment), and the balance sim never spends Reputation — so it owns zero
 * paradigms and `paradigmMods` is identity (all ×1) through the whole tuned run. The ship
 * reveal is a visibility gate only; the curve-safety comes from the meta-currency cost.
 */

export type ParadigmEffectKind = "computeMult" | "dataMult" | "moneyMult" | "globalMult";

export interface ParadigmDef {
  id: string;
  name: string;
  desc: string;
  /** Reputation cost. */
  cost: number;
  /** Optional prerequisite paradigm id. */
  requires?: string;
  effect: { kind: ParadigmEffectKind; value: number };
}

export const paradigms = {
  enabled: true,
  /** The layer reveals in the mid-game (2026-07 pacing pass — was 12). The core research
   *  tree is byte-identical every generation, so ships ~6-12 showed no NEW research nodes;
   *  revealing here, with a cheap entry node below, finally gives the repetitive stretch
   *  its first unseen research. Curve-safe: reveal is a visibility gate only — the sim
   *  never spends Reputation, so it owns zero paradigms regardless of when they appear. */
  revealAtShips: 6,
  list: [
    // Cheap entry node — the affordable "first paradigm" that makes the mid-game reveal
    // land (priced 0.75%/Rep, exactly like the entry nodes below, so it's not a value
    // outlier). Standalone: the natural first buy that opens the layer.
    { id: "para_scaling", name: "Scaling Laws", desc: "Chinchilla-optimal compute, every run. +18% Compute, forever.", cost: 24, effect: { kind: "computeMult", value: 0.18 } },
    // Two entry paradigms — pick a substrate to break the current ceiling.
    { id: "para_neuromorphic", name: "Neuromorphic Compute", desc: "Spiking silicon that thinks in events, not clocks. +45% Compute, forever.", cost: 60, effect: { kind: "computeMult", value: 0.45 } },
    { id: "para_synthetic", name: "Synthetic Cognition", desc: "The model curates its own training reality. +45% Data, forever.", cost: 60, effect: { kind: "dataMult", value: 0.45 } },
    // Deeper nodes — each gated behind an entry paradigm.
    { id: "para_quantum", name: "Quantum Annealed Training", desc: "Optimisation in superposition. +70% Compute, forever.", cost: 180, requires: "para_neuromorphic", effect: { kind: "computeMult", value: 0.7 } },
    { id: "para_biological", name: "Biological Substrates", desc: "Wetware clusters that grow their own capacity. +70% Data, forever.", cost: 180, requires: "para_synthetic", effect: { kind: "dataMult", value: 0.7 } },
    // Capstone — a genuine paradigm shift across the whole lab.
    { id: "para_recursive", name: "Recursive Self-Improvement", desc: "The lab now improves the lab. +35% to ALL output, forever.", cost: 500, requires: "para_quantum", effect: { kind: "globalMult", value: 0.35 } },
  ] satisfies ParadigmDef[],
};
