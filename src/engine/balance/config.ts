/**
 * ALL tunable values live here as data (CLAUDE.md hard rule). Logic never
 * hardcodes a curve number. Expect to retune this file hundreds of times during
 * the balance pass — that's the point of keeping it isolated from logic.
 */

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: { resource: "money" | "data" | "compute"; base: number; growth: number };
  /** Max purchasable levels (automations are one-shot → 1). */
  max: number;
  /** Where this shows in the UI. Dark-web tools live in the Data Bazaar. */
  market?: "hardware" | "darkweb";
  effect:
    | { kind: "computeFlat"; perLevel: number }
    | { kind: "computeMult"; perLevel: number }
    | { kind: "dataMult"; perLevel: number }
    | { kind: "moneyMult"; perLevel: number }
    | { kind: "runSpeedMult"; perLevel: number }
    | { kind: "dataPerSec"; perLevel: number }
    | { kind: "floorCols"; perLevel: number }
    | { kind: "floorRows"; perLevel: number }
    | { kind: "powerCapacity"; perLevel: number }
    | { kind: "autoClaim" }
    | { kind: "autoTrain" };
}

/**
 * A repeatable Money → Data purchase. Legit vendors are safe but pricey; the
 * dark-web Bazaar is cheaper but carries a `risk` profile — a passed-in roll
 * decides whether the batch is clean, poisoned (mostly garbage), or raided
 * (you eat a fine). Satire, not instruction: the comedy IS the risk.
 */
export interface DataOffer {
  id: string;
  vendor: string;
  name: string;
  desc: string;
  /** Money cost per purchase (flat — it's a market, buy as much as you like). */
  cost: number;
  /** Base Data delivered on a clean purchase. */
  data: number;
  shady: boolean;
  /** Regulatory Heat added by a shady purchase (0 for legit vendors). */
  heat?: number;
  risk?: {
    /** Base P(raided): pay a fine, get a fraction of the data. Rises with Heat. */
    raidChance: number;
    fine: number;
    raidDataFactor: number;
    /** P(poisoned): get a fraction of the data, no fine. */
    poisonChance: number;
    poisonDataFactor: number;
  };
}

/** A regulatory event, fired probabilistically as Heat rises (Bazaar-scoped). */
export interface HeatEvent {
  id: string;
  weight: number;
  tone: "bad" | "good";
  message: string;
  effect: {
    /** Lose this fraction of current Money. */
    fineFraction?: number;
    /** Lose this fraction of current Data. */
    dataFraction?: number;
    /** Multiply Heat by this (e.g. 0.3 = lay low after a raid). */
    heatMul?: number;
    /** Add this much Heat. */
    heatAdd?: number;
    /** Set Heat to this absolute value. */
    heatSet?: number;
  };
}

/**
 * PHASE 2 — Staff (PHASE2_PLAN §P2-B). Hireable specialists that multiply a
 * production lane but cost ongoing payroll (a Money sink → a real over-hire vs.
 * growth tension). NOT a new resource. Counts live in the shared `upgrades` map
 * so no save migration is needed; payroll is drained in tick(), multipliers fold
 * into the existing derive lanes.
 */
export interface StaffRole {
  id: string;
  name: string;
  desc: string;
  /** Money cost to hire the next one: base * growth^owned. */
  hire: { base: number; growth: number };
  /** Ongoing Money/sec per hire. */
  payroll: number;
  /** Which team the role belongs to (for the Employees page grouping). */
  team: "infra" | "product";
  effect:
    // Infrastructure team — multiplies a lab production lane (Phase 2).
    | { kind: "lane"; lane: "computeMult" | "dataMult" | "moneyMult"; perLevel: number }
    // Product team — buffs the live product business (Phase 3). Each is summed
    // across hires into a single multiplier folded into the product sim.
    | { kind: "product"; lane: ProductStaffLane; perLevel: number }
    // Meta — affects the company itself (e.g. cheaper hiring).
    | { kind: "meta"; lane: "hireDiscount"; perLevel: number };
}

/** Product-team effect lanes. upgradeSpeed/acq/arpu are "+x% each"; serveCost/churn/
 *  heat are "−x% each" (reductions, floored so they can't go to zero or negative). */
export type ProductStaffLane = "upgradeSpeed" | "serveCost" | "churn" | "acquisition" | "arpu" | "heat";

/** A personality/specialty trait an employee can have. effectMult/payrollMult scale
 *  that person's output and salary; teamMorale (optional) nudges the whole company. */
export interface StaffTrait {
  id: string;
  name: string;
  desc: string;
  effectMult: number;
  payrollMult: number;
  /** Added to the global morale multiplier while employed (e.g. Mentor +0.05). */
  teamMorale?: number;
  tone: "good" | "bad" | "mixed";
}

/** A one-time office perk: raises staff morale (output) and/or trims payroll. */
export interface OfficePerk {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** Added to the morale multiplier on ALL staff output (e.g. 0.1 = +10%). */
  morale: number;
  /** Multiplier on total payroll (≤ 1 trims it; 1 = no change). */
  payrollMult: number;
}

export interface ResearchDef {
  id: string;
  name: string;
  desc: string;
  requires: string[];
  cost: { compute: number; data: number };
  effect:
    | { kind: "computeMult"; factor: number }
    | { kind: "dataMult"; factor: number }
    | { kind: "moneyMult"; factor: number }
    | { kind: "runSpeed"; factor: number }
    | { kind: "unlockPassiveMoney"; perSec: number };
}

/** A world-event effect: a timed global buff/debuff, an immediate % swing, or a
 *  Phase-3 product effect (competitor frontier jump / industry hype buzz). */
export type WorldEventEffect =
  | { kind: "buff"; target: "computeMult" | "dataMult" | "moneyMult"; factor: number; durationSec: number }
  | { kind: "grantPct"; resource: "compute" | "data" | "money"; pct: number }
  | { kind: "frontierJump"; amount: number }
  | { kind: "productBuzz"; durationSec: number };

/** One branch of a faction event: a label, its effect, and how it moves alignment. */
export interface WorldEventChoice {
  label: string;
  effect: WorldEventEffect;
  /** Alignment nudge: negative = doomer, positive = accelerationist. */
  alignment: number;
}

/**
 * An ambient satirical event. Either a simple event with an immediate `effect`,
 * OR a faction event with two `choices` (the effect is applied on the player's
 * pick, which also shifts their alignment).
 */
export interface WorldEvent {
  id: string;
  weight: number;
  tone: "good" | "bad";
  headline: string;
  body: string;
  effect?: WorldEventEffect;
  choices?: WorldEventChoice[];
}

const WORLD_EVENTS: WorldEvent[] = [
  {
    id: "breakthrough_paper",
    weight: 3,
    tone: "good",
    headline: "Breakthrough Paper",
    body: "An intern reproduces a 2017 result and calls it novel. The team believes. Compute ×1.5 for a while.",
    effect: { kind: "buff", target: "computeMult", factor: 1.5, durationSec: 60 },
  },
  {
    id: "viral_demo",
    weight: 3,
    tone: "good",
    headline: "Your Demo Goes Viral",
    body: "A cherry-picked clip trends. Nobody asks about the failure cases. Revenue ×2 while the hype lasts.",
    effect: { kind: "buff", target: "moneyMult", factor: 2, durationSec: 45 },
  },
  {
    id: "intern_refactor",
    weight: 2,
    tone: "good",
    headline: "Intern Refactors the Pipeline",
    body: "Unreviewed, undocumented, and somehow faster. Data yield ×1.6 for a while.",
    effect: { kind: "buff", target: "dataMult", factor: 1.6, durationSec: 60 },
  },
  {
    id: "compute_donation",
    weight: 2,
    tone: "good",
    headline: "Anonymous Compute Donation",
    body: "A crypto bro pivoted to AI and gifted you a warehouse of GPUs. Compute ×2, briefly.",
    effect: { kind: "buff", target: "computeMult", factor: 2, durationSec: 35 },
  },
  {
    id: "gov_grant",
    weight: 2,
    tone: "good",
    headline: "Government AI Grant",
    body: "A vague national 'AI strategy' showers you with money. Don't read the terms. +25% cash.",
    effect: { kind: "grantPct", resource: "money", pct: 0.25 },
  },
  {
    id: "opensource_dump",
    weight: 2,
    tone: "good",
    headline: "A Rival Open-Sources Everything",
    body: "A competitor rage-quits and dumps their dataset to spite their board. +30% data.",
    effect: { kind: "grantPct", resource: "data", pct: 0.3 },
  },
  {
    id: "influencer",
    weight: 2,
    tone: "good",
    headline: "Tech Influencer Endorsement",
    body: "'This changes everything,' says a man with a ring light and no technical background. Revenue ×1.8.",
    effect: { kind: "buff", target: "moneyMult", factor: 1.8, durationSec: 40 },
  },
  {
    id: "gpu_shortage",
    weight: 3,
    tone: "bad",
    headline: "GPU Shortage",
    body: "Nvidia quietly 'reallocates' your order to a bigger lab. Compute ×0.6 until it clears.",
    effect: { kind: "buff", target: "computeMult", factor: 0.6, durationSec: 50 },
  },
  {
    id: "heatwave",
    weight: 2,
    tone: "bad",
    headline: "Heatwave",
    body: "The AC surrenders. The racks throttle to avoid becoming a fire. Compute ×0.7 until it cools.",
    effect: { kind: "buff", target: "computeMult", factor: 0.7, durationSec: 45 },
  },
  {
    id: "market_crash",
    weight: 2,
    tone: "bad",
    headline: "Market Correction",
    body: "The bubble exhales. Your imaginary valuation meets reality. You lose 15% of your cash.",
    effect: { kind: "grantPct", resource: "money", pct: -0.15 },
  },
  {
    id: "data_breach",
    weight: 2,
    tone: "bad",
    headline: "Data Breach",
    body: "Turns out the storage bucket was public the whole time. 20% of your dataset walks out the door.",
    effect: { kind: "grantPct", resource: "data", pct: -0.2 },
  },
  {
    id: "lawsuit",
    weight: 2,
    tone: "bad",
    headline: "Cease & Desist",
    body: "An author found their novel verbatim in your training set. Lawyers are not cheap. -18% cash.",
    effect: { kind: "grantPct", resource: "money", pct: -0.18 },
  },
  {
    id: "agi_internally",
    weight: 2,
    tone: "good",
    headline: "AGI Achieved (Internally)",
    body: "A Slack message declares AGI. It still can't count the r's in 'strawberry,' but the market believes. Revenue ×2.",
    effect: { kind: "buff", target: "moneyMult", factor: 2, durationSec: 45 },
  },
  {
    id: "series_c",
    weight: 2,
    tone: "good",
    headline: "Series C",
    body: "You raise at a valuation with a worrying number of zeros. Spend it before anyone asks questions. +40% cash.",
    effect: { kind: "grantPct", resource: "money", pct: 0.4 },
  },
  {
    id: "benchmark_win",
    weight: 2,
    tone: "good",
    headline: "Viral Benchmark Win",
    body: "You top a leaderboard nobody validated. Researchers everywhere send you their data to be 'evaluated.' +25% data.",
    effect: { kind: "grantPct", resource: "data", pct: 0.25 },
  },
  {
    id: "quantum_unrelated",
    weight: 1,
    tone: "good",
    headline: "Quantum Breakthrough (Unrelated)",
    body: "It has nothing to do with you. Marketing insists otherwise. The stock — and your Compute — pumps ×1.4.",
    effect: { kind: "buff", target: "computeMult", factor: 1.4, durationSec: 50 },
  },
  {
    id: "regulatory_sandbox",
    weight: 1,
    tone: "good",
    headline: "Regulatory Sandbox",
    body: "The government lets you do whatever you want, briefly, to 'foster innovation.' Revenue ×1.6.",
    effect: { kind: "buff", target: "moneyMult", factor: 1.6, durationSec: 45 },
  },
  {
    id: "hallucination_demo",
    weight: 2,
    tone: "bad",
    headline: "Model Hallucinates in Demo",
    body: "On stage, it confidently invents a customer, a lawsuit, and a country. PR does damage control. -12% cash.",
    effect: { kind: "grantPct", resource: "money", pct: -0.12 },
  },
  {
    id: "talent_war",
    weight: 2,
    tone: "bad",
    headline: "Talent War",
    body: "A rival poaches your best researcher with a signing bonus, a pool, and a yacht. Data yield ×0.7 for a while.",
    effect: { kind: "buff", target: "dataMult", factor: 0.7, durationSec: 45 },
  },
  {
    id: "smuggling_busted",
    weight: 2,
    tone: "bad",
    headline: "GPU Smuggling Ring Busted",
    body: "Your 'gray-market' supplier is on the evening news. Compute ×0.65 while you find someone less photogenic.",
    effect: { kind: "buff", target: "computeMult", factor: 0.65, durationSec: 40 },
  },
  {
    id: "pause_letter",
    weight: 1,
    tone: "bad",
    headline: "Open Letter to Pause AI",
    body: "Ten thousand signatories demand you stop. You frame it and keep going, but optics force a 'safety review.' Compute ×0.8.",
    effect: { kind: "buff", target: "computeMult", factor: 0.8, durationSec: 40 },
  },

  // --- Product/market events (Phase 3): pressure + hype on your released AIs. ---
  {
    id: "competitor_launch",
    weight: 3,
    tone: "bad",
    headline: "A Rival Ships a Better Model",
    body: "A competitor's flashy launch trends all week. The frontier moves; your shipped products suddenly look a step behind.",
    effect: { kind: "frontierJump", amount: 2 },
  },
  {
    id: "industry_hype",
    weight: 2,
    tone: "good",
    headline: "AI Is Having A Moment (Again)",
    body: "Every outlet runs the same breathless segment. Signups pour into anything with 'AI' on the box. Your products get a buzz wave.",
    effect: { kind: "productBuzz", durationSec: 60 },
  },

  // --- Faction events (Phase 2): two choices, diverging effects + alignment. ---
  {
    id: "choice_opensource",
    weight: 3,
    tone: "good",
    headline: "Open-Source the Model?",
    body: "The community is begging for the weights. Marketing is begging you not to. Someone has to decide, and everyone's looking at you.",
    choices: [
      { label: "Open-source it (+30% data)", effect: { kind: "grantPct", resource: "data", pct: 0.3 }, alignment: 0.34 },
      { label: "Keep it closed (+25% cash)", effect: { kind: "grantPct", resource: "money", pct: 0.25 }, alignment: -0.34 },
    ],
  },
  {
    id: "choice_safety_review",
    weight: 3,
    tone: "bad",
    headline: "Safety Team Demands a Slowdown",
    body: "Your safety lead wants a six-week eval freeze. Your investors want a demo on Tuesday. Both cc'd the whole company.",
    choices: [
      { label: "Slow down (Revenue ×1.6, PR win)", effect: { kind: "buff", target: "moneyMult", factor: 1.6, durationSec: 50 }, alignment: -0.3 },
      { label: "Full speed ahead (Compute ×1.8)", effect: { kind: "buff", target: "computeMult", factor: 1.8, durationSec: 50 }, alignment: 0.3 },
    ],
  },
  {
    id: "choice_regulator_deal",
    weight: 2,
    tone: "good",
    headline: "A Regulator Offers a Deal",
    body: "Quiet cooperation now, or aggressive lobbying later. Your General Counsel has prepared two very different press releases.",
    choices: [
      { label: "Cooperate (−10% cash, clean hands)", effect: { kind: "grantPct", resource: "money", pct: -0.1 }, alignment: -0.3 },
      { label: "Lobby hard (+35% cash)", effect: { kind: "grantPct", resource: "money", pct: 0.35 }, alignment: 0.3 },
    ],
  },
  {
    id: "choice_scaling_bet",
    weight: 2,
    tone: "good",
    headline: "The Big Scaling Bet",
    body: "A researcher swears the next 10× run cracks it. The safety crowd swears it's reckless. The GPUs are, notably, already warming up.",
    choices: [
      { label: "Hold the line (+30% data, careful)", effect: { kind: "grantPct", resource: "data", pct: 0.3 }, alignment: -0.28 },
      { label: "Send it (Compute ×2 briefly)", effect: { kind: "buff", target: "computeMult", factor: 2, durationSec: 40 }, alignment: 0.32 },
    ],
  },
  {
    id: "choice_whistleblower",
    weight: 2,
    tone: "bad",
    headline: "A Whistleblower Approaches",
    body: "An engineer wants to go public about the data sourcing. You can support them, or 'manage the narrative.' HR is sweating.",
    choices: [
      { label: "Back them (−12% cash, integrity)", effect: { kind: "grantPct", resource: "money", pct: -0.12 }, alignment: -0.32 },
      { label: "Spin it (Revenue ×1.7)", effect: { kind: "buff", target: "moneyMult", factor: 1.7, durationSec: 45 }, alignment: 0.28 },
    ],
  },
];

export const balance = {
  /** The rented server closet generates a trickle of Compute for free. */
  baseComputePerSec: 1,

  run: {
    /**
     * A run invests `costSeconds` worth of current Compute *production* (floored
     * at minCompute early game), then pays out Data/Money proportional to the
     * Compute invested. This couples money to the size of your operation — the
     * whole point of the three-resource triangle (GDD §2.1).
     */
    costSeconds: 2,
    minCompute: 10,
    durationSec: 5,
    // Difficulty pass: leaner run payouts so scaling the operation (more/better
    // racks + expansions) matters more. Tuned against the sim to stay wall-free.
    dataPerCompute: 0.28,
    moneyPerCompute: 0.45,
  },

  /**
   * Eras re-skin the hall and fire a tentpole "press release" moment as the lab
   * grows (GDD §3/§5). Phase 1 ships eras 0–2. Gate thresholds are tunable data
   * here; the gating LOGIC lives in engine/eras.ts; palettes live in the renderer.
   */
  eras: {
    list: [
      { name: "Garage Closet", blurb: "" },
      {
        name: "Funded Startup",
        blurb:
          "TechCrunch — “Stealth AI lab emerges from a literal server closet, raises a seed round to ‘reinvent compute.’” There is a beanbag now. The intern designed a logo.",
      },
      {
        name: "Scale-Up Lab",
        blurb:
          "The Verge — “Singularity Inc. ships its first model.” The valuation is, sources confirm, ‘definitely not a bubble.’ The closet is now a floor.",
      },
      {
        name: "Frontier Lab",
        blurb:
          "Bloomberg — “Singularity Inc. declares itself a ‘frontier lab,’ a term it also coined.” Badge access now has tiers. There is a second beanbag, and a waitlist for it.",
      },
      {
        name: "Hyperscaler",
        blurb:
          "WSJ — “Singularity Inc. is now a ‘hyperscaler,’ and has reportedly bought a power plant ‘for latency reasons.’” Analysts remain confused, but bullish.",
      },
      {
        name: "Post-Singularity",
        blurb:
          "The model is writing its own press releases now. This one included. Singularity Inc. has, by its own announcement, achieved AGI; the AGI has politely declined to comment. The hall hums at a frequency employees describe as “optimistic.”",
      },
    ],
    /** Reach era 1 once this many research nodes are owned. */
    startupAtResearchCount: 3,
    /** Reach era 2 once this capability is researched (or you've ever shipped). */
    scaleUpAtResearch: "inference_api",
    /** Eras 3–5 are endgame spectacle, gated by how many times you've shipped. */
    frontierAtShips: 2,
    hyperscalerAtShips: 5,
    /** Era 5 — Post-Singularity / AGI. The capstone era. */
    agiAtShips: 9,
    /** AGI ascension: a ship taken in the AGI era past this lifetime-Legacy floor
     *  is an "ascension" — it grants a permanent compounding boost. Gated hard so
     *  stats.ascensions stays 0 (mult = 1) through the entire early/mid game. */
    agi: {
      legacyThreshold: 2_000,
      /** Permanent boost to all lanes per ascension (additive: 1 + n·bonus). */
      bonusPerAscension: 0.08,
    },
  },

  /** The 2.5D hall floor. Expansions (below) grow it so more racks fit. */
  hall: {
    baseCols: 6,
    baseRows: 5,
    /** Hard cap on drawn rack boxes (perf); beyond this, density represents more. */
    maxDrawnRacks: 120,
    /** Reveal floor expansions once the closet starts to fill (progression rule). */
    expansionRevealRacks: 5,
  },

  /**
   * PHASE 2 — Power & Heat (GAMEPLAN §5, PHASE2_PLAN §P2-A). A soft cap: racks
   * draw power; over-subscribe your capacity and Compute throttles (never a hard
   * wall — floored at `throttleFloor`). LIVE (`enabled: true`) — flip to false to
   * dark-launch. Power is a DERIVED constraint shown as a meter, NOT a 4th
   * resource (legibility).
   */
  power: {
    enabled: true,
    /** Free power budget before any capacity upgrades (kW). */
    baseCapacityKw: 50,
    /** Draw per rack by tier [consumer, server, TPU] (kW). */
    drawPerRackKw: [0.5, 2, 8],
    /** Compute never throttles below this fraction, however over-subscribed. */
    throttleFloor: 0.25,
    /** Show the power meter / nudge once the lab actually draws something. */
    revealAtDrawKw: 1,
  },

  /** PHASE 2 — Staff. Opt-in depth: hire to multiply a lane, pay payroll forever. */
  staff: {
    enabled: true,
    /** Assigned product-staff are this much more effective than unassigned, but only
     *  on their one product (the spread-vs-concentrate trade-off). */
    assignFocusMult: 2,
    /** Reveal the panel once the lab is established (after the first research). */
    revealAtResearch: 1,
    /** Seniority levels (1 = junior). Each level above 1 multiplies a person's
     *  output (+levelEffectStep) and salary (+levelPayrollStep). */
    maxLevel: 4,
    levelEffectStep: 0.5,
    levelPayrollStep: 0.6,
    /** Timed training to the NEXT level: duration grows per level; cost in Money. */
    trainBaseSec: 120,
    trainSecGrowth: 1.6,
    trainCostMult: 6, // cost = role.hire.base × trainCostMult × level
    /** Signing bonus to hire a candidate = role.hire.base × this. */
    hireSigningMult: 1,
    /** Diminishing returns on stacking one lane. Contributors to a lane are ranked
     *  by raw output; the k-th (0-indexed) counts at 1/(1 + k·perLaneRate). Output
     *  diminishes but payroll does NOT — so a small, trained, high-trait team beats
     *  zerg-hiring a wall of juniors. perLaneRate 0 = old linear behaviour. */
    diminishing: { perLaneRate: 0.18 },
    /** Personality/specialty traits rolled at hire. */
    traits: [
      { id: "tenx", name: "10×", desc: "Ships like ten people. Insufferable about it.", effectMult: 1.7, payrollMult: 1.3, tone: "good" },
      { id: "workaholic", name: "Workaholic", desc: "Always online. Slightly pricey, very productive.", effectMult: 1.4, payrollMult: 1.1, tone: "good" },
      { id: "steady", name: "Steady", desc: "Reliable, low drama, solid output.", effectMult: 1.1, payrollMult: 0.95, tone: "good" },
      { id: "frugal", name: "Frugal", desc: "Works for equity and snacks. Cheap, a touch slower.", effectMult: 0.9, payrollMult: 0.5, tone: "good" },
      { id: "mentor", name: "Mentor", desc: "Lifts the whole company (+morale), modest output.", effectMult: 1.0, payrollMult: 1.05, teamMorale: 0.06, tone: "good" },
      { id: "greenhorn", name: "Greenhorn", desc: "Junior and cheap — train them up.", effectMult: 0.75, payrollMult: 0.6, tone: "mixed" },
      { id: "prima_donna", name: "Prima Donna", desc: "Brilliant but expensive and high-maintenance.", effectMult: 1.5, payrollMult: 1.8, tone: "mixed" },
      { id: "burned_out", name: "Burned Out", desc: "Coasting. A training sabbatical might revive them.", effectMult: 0.7, payrollMult: 1.0, tone: "bad" },
    ] satisfies StaffTrait[],
    firstNames: ["Ada", "Grace", "Alan", "Linus", "Margaret", "Dennis", "Ken", "Barbara", "Guido", "Bjarne", "Hedy", "Claude", "Geoffrey", "Yann", "Fei-Fei", "Demis", "Ilya", "Andrej", "Lena", "Omar", "Priya", "Mateo", "Noor", "Sora"],
    lastNames: ["Lovelace", "Hopper", "Turing", "Torvalds", "Hamilton", "Ritchie", "Thompson", "Liskov", "Okafor", "Nakamura", "Kim", "Patel", "Santos", "Müller", "Rossi", "Haddad", "Ng", "Bengio", "Chen", "Volkov", "Ivanova", "Diallo", "Khan", "Reyes"],
    roles: [
      {
        id: "staff_researcher",
        name: "Researcher",
        desc: "+8% Data per run, each. Mostly reads arXiv and drinks cold brew.",
        hire: { base: 300, growth: 1.5 },
        payroll: 2,
        team: "infra",
        effect: { kind: "lane", lane: "dataMult", perLevel: 0.08 },
      },
      {
        id: "staff_engineer",
        name: "Engineer",
        desc: "+6% Compute, each. Keeps the racks alive and the YAML valid.",
        hire: { base: 500, growth: 1.5 },
        payroll: 3,
        team: "infra",
        effect: { kind: "lane", lane: "computeMult", perLevel: 0.06 },
      },
      {
        id: "staff_ops",
        name: "Ops Lead",
        desc: "+8% Money per run, each. Monetizes things you didn't know you had.",
        hire: { base: 700, growth: 1.5 },
        payroll: 4,
        team: "infra",
        effect: { kind: "lane", lane: "moneyMult", perLevel: 0.08 },
      },
      // ---- Product team (Phase 3) — buff the live product business. ----
      {
        id: "staff_ml",
        name: "ML Scientist",
        desc: "+12% version-research speed, each. Turns coffee into checkpoints.",
        hire: { base: 4_000, growth: 1.55 },
        payroll: 12,
        team: "product",
        effect: { kind: "product", lane: "upgradeSpeed", perLevel: 0.12 },
      },
      {
        id: "staff_sre",
        name: "SRE",
        desc: "−5% product serving cost, each. Pages itself so you don't have to.",
        hire: { base: 5_000, growth: 1.6 },
        payroll: 14,
        team: "product",
        effect: { kind: "product", lane: "serveCost", perLevel: 0.05 },
      },
      {
        id: "staff_success",
        name: "Customer Success",
        desc: "−5% users leaving, each. Professionally prevents goodbyes.",
        hire: { base: 6_000, growth: 1.6 },
        payroll: 16,
        team: "product",
        effect: { kind: "product", lane: "churn", perLevel: 0.05 },
      },
      {
        id: "staff_growth",
        name: "Growth Lead",
        desc: "+8% user acquisition, each. Has a funnel for everything.",
        hire: { base: 7_000, growth: 1.6 },
        payroll: 18,
        team: "product",
        effect: { kind: "product", lane: "acquisition", perLevel: 0.08 },
      },
      {
        id: "staff_sales",
        name: "Sales Exec",
        desc: "+7% revenue per user, each. Always be closing.",
        hire: { base: 8_000, growth: 1.6 },
        payroll: 20,
        team: "product",
        effect: { kind: "product", lane: "arpu", perLevel: 0.07 },
      },
      {
        id: "staff_pr",
        name: "PR & Legal",
        desc: "−10% product Heat, each. Makes the lawsuits go quiet.",
        hire: { base: 9_000, growth: 1.6 },
        payroll: 22,
        team: "product",
        effect: { kind: "product", lane: "heat", perLevel: 0.1 },
      },
      // ---- Infrastructure additions ----
      {
        id: "staff_data_eng",
        name: "Data Engineer",
        desc: "+7% Data per run, each. Builds pipelines that mostly don't break.",
        hire: { base: 1_200, growth: 1.5 },
        payroll: 6,
        team: "infra",
        effect: { kind: "lane", lane: "dataMult", perLevel: 0.07 },
      },
      {
        id: "staff_recruiter",
        name: "Recruiter",
        desc: "−6% on all future hire costs, each. Knows a guy who knows a guy.",
        hire: { base: 6_500, growth: 1.7 },
        payroll: 10,
        team: "infra",
        effect: { kind: "meta", lane: "hireDiscount", perLevel: 0.06 },
      },
    ] satisfies StaffRole[],
  },

  /** PHASE 3 — Office perks & morale. One-time Money investments that boost ALL
   *  staff output (morale) or trim payroll. Counts live in the upgrades map (0/1
   *  each), so no migration. */
  office: {
    enabled: true,
    revealAtResearch: 1,
    perks: [
      { id: "perk_snacks", name: "Free Lunch & Snacks", desc: "+10% staff effectiveness. The cold brew flows.", cost: 60_000, morale: 0.10, payrollMult: 1 },
      { id: "perk_remote", name: "Remote-First", desc: "−20% payroll. Goodbye, office lease.", cost: 90_000, morale: 0, payrollMult: 0.8 },
      { id: "perk_equity", name: "Equity for All", desc: "+15% staff effectiveness. Everyone's an owner now.", cost: 250_000, morale: 0.15, payrollMult: 1 },
      { id: "perk_ld", name: "L&D Budget", desc: "+15% staff effectiveness. Conf talks watched at 2×.", cost: 400_000, morale: 0.15, payrollMult: 1 },
      { id: "perk_wellness", name: "Wellness Program", desc: "−15% payroll, fewer burnout re-hires.", cost: 350_000, morale: 0, payrollMult: 0.85 },
    ] satisfies OfficePerk[],
  },

  prestige: {
    /**
     * You can Ship once you've built a deployable model — i.e. researched this
     * capability (GDD §4: "reach a capability threshold"). This guarantees the
     * player climbs the research tree to its payoff before learning the reset.
     */
    capabilityResearch: "inference_api",
    /** legacyWeightsGained = max(1, floor((lifetimeMoney / scale) ^ exponent)). */
    scale: 1e4,
    exponent: 0.5,
    /** Each Legacy Weight grants this much permanent global production. */
    multiplierPerPoint: 0.05,
  },

  offline: {
    /** Cap accrued offline time so it's a reward, not an exploit (LEARNINGS). */
    maxHours: 8,
    /** Premium QoL perk: a longer offline cap (GDD-sanctioned, not pay-for-power). */
    premiumMaxHours: 24,
  },

  upgrades: [
    {
      id: "rack_basic",
      name: "Consumer GPU Rack",
      desc: "+2 Compute/sec. A shelf of gaming cards. It hums.",
      cost: { resource: "money", base: 15, growth: 1.15 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 2 },
    },
    {
      id: "rack_server",
      name: "Server GPU Rack",
      desc: "+12 Compute/sec. Proper datacenter silicon.",
      cost: { resource: "money", base: 220, growth: 1.16 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 12 },
    },
    {
      id: "rack_tpu",
      name: "TPU Pod",
      desc: "+80 Compute/sec. Tensor cores, allegedly.",
      cost: { resource: "money", base: 3500, growth: 1.17 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 80 },
    },
    {
      id: "overclock",
      name: "Overclock Firmware",
      desc: "+8% total Compute production per level.",
      cost: { resource: "money", base: 600, growth: 1.5 },
      max: 25,
      effect: { kind: "computeMult", perLevel: 0.08 },
    },
    {
      id: "data_pipeline",
      name: "Data Pipeline",
      desc: "+20% Data per run, per level.",
      cost: { resource: "money", base: 120, growth: 1.4 },
      max: 25,
      effect: { kind: "dataMult", perLevel: 0.2 },
    },
    {
      id: "monetize",
      name: "Monetization Layer",
      desc: "+20% Money per run, per level. ('Synergy.')",
      cost: { resource: "money", base: 150, growth: 1.4 },
      max: 25,
      effect: { kind: "moneyMult", perLevel: 0.2 },
    },
    {
      id: "batching",
      name: "Batch Scheduler",
      desc: "-6% run duration per level. Trains faster.",
      cost: { resource: "data", base: 40, growth: 1.6 },
      max: 12,
      effect: { kind: "runSpeedMult", perLevel: 0.06 },
    },
    {
      id: "auto_claim",
      name: "Auto-Claim Daemon",
      desc: "Finished runs claim themselves. Stop tapping.",
      cost: { resource: "data", base: 200, growth: 1 },
      max: 1,
      effect: { kind: "autoClaim" },
    },
    {
      id: "auto_train",
      name: "Auto-Train Orchestrator",
      desc: "Runs restart themselves. The lab runs itself.",
      cost: { resource: "data", base: 800, growth: 1 },
      max: 1,
      effect: { kind: "autoTrain" },
    },
    // --- Hall expansions: the back two sides have walls, so you can only expand
    //     the two OPEN sides. Bought by tapping the markers in the hall.
    {
      id: "expand_e",
      name: "Right Expansion",
      desc: "Lease the open bay to your right. +2 floor columns.",
      cost: { resource: "money", base: 5000, growth: 2.0 },
      max: 4,
      effect: { kind: "floorCols", perLevel: 2 },
    },
    {
      id: "expand_s",
      name: "Front Expansion",
      desc: "Pour more slab toward the entrance. +2 floor rows.",
      cost: { resource: "money", base: 7000, growth: 2.0 },
      max: 4,
      effect: { kind: "floorRows", perLevel: 2 },
    },
    // --- Power & Cooling (Phase 2: raise capacity so racks don't throttle) ---
    {
      id: "psu_bay",
      name: "PSU Bay",
      desc: "+40 kW power capacity. More racks run before they throttle.",
      cost: { resource: "money", base: 800, growth: 1.4 },
      max: Infinity,
      effect: { kind: "powerCapacity", perLevel: 40 },
    },
    {
      id: "cooling_loop",
      name: "Liquid Cooling Loop",
      desc: "+150 kW. Keeps the racks cool enough to run flat out.",
      cost: { resource: "money", base: 6000, growth: 1.45 },
      max: Infinity,
      effect: { kind: "powerCapacity", perLevel: 150 },
    },
    {
      id: "substation",
      name: "On-Site Substation",
      desc: "+600 kW. Industrial power for an industrial lab.",
      cost: { resource: "money", base: 50000, growth: 1.5 },
      max: Infinity,
      effect: { kind: "powerCapacity", perLevel: 600 },
    },
    // --- Dark-web tools (sold in the Data Bazaar, not the hardware shelf) ---
    {
      id: "web_scraper",
      name: "Web Scraper Bot",
      desc: "+1 Data/sec. Reads the whole internet. Doesn't ask first.",
      cost: { resource: "money", base: 400, growth: 1.25 },
      max: Infinity,
      market: "darkweb",
      effect: { kind: "dataPerSec", perLevel: 1 },
    },
    {
      id: "captcha_farm",
      name: "Captcha Farm",
      desc: "+4 Data/sec. Definitely real humans clicking traffic lights.",
      cost: { resource: "money", base: 2600, growth: 1.28 },
      max: Infinity,
      market: "darkweb",
      effect: { kind: "dataPerSec", perLevel: 4 },
    },
    {
      id: "botnet",
      name: "Botnet Cluster",
      desc: "+18 Data/sec. A 'distributed crowdsourcing network.' Ahem.",
      cost: { resource: "money", base: 18000, growth: 1.3 },
      max: Infinity,
      market: "darkweb",
      effect: { kind: "dataPerSec", perLevel: 18 },
    },
  ] satisfies UpgradeDef[],

  /**
   * Regulatory Heat (0..100). Rises with dark-web buys, cools passively, and
   * scales the raid chance. At high Heat, random audit EVENTS fire. This is the
   * Bazaar's risk pressure-valve — go shady for cheap data, but manage the heat.
   * Values are a provisional first pass; tune against playtest, not in the abstract.
   */
  heat: {
    max: 100,
    /** Heat lost per second when you're not buying shady data (~3.5 min to fully cool). */
    coolPerSec: 0.45,
    /** Added to a shady offer's raid chance at MAX heat (linear in heat). */
    raidScaleAtMax: 0.4,
    /** Per-second chance of a regulatory event AT MAX heat (linear in heat). */
    eventChancePerSecAtMax: 0.03,
    /** Don't let one big elapsed frame (tab refocus) make an event near-certain. */
    eventChanceCap: 0.5,
    /** Heat added when buying a dark-web tool (scraper/botnet — you're on a list now). */
    toolBuyHeat: 5,
    /** UI meter tiers: label + color, picked by the lowest `upTo` heat value the meter is under. */
    tiers: [
      { upTo: 25, label: "Cold", color: "#22c55e" },
      { upTo: 55, label: "Warm", color: "#eab308" },
      { upTo: 80, label: "Hot", color: "#f97316" },
      { upTo: Infinity, label: "Blazing", color: "#ef4444" },
    ],
  },

  /** Regulatory events, weighted. Picked when an event fires (see actions). */
  heatEvents: [
    {
      id: "audit",
      weight: 4,
      tone: "bad",
      message: "🚨 Surprise audit! Regulators want their cut. Fined 25% of your cash.",
      effect: { fineFraction: 0.25, heatMul: 0.3 },
    },
    {
      id: "subpoena",
      weight: 3,
      tone: "bad",
      message: "📑 Data subpoena — a chunk of your dataset is seized as evidence.",
      effect: { dataFraction: 0.2, heatMul: 0.5 },
    },
    {
      id: "whistleblower",
      weight: 2,
      tone: "bad",
      message: "📰 A whistleblower leaks your sourcing. The heat is on.",
      effect: { heatAdd: 25 },
    },
    {
      id: "lobbyist",
      weight: 1,
      tone: "good",
      message: "🤝 A friendly lobbyist makes it all go away. Heat cleared.",
      effect: { heatSet: 0 },
    },
  ] satisfies HeatEvent[],

  /**
   * Ambient world events (GDD Phase 1: "a dozen, written with the satirical
   * voice. Modifiers + jokes."). Distinct from the Bazaar's heat events — these
   * fire on a slow ambient timer once the lab is established. Effects are either
   * a timed global multiplier (buff/debuff) or an immediate +/- % of a resource.
   */
  worldEvents: {
    /** Mean seconds between events during active play (Poisson-ish). */
    meanIntervalSec: 150,
    /** Don't begin firing until the player has done some research. */
    minResearch: 1,
    list: WORLD_EVENTS,
  },

  /** Money → Data marketplace. Legit (safe, pricey) vs. dark web (cheap, risky, hot). */
  dataMarket: [
    {
      id: "meta_dump",
      vendor: "Meta",
      name: "Public Posts Bundle",
      desc: "A decade of vacation photos and arguments. Fully licensed™.",
      cost: 200,
      data: 150,
      shady: false,
    },
    {
      id: "goggle_logs",
      vendor: "Goggle",
      name: "Search Logs (Anonymized)",
      desc: "What everyone secretly asks at 3am. 'Anonymized.'",
      cost: 1500,
      data: 1300,
      shady: false,
    },
    {
      id: "readit_firehose",
      vendor: "Readit",
      name: "Forum Firehose",
      desc: "Ten billion hot takes and one actually useful comment.",
      cost: 6000,
      data: 6000,
      shady: false,
    },
    {
      id: "closedai_synth",
      vendor: "ClosedAI",
      name: "Synthetic Dataset",
      desc: "Premium model-generated data. Best ratio at scale, naturally.",
      cost: 20000,
      data: 24000,
      shady: false,
    },
    // Shady offers are tuned (via the EV table in balance-sim) so the Bazaar
    // BEATS the best legit ratio when cold (~1.6 d/$ vs ClosedAI's 1.2) and
    // erodes BELOW legit at max Heat (~0.8 d/$) — that's the risk premium.
    {
      id: "bazaar_pack",
      vendor: "ShadyByte Bazaar",
      name: "Scraped Data Pack",
      desc: "'Ethically sourced.' Cheaper per byte. No refunds, no questions.",
      cost: 120,
      data: 240,
      shady: true,
      heat: 6,
      risk: {
        raidChance: 0.05,
        fine: 120,
        raidDataFactor: 0.4,
        poisonChance: 0.15,
        poisonDataFactor: 0.3,
      },
    },
    {
      id: "bazaar_leak",
      vendor: "ShadyByte Bazaar",
      name: "Bulk Corporate Leak",
      desc: "A whole company's data 'fell off a truck.' Huge if it's clean.",
      cost: 2000,
      data: 4000,
      shady: true,
      heat: 14,
      risk: {
        raidChance: 0.08,
        fine: 1500,
        raidDataFactor: 0.35,
        poisonChance: 0.18,
        poisonDataFactor: 0.25,
      },
    },
    {
      id: "bazaar_weights",
      vendor: "ShadyByte Bazaar",
      name: "Leaked Model Weights",
      desc: "A competitor's whole model 'fell off a GPU.' Outrageously hot.",
      cost: 15000,
      data: 33000,
      shady: true,
      heat: 28,
      risk: {
        raidChance: 0.1,
        fine: 12000,
        raidDataFactor: 0.3,
        poisonChance: 0.2,
        poisonDataFactor: 0.2,
      },
    },
  ] satisfies DataOffer[],

  research: [
    {
      id: "backprop",
      name: "Backprop Refactor",
      desc: "Someone finally read the paper. ×1.5 Compute.",
      requires: [],
      cost: { compute: 500, data: 0 },
      effect: { kind: "computeMult", factor: 1.5 },
    },
    {
      id: "curated_data",
      name: "Curated Dataset",
      desc: "Less garbage in. ×1.6 Data per run.",
      requires: ["backprop"],
      cost: { compute: 0, data: 120 },
      effect: { kind: "dataMult", factor: 1.6 },
    },
    {
      id: "mixed_precision",
      name: "Mixed Precision",
      desc: "Train in fp16 and pray. ×1.5 Compute.",
      requires: ["backprop"],
      cost: { compute: 2500, data: 0 },
      effect: { kind: "computeMult", factor: 1.5 },
    },
    {
      id: "data_aug",
      name: "Data Augmentation",
      desc: "Flip it, crop it, call it new. ×1.6 Data per run.",
      requires: ["curated_data"],
      cost: { compute: 0, data: 700 },
      effect: { kind: "dataMult", factor: 1.6 },
    },
    {
      id: "distributed",
      name: "Distributed Training",
      desc: "Many machines, one loss curve. ×1.8 Money per run.",
      requires: ["mixed_precision", "curated_data"],
      cost: { compute: 6000, data: 400 },
      effect: { kind: "moneyMult", factor: 1.8 },
    },
    {
      id: "rlhf",
      name: "RLHF Pipeline",
      desc: "Underpaid humans rank chatbot replies. ×1.8 Money per run.",
      requires: ["data_aug"],
      cost: { compute: 3000, data: 2200 },
      effect: { kind: "moneyMult", factor: 1.8 },
    },
    {
      id: "caching",
      name: "KV Cache",
      desc: "Stop recomputing the obvious. -15% run duration.",
      requires: ["distributed"],
      cost: { compute: 9000, data: 0 },
      effect: { kind: "runSpeed", factor: 0.85 },
    },
    {
      id: "distillation",
      name: "Model Distillation",
      desc: "Smaller, faster, mostly the same. -25% run duration.",
      requires: ["distributed"],
      cost: { compute: 22000, data: 1500 },
      effect: { kind: "runSpeed", factor: 0.75 },
    },
    {
      id: "moe",
      name: "Mixture of Experts",
      desc: "A dozen mediocre models in a trench coat. ×2 Compute.",
      requires: ["caching", "distillation"],
      cost: { compute: 75000, data: 3000 },
      effect: { kind: "computeMult", factor: 2 },
    },
    {
      id: "inference_api",
      name: "Ship: Inference API",
      desc: "Deploy the model as a product. Passive Money that scales with Compute.",
      requires: ["distillation", "rlhf"],
      cost: { compute: 130000, data: 7000 },
      // Money/sec per unit of Compute/sec — a fraction of throughput becomes revenue.
      effect: { kind: "unlockPassiveMoney", perSec: 0.3 },
    },
    {
      id: "scaling_laws",
      name: "Scaling Laws",
      desc: "The graph only goes up. Probably. ×2.5 Compute.",
      requires: ["moe"],
      cost: { compute: 300000, data: 0 },
      effect: { kind: "computeMult", factor: 2.5 },
    },
  ] satisfies ResearchDef[],
};

export type Balance = typeof balance;
