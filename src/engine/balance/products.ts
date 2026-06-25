/**
 * PHASE 3 — AI Product / Deployment system ("Ship It"). Tunable data only.
 * Full design + the real-world grounding for these ratios live in
 * PHASE3_PRODUCTS_PLAN.md. Numbers are a first pass — expect heavy tuning via the
 * balance sim. Products cost Compute+Data to BUILD/version and earn Money to
 * OPERATE (subs − serving − marketing); customers/MRR are NOT new resources.
 */

export type ProductTypeId =
  | "general" | "code" | "reasoning" | "multimodal" | "small" | "domain";

export type SegmentSkew = "consumer" | "prosumer" | "enterprise" | "api";

export interface ProductTypeDef {
  id: ProductTypeId;
  name: string;
  blurb: string;
  segment: SegmentSkew;
  /** Total addressable market (max MAU). */
  tam: number;
  /** Money/sec per paid user at price ×1, quality 1. */
  baseArpu: number;
  /** Fraction of paid users lost per second at price ×1, no staleness. */
  baseChurn: number;
  /** Target paid/MAU ratio at price ×1, fully competitive. */
  baseConversion: number;
  /** Money/sec serving cost per paid user at quality 1 (inference opex). */
  computePerUser: number;
  /** Organic word-of-mouth growth factor per second. */
  virality: number;
  /** Sensitivity to hype world-events (used later). */
  hype: number;
  /** Regulatory Heat added per second while the product has paying users. */
  heatPerSec: number;
}

export const products = {
  /** Unlocks once you've shipped at least this many models (prestige.ships). */
  unlockAtShips: 1,
  /** How many products can run at once (owner: "a few concurrent"). */
  maxActive: 3,

  /** Compute + Data to train and release v1. */
  releaseCost: { compute: 50_000, data: 5_000 },
  /** Base Compute + Data to push the next version; ×growth^(version-1). */
  versionCost: { compute: 30_000, data: 3_000 },
  versionCostGrowth: 1.6,

  /** Competitor capability drifts up over time; your quality is set to the
   *  frontier each time you release/version, then falls behind. */
  frontierStart: 1,
  frontierGrowthPerSec: 0.004,
  /** Extra churn multiplier per unit of (frontier − quality) gap. */
  stalenessChurn: 0.6,

  /** Marketing: users acquired ≈ spend / CAC; CAC rises as you saturate the TAM. */
  marketingCacBase: 120,
  cacSaturation: 5,
  /** How fast paid count eases toward its conversion target (per second). */
  convSpeed: 0.08,

  /** A fresh release / new version spikes acquisition + cuts churn briefly. */
  buzzDurationSec: 45,
  buzzAcqMult: 3,
  buzzChurnMult: 0.4,

  /** Player pricing strategy bounds (×ARPU; higher = more $/user, less conversion). */
  priceMin: 0.5,
  priceMax: 2,

  types: [
    {
      id: "general", name: "General Assistant",
      blurb: "Mass-market chat. Huge reach, low ARPU, leaky bucket. Goes viral.",
      segment: "consumer", tam: 1.0e7, baseArpu: 0.0006, baseChurn: 0.0009,
      baseConversion: 0.03, computePerUser: 0.00012, virality: 0.025, hype: 1.0, heatPerSec: 0,
    },
    {
      id: "code", name: "Code & Agentic",
      blurb: "Ships software for devs & teams. High ARPU, very sticky, pricey to serve.",
      segment: "prosumer", tam: 6.0e5, baseArpu: 0.012, baseChurn: 0.00012,
      baseConversion: 0.16, computePerUser: 0.0045, virality: 0.006, hype: 0.6, heatPerSec: 0,
    },
    {
      id: "reasoning", name: "Reasoning Engine",
      blurb: "Deep thinking for research/technical work. Premium price, heavy compute.",
      segment: "prosumer", tam: 2.0e6, baseArpu: 0.009, baseChurn: 0.0004,
      baseConversion: 0.09, computePerUser: 0.005, virality: 0.005, hype: 0.7, heatPerSec: 0,
    },
    {
      id: "multimodal", name: "Multimodal Studio",
      blurb: "Image/audio/video for creators. Trendy spikes, medium ARPU, heavy serve.",
      segment: "consumer", tam: 5.0e6, baseArpu: 0.0035, baseChurn: 0.0007,
      baseConversion: 0.05, computePerUser: 0.0018, virality: 0.03, hype: 1.5, heatPerSec: 0,
    },
    {
      id: "small", name: "Fast & Cheap API",
      blurb: "Tiny, fast, high-volume. Massive scale, razor margins, price war.",
      segment: "api", tam: 1.0e8, baseArpu: 0.00025, baseChurn: 0.0006,
      baseConversion: 0.02, computePerUser: 0.00003, virality: 0.004, hype: 0.3, heatPerSec: 0,
    },
    {
      id: "domain", name: "Domain Expert (legal/med/fin)",
      blurb: "Vertical, compliance-grade. Very high ARPU, ultra-sticky — but raises Heat.",
      segment: "enterprise", tam: 2.0e5, baseArpu: 0.06, baseChurn: 0.00005,
      baseConversion: 0.26, computePerUser: 0.012, virality: 0.002, hype: 0.4, heatPerSec: 0.02,
    },
  ] satisfies ProductTypeDef[],
};

export type ProductsBalance = typeof products;
