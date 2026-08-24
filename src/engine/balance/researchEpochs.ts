import type { ResearchDef } from "./config";

/**
 * RESEARCH EPOCHS — the research a veteran has never seen.
 *
 * The problem (2026-08 audit, Part 5 §3, the deepest structural gap): prestige
 * clears `state.research`, so EVERY generation replays the identical 21-node
 * script in the identical order. The mid-game is where players actually are, and
 * it is the same script on generation 2 and generation 40. Paradigms were the
 * first answer — but they are bought with Reputation and read as statistics, not
 * as new capability.
 *
 * An Epoch is a small tree that only exists once you own its Paradigm. Buy
 * Neuromorphic Compute and the Research panel grows a branch that was not there
 * before; from then on, every generation you climb it. Paradigms stop being a
 * percentage and start being a key.
 *
 * ── CURVE SAFETY (the hard part; CLAUDE.md) ─────────────────────────────────
 * These nodes are deliberately NOT in `balance.research`. That array is what the
 * balance sim iterates and buys greedily, so anything added to it moves the tuned
 * curve — a +6% component set once moved first prestige by ~10 minutes. Keeping
 * epochs in a separate array means the sim cannot see them **by construction**,
 * not merely by a gate someone might later loosen.
 *
 * The second lock is the gate itself: an epoch is available only while its
 * paradigm is owned, and paradigms cost Reputation. The sim earns Reputation and
 * never spends it, so `state.paradigms` is empty in the tuned economy forever.
 * Gate on paradigm ownership ONLY — never on ships or era, which the sim does
 * reach. `npm run sim` must stay byte-identical; there is a test that pins the
 * separation, and one that pins that the epoch tree is unreachable without a
 * paradigm.
 *
 * Costs sit above the base tree's tail (`recursive_self_improvement` is 1.6M
 * compute / 90K data) because an epoch is climbed by a lab that has already
 * finished the standard tree in that generation.
 */
export interface EpochResearchDef extends ResearchDef {
  /** The paradigm that must be OWNED for this node to exist at all. */
  requiresParadigm: string;
  /** Which epoch branch this belongs to — the Research panel groups by it. */
  epoch: string;
}

export const researchEpochs: EpochResearchDef[] = [
  // ── Neuromorphic epoch: spiking silicon. Compute-shaped, with a run-speed
  //    capstone — event-driven hardware finishes runs, it doesn't just hold more.
  {
    id: "epoch_spiking_kernels",
    epoch: "Neuromorphic",
    requiresParadigm: "para_neuromorphic",
    name: "Spiking Kernels",
    desc: "The silicon only fires when something happens. Idle costs nothing, which accountants love more than researchers do.",
    requires: [],
    cost: { compute: 2_400_000, data: 120_000 },
    effect: { kind: "computeMult", factor: 1.6 },
  },
  {
    id: "epoch_event_batching",
    epoch: "Neuromorphic",
    requiresParadigm: "para_neuromorphic",
    name: "Event-Driven Batching",
    desc: "Batches assemble themselves out of whatever arrives. The scheduler is retired with full honours.",
    requires: ["epoch_spiking_kernels"],
    cost: { compute: 6_000_000, data: 400_000 },
    effect: { kind: "runSpeed", factor: 0.82 },
  },
  {
    id: "epoch_dendritic",
    epoch: "Neuromorphic",
    requiresParadigm: "para_neuromorphic",
    name: "Dendritic Compute",
    desc: "Each synapse does its own arithmetic. Nobody can draw the architecture diagram any more, including the architects.",
    requires: ["epoch_event_batching"],
    cost: { compute: 18_000_000, data: 900_000 },
    effect: { kind: "computeMult", factor: 1.9 },
  },

  // ── Synthetic epoch: the model curates its own reality. Data-shaped, ending in
  //    a commercial node — a lab that manufactures its own corpus can sell it.
  {
    id: "epoch_self_curation",
    epoch: "Synthetic",
    requiresParadigm: "para_synthetic",
    name: "Self-Curating Corpus",
    desc: "The model grades its own homework and, unsettlingly, gets better at the subject.",
    requires: [],
    cost: { compute: 1_800_000, data: 200_000 },
    effect: { kind: "dataMult", factor: 1.7 },
  },
  {
    id: "epoch_counterfactual",
    epoch: "Synthetic",
    requiresParadigm: "para_synthetic",
    name: "Counterfactual Corpora",
    desc: "Training on worlds that never happened, to be ready for the one that might.",
    requires: ["epoch_self_curation"],
    cost: { compute: 5_500_000, data: 700_000 },
    effect: { kind: "dataMult", factor: 2.0 },
  },
  {
    id: "epoch_dream_licensing",
    epoch: "Synthetic",
    requiresParadigm: "para_synthetic",
    name: "Dream Licensing",
    desc: "You license the dreams. Legal says this is fine because no court has heard of it yet.",
    requires: ["epoch_counterfactual"],
    cost: { compute: 9_000_000, data: 1_200_000 },
    effect: { kind: "moneyMult", factor: 1.8 },
  },

  // ── Recursive epoch: the capstone paradigm's branch. One mutually-exclusive
  //    fork, so the deepest epoch is a build decision and not just more nodes.
  {
    id: "epoch_self_rewriting",
    epoch: "Recursive",
    requiresParadigm: "para_recursive",
    name: "Self-Rewriting Trainer",
    desc: "The training code improves the training code. The commit log becomes unreadable by Tuesday and unbeatable by Friday.",
    requires: [],
    cost: { compute: 40_000_000, data: 2_500_000 },
    effect: { kind: "runSpeed", factor: 0.75 },
  },
  {
    id: "epoch_wide_search",
    epoch: "Recursive",
    requiresParadigm: "para_recursive",
    name: "Breadth-First Ascent",
    desc: "A thousand mediocre successors, evaluated in parallel. Quantity has a quality all its own.",
    requires: ["epoch_self_rewriting"],
    exclusiveGroup: "epoch_ascent",
    cost: { compute: 120_000_000, data: 6_000_000 },
    effect: { kind: "computeMult", factor: 2.4 },
  },
  {
    id: "epoch_deep_search",
    epoch: "Recursive",
    requiresParadigm: "para_recursive",
    name: "Depth-First Ascent",
    desc: "One successor, refined to a point. It is better than you at your job and gracious about it.",
    requires: ["epoch_self_rewriting"],
    exclusiveGroup: "epoch_ascent",
    cost: { compute: 120_000_000, data: 6_000_000 },
    effect: { kind: "dataMult", factor: 2.4 },
  },
];
