/**
 * PHASE 3 — AI Product / Deployment system ("Ship It"). Tunable data only.
 * Full design + the real-world grounding for these ratios live in
 * PHASE3_PRODUCTS_PLAN.md. Numbers are a first pass — expect heavy tuning via the
 * balance sim. Products cost Compute+Data to BUILD/version and earn Money to
 * OPERATE (subs − serving − marketing); customers/MRR are NOT new resources.
 */

export type ProductTypeId =
  | "general" | "code" | "reasoning" | "multimodal" | "small" | "domain"
  | "companion" | "science";

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
  /** Gate: this type can only be released once you've shipped this many models.
   *  Premium/high-revenue/user types unlock later (reinforces "hard early, compounds late"). */
  unlockAtShips: number;
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
  /** R4.3 re-coupling: a new version also costs this many SECONDS of your current
   *  Data output — "AI product R&D runs on data". The flat base above decays to
   *  nothing vs exponential late-game Data production; this term scales WITH the
   *  economy so Data stays a real sink in the endgame instead of going vestigial.
   *  Pre-first-ship there are no products, so the first-prestige curve is untouched
   *  by construction; validated by the long-haul sim's "Products sink %" metric. */
  versionDataSecondsOfOutput: 600,

  /** Competitor capability drifts up over time; your quality is set to the
   *  frontier each time you release/version, then falls behind. */
  frontierStart: 1,
  frontierGrowthPerSec: 0.005,
  /** Extra churn multiplier per unit of (frontier − quality) gap. */
  stalenessChurn: 0.6,

  /** Marketing: users acquired ≈ spend / CAC; CAC rises as you saturate the TAM.
   *  Owner directive (2026-06-25): the FIRST customers should be a grind and early
   *  scaling should be hard (weak early models + entrenched competition), with the
   *  flywheel only spinning up once quality/upgrades compound. So CAC starts high
   *  and saturates faster, conversion eases in slowly, and the marketing dial is
   *  gated tight at low quality (see marketingCapPerQuality) — it opens as you
   *  progress. High-revenue/user types (code/reasoning/domain) still reward paid spend;
   *  low-revenue/user consumer types (general/small) lean on virality, which itself needs
   *  an installed base to ignite. */
  marketingCacBase: 80,
  cacSaturation: 8,
  /** How fast paid count eases toward its conversion target (per second). */
  convSpeed: 0.05,

  /** Drafts — each Ship the Model deposits a "raw model" you commercialise. Cap the
   *  pile so it can't grow unbounded across many prestiges (oldest drops off). */
  maxDrafts: 6,

  /** Timed version upgrades ("research takes time"). Starting an upgrade pays an
   *  upfront fraction of versionCost immediately; the remainder DRAINS over the
   *  research duration (Compute+Data/sec). Progress stalls on any tick you can't
   *  afford the drain. On completion the model jumps to the frontier + fires buzz. */
  upgrade: {
    /** Fraction of the version cost paid upfront to start (rest drains over time). */
    upfrontFrac: 0.4,
    /** Base research seconds for v1→v2; ×growth per version, capped. */
    baseSec: 90,
    secGrowth: 1.3,
    maxSec: 1800,
  },

  /** Per-product ops events — occasional reactive moments that make running each
   *  product feel alive (outages, viral spikes, breaches, press). One-shot nudges,
   *  RNG/cadence in the store; only fire for products with a real user base. */
  events: {
    minMau: 5_000,
    ratePerSec: 0.012, // ~ one per ~80s while a product is eligible
    list: [
      { id: "viral", tone: "good", message: "{name} is trending — signups are spiking!", mauMult: 1.18, buzz: true },
      { id: "press_good", tone: "good", message: "{name} got a glowing review — buzz incoming.", buzz: true },
      { id: "enterprise_deal", tone: "good", message: "{name} landed a big enterprise contract.", paidMult: 1.12 },
      { id: "outage", tone: "bad", message: "{name} had an outage — some users bounced.", mauMult: 0.93, paidMult: 0.9 },
      { id: "breach", tone: "bad", message: "{name} leaked some data — regulators are curious.", paidMult: 0.92, heat: 6 },
      { id: "price_war", tone: "bad", message: "A rival undercut {name} on price — churn ticked up.", paidMult: 0.9 },
    ],
  },

  /** Pricing tiers. Free = the non-paying MAU funnel (implicit). Pro = the base
   *  paid tier (the product's priceMult dial). Enterprise = a premium tier the
   *  player can OPEN once they've shipped enough: a small slice of users at a much
   *  higher revenue/user (its own price dial). Blended into revenue/user by conversion share. */
  enterprise: {
    unlockShips: 3,
    convShare: 0.18, // enterprise converts ~18% as readily as Pro…
    arpuMult: 7,     // …but pays ~7× the revenue/user
    priceMin: 0.5,
    priceMax: 3,
  },

  /** Marketing channels. The product's total marketing budget is split across these
   *  by the player's mix weights; each converts budget→users at its own CAC and
   *  saturates differently. cacMult scales cost; satMult scales how fast CAC rises
   *  with market penetration. Default mix is 100% Paid Ads (cacMult/satMult = 1), so
   *  the baseline curve is unchanged. The play: shift from cheap-but-saturating
   *  Organic toward scale-friendly Influencer/Events as you grow. */
  channels: [
    { id: "ads", name: "Paid Ads", desc: "The scalable workhorse — steady cost, steady reach.", cacMult: 1, satMult: 1 },
    { id: "organic", name: "Organic / Social", desc: "Cheap per user, but saturates fast.", cacMult: 0.5, satMult: 3 },
    { id: "influencer", name: "Influencers", desc: "Pricey, but keeps converting at scale.", cacMult: 1.6, satMult: 0.4 },
    { id: "events", name: "Conferences", desc: "Expensive — shines only at massive scale.", cacMult: 2.2, satMult: 0.15 },
  ],

  /** A fresh release / new version spikes acquisition + cuts churn briefly. */
  buzzDurationSec: 45,
  buzzAcqMult: 3,
  buzzChurnMult: 0.4,
  /** Retiring (selling) a product pays out this many seconds of its current MRR,
   *  at full maturity. Lowered from 1800 (30 min was a windfall well above a fair
   *  "discounted future earnings" price). */
  retireValuationSec: 900,
  /** A product must be live this long to be worth its full valuation; the payout
   *  ramps linearly from 0 over this window. Stops the pump-and-dump exploit
   *  (relaunch a free draft → crank marketing → retire for a lump → repeat): a
   *  freshly-launched product is worth almost nothing to sell. */
  retireMaturitySec: 1200,

  /** Player pricing strategy bounds (×revenue/user; higher = more $/user, less conversion). */
  priceMin: 0.5,
  priceMax: 2,
  /** Marketing-dial ceiling scales with quality (≈ game progress): cap = quality × this.
   *  Kept tight so you can't simply buy your way to scale with a weak early model —
   *  the ceiling rises as quality (versions/frontier) climbs. */
  marketingCapPerQuality: 2000,

  /** Churn-reason flavor toasts — the satire surface that makes "update or bleed"
   *  LEGIBLE: when a product is materially shedding subscribers, an occasional
   *  toast names the dominant reason (rivals pulled ahead, or the price stings).
   *  Cadence/RNG live in the store; these only set the thresholds + the copy. */
  flavor: {
    /** Need a real subscriber base before "rivals are poaching them" reads true. */
    minPaid: 50,
    /** Staleness must add ≥ this fraction of churn to be the headline. */
    staleMin: 0.5,
    /** Pricing must add ≥ this fraction of churn to be the headline. */
    priceMin: 0.4,
    /** Per-second hazard while a product is bleeding (≈ one quip per ~50s eligible). */
    ratePerSec: 0.02,
    /** Satirical lines per reason; {name} is interpolated. Humor lives here. */
    lines: {
      stale: [
        "{name} users are wandering off to a rival's shinier demo. Ship a new version?",
        "A competitor just leapfrogged {name}. The fickle masses have noticed.",
        "{name} is starting to feel last-season. Churn is creeping up.",
        "\"Is {name} still being maintained?\" — an actual {name} user, leaving.",
      ],
      pricey: [
        "{name} subscribers are rage-canceling over the price. Too rich for their blood.",
        "\"{name} is great but I'm not made of money\" — a former {name} subscriber.",
        "Sticker shock is thinning {name}'s paid tier. The dial may be cranked too high.",
        "{name} churn is spiking — turns out people read the invoice.",
      ],
    },
  },

  types: [
    {
      id: "general", name: "General Assistant",
      blurb: "Mass-market chat. Huge reach, low revenue/user, leaky bucket. Grows virally.",
      segment: "consumer", tam: 1.0e7, baseArpu: 0.005, baseChurn: 0.0009,
      baseConversion: 0.03, computePerUser: 0.001, virality: 0.025, hype: 1.0, heatPerSec: 0,
      unlockAtShips: 1,
    },
    {
      id: "code", name: "Code & Agentic",
      blurb: "Ships software for devs & teams. High revenue/user, very sticky, pricey to serve.",
      segment: "prosumer", tam: 6.0e5, baseArpu: 0.1, baseChurn: 0.00012,
      baseConversion: 0.16, computePerUser: 0.036, virality: 0.006, hype: 0.6, heatPerSec: 0,
      unlockAtShips: 1,
    },
    {
      id: "reasoning", name: "Reasoning Engine",
      blurb: "Deep thinking for research/technical work. Premium price, heavy compute.",
      segment: "prosumer", tam: 2.0e6, baseArpu: 0.075, baseChurn: 0.0004,
      baseConversion: 0.09, computePerUser: 0.04, virality: 0.005, hype: 0.7, heatPerSec: 0,
      unlockAtShips: 3,
    },
    {
      id: "multimodal", name: "Multimodal Studio",
      blurb: "Image/audio/video for creators. Trendy spikes, medium revenue/user, heavy serve.",
      segment: "consumer", tam: 5.0e6, baseArpu: 0.03, baseChurn: 0.0007,
      baseConversion: 0.05, computePerUser: 0.014, virality: 0.03, hype: 1.5, heatPerSec: 0,
      unlockAtShips: 2,
    },
    {
      id: "small", name: "Fast & Cheap API",
      blurb: "Tiny, fast, high-volume. Massive scale, razor margins, price war.",
      segment: "api", tam: 1.0e8, baseArpu: 0.002, baseChurn: 0.0006,
      baseConversion: 0.02, computePerUser: 0.00024, virality: 0.004, hype: 0.3, heatPerSec: 0,
      unlockAtShips: 1,
    },
    {
      id: "domain", name: "Domain Expert (legal/med/fin)",
      blurb: "Vertical, compliance-grade. Very high revenue/user, ultra-sticky — but raises Heat.",
      segment: "enterprise", tam: 2.0e5, baseArpu: 0.5, baseChurn: 0.00005,
      baseConversion: 0.26, computePerUser: 0.096, virality: 0.002, hype: 0.4, heatPerSec: 0.02,
      unlockAtShips: 4,
    },
    {
      id: "companion", name: "AI Companion",
      blurb: "Always-on social/roleplay app. Huge consumer reach, spreads virally, medium revenue/user — and a little Heat.",
      segment: "consumer", tam: 4.0e6, baseArpu: 0.02, baseChurn: 0.0008,
      baseConversion: 0.04, computePerUser: 0.008, virality: 0.035, hype: 1.3, heatPerSec: 0.005,
      unlockAtShips: 2,
    },
    {
      id: "science", name: "Science Co-Pilot",
      blurb: "Drug discovery & research partner. Premium price, ultra-sticky, heavy to serve — and raises Heat.",
      segment: "enterprise", tam: 3.0e5, baseArpu: 0.4, baseChurn: 0.00006,
      baseConversion: 0.22, computePerUser: 0.08, virality: 0.002, hype: 0.5, heatPerSec: 0.015,
      unlockAtShips: 5,
    },
  ] satisfies ProductTypeDef[],
};

export type ProductsBalance = typeof products;

/** Per-product feature lanes — multipliers folded into that product's economics. */
export type FeatureLane = "acq" | "arpu" | "conversion" | "churn" | "serveCost" | "tam" | "heat";

export interface FeatureDef {
  id: string;
  name: string;
  desc: string;
  /** One-time Money investment to add this feature to a product. */
  cost: number;
  lane: FeatureLane;
  /** Multiplier applied to the lane (>1 for boosts, <1 for reductions). */
  factor: number;
}

/** Per-product feature catalog — buy these to differentiate & perfect each product.
 *  One-time Money investments (revenue reinvested into the product). Tunable. */
export const productFeatures: FeatureDef[] = [
  { id: "onboarding", name: "Better Onboarding", desc: "Smoother signup flow → more free users convert.", cost: 40_000, lane: "conversion", factor: 1.25 },
  { id: "mobile", name: "Mobile App", desc: "Native apps → wider reach & faster acquisition.", cost: 75_000, lane: "acq", factor: 1.3 },
  { id: "support", name: "24/7 Support", desc: "Humans who answer → fewer cancellations.", cost: 120_000, lane: "churn", factor: 0.8 },
  { id: "cdn", name: "Global CDN", desc: "Edge caching → cheaper to serve every user.", cost: 150_000, lane: "serveCost", factor: 0.75 },
  { id: "sso", name: "Enterprise SSO", desc: "SAML & audit logs → unlock higher-paying accounts.", cost: 220_000, lane: "arpu", factor: 1.3 },
  { id: "trust", name: "Trust & Safety", desc: "Moderation & compliance → much less Regulatory Heat.", cost: 180_000, lane: "heat", factor: 0.5 },
  { id: "api", name: "Public API", desc: "Developers build on you → a bigger addressable market.", cost: 300_000, lane: "tam", factor: 1.4 },
  { id: "referral", name: "Referral Program", desc: "Users invite users → a standing acquisition boost.", cost: 260_000, lane: "acq", factor: 1.35 },
  { id: "finetune", name: "Fine-Tuning Studio", desc: "Customers tune their own models → they pay much more.", cost: 280_000, lane: "arpu", factor: 1.35 },
  { id: "ondevice", name: "On-Device Mode", desc: "Runs locally → dramatically cheaper to serve.", cost: 240_000, lane: "serveCost", factor: 0.7 },
  { id: "community", name: "Community Forum", desc: "Users answer each other → fewer cancellations.", cost: 90_000, lane: "churn", factor: 0.82 },
  { id: "localization", name: "Localization (50 langs)", desc: "Speaks every market → faster acquisition worldwide.", cost: 160_000, lane: "acq", factor: 1.3 },
];

/** A metric a milestone is measured against (evaluated in the engine). */
export type MilestoneMetric = "users" | "paid" | "mrr" | "version" | "qf" | "live" | "sold";

export interface MilestoneDef {
  id: string;
  label: string;
  desc: string;
  metric: MilestoneMetric;
  /** Achieved once the metric reaches this value. */
  threshold: number;
  /** One-time Money reward (a satisfying pop; the badge is the real draw). */
  reward: number;
}

/** Per-business milestones — a chase ladder that rewards growing & perfecting the
 *  portfolio. Evaluated against portfolio totals/peaks; one-time, persisted across
 *  prestige (a collection). Thresholds are first-pass, tunable. */
export const productMilestones: MilestoneDef[] = [
  { id: "first_launch", label: "Hello, World", desc: "Launch your first product", metric: "live", threshold: 1, reward: 5_000 },
  { id: "users_100k", label: "Going Viral", desc: "100K total monthly users", metric: "users", threshold: 100_000, reward: 25_000 },
  { id: "users_1m", label: "Household Name", desc: "1M total monthly users", metric: "users", threshold: 1_000_000, reward: 150_000 },
  { id: "users_10m", label: "Ubiquity", desc: "10M total monthly users", metric: "users", threshold: 10_000_000, reward: 1_000_000 },
  { id: "paid_100k", label: "Real Revenue", desc: "100K paying subscribers", metric: "paid", threshold: 100_000, reward: 200_000 },
  { id: "mrr_1k", label: "Ramen Profitable", desc: "$1K/s total revenue", metric: "mrr", threshold: 1_000, reward: 50_000 },
  { id: "mrr_50k", label: "Hypergrowth", desc: "$50K/s total revenue", metric: "mrr", threshold: 50_000, reward: 750_000 },
  { id: "version_5", label: "Iterating", desc: "Take a product to v5", metric: "version", threshold: 5, reward: 100_000 },
  { id: "version_10", label: "Never Stale", desc: "Take a product to v10", metric: "version", threshold: 10, reward: 600_000 },
  { id: "dominant", label: "Market Leader", desc: "A product at 99% competitiveness", metric: "qf", threshold: 0.99, reward: 120_000 },
  { id: "full_house", label: "Conglomerate", desc: "Run 3 products at once", metric: "live", threshold: 3, reward: 300_000 },
  { id: "flipper", label: "Serial Founder", desc: "Sell 5 products", metric: "sold", threshold: 5, reward: 250_000 },
];
