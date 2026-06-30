/**
 * Research categories (legibility subsystem) — DATA only. The research tree grows
 * to 20+ nodes; a flat list buries the structure. Grouping nodes into a handful of
 * themed categories lets the Research panel reveal the tree's shape in waves
 * (GDD spine: "Research tree is the progression spine; reveal depth in waves" +
 * "Legibility is the feature"). This is pure presentation metadata — it has ZERO
 * gameplay effect, never touches `derive`, and so leaves the tuned curve untouched.
 *
 * `src/engine/researchCategories.ts` is the pure accessor; the Research panel uses
 * it to group nodes under category headers. Every research id MUST appear here
 * (guarded by a test), so adding a node forces a deliberate category choice.
 */

export interface ResearchCategoryDef {
  id: string;
  /** Display label shown as the group header. */
  name: string;
  /** One-line framing for the category (satirical voice, the design spine). */
  blurb: string;
}

/** Display order of the categories (top → bottom in the panel). */
export const researchCategories: ResearchCategoryDef[] = [
  { id: "foundations", name: "Foundations", blurb: "The papers everyone cites and no one reads." },
  { id: "efficiency", name: "Efficiency", blurb: "Do more with the GPUs you already overpaid for." },
  { id: "scale", name: "Scale", blurb: "Bigger. Always bigger. The investors insist." },
  { id: "product", name: "Product", blurb: "Turning research into recurring revenue (allegedly)." },
  { id: "frontier", name: "Frontier", blurb: "Where the roadmap ends and the hand-waving begins." },
];

/** id → category id. Every research node is assigned exactly one category. */
export const researchCategoryOf: Record<string, string> = {
  // — Foundations —
  backprop: "foundations",
  curated_data: "foundations",
  mixed_precision: "foundations",
  data_aug: "foundations",
  // — Efficiency —
  caching: "efficiency",
  distillation: "efficiency",
  flash_attention: "efficiency",
  quantization: "efficiency",
  // — Scale —
  distributed: "scale",
  moe: "scale",
  scaling_laws: "scale",
  synthetic_data: "scale",
  multi_datacenter: "scale",
  // — Product —
  rlhf: "product",
  inference_api: "product",
  closed_api: "product",
  open_weights: "product",
  // — Frontier —
  world_model: "frontier",
  recursive_self_improvement: "frontier",
  sparse_arch: "frontier",
  dense_scaling: "frontier",
  aligned_path: "frontier",
  accelerationist_path: "frontier",
};
