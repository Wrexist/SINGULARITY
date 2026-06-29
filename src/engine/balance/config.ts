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
  /** Mutually-exclusive choice: buying any node in this group locks its siblings
   *  for the run (research resets each prestige, so it's a per-run build pick). */
  exclusiveGroup?: string;
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
  /** R6.2 — faction-branched pool. Untagged events can always fire; a tagged event
   *  only enters the pool once the player has committed to that side (alignment past
   *  `worldEvents.factionThreshold`). At neutral, no tagged event is eligible, so the
   *  base pool — and the tuned curve — is unchanged. */
  faction?: "doomer" | "accel";
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
  // Named-rival ships — the leaderboard competitors do things, so the frontier
  // drift feels like a market, not a faceless number.
  {
    id: "rival_closedai",
    weight: 2,
    tone: "bad",
    headline: "ClosedAI Ships Cortex-5",
    body: "ClosedAI's keynote runs three hours and announces one feature. It still moves the frontier — your models suddenly look dated.",
    effect: { kind: "frontierJump", amount: 2 },
  },
  {
    id: "rival_goggle",
    weight: 2,
    tone: "bad",
    headline: "Goggle Unveils Gemiknight",
    body: "Goggle bolts an AI onto seven products nobody uses. Analysts swoon anyway and the bar creeps up.",
    effect: { kind: "frontierJump", amount: 2 },
  },
  {
    id: "rival_anthropos",
    weight: 2,
    tone: "bad",
    headline: "Anthropos Releases Claudius",
    body: "Anthropos publishes a 90-page safety card and a model that's annoyingly good. The frontier nudges higher.",
    effect: { kind: "frontierJump", amount: 2 },
  },
  {
    id: "rival_meta",
    weight: 2,
    tone: "bad",
    headline: "Meta Open-Sources Llamabot",
    body: "Meta dumps a frontier model on the internet for free, then looks shocked when everyone uses it. The bar moves for the whole industry — including you.",
    effect: { kind: "frontierJump", amount: 2 },
  },
  {
    id: "rival_xaeai",
    weight: 1,
    tone: "bad",
    headline: "xAEAI Ships Groketta",
    body: "Powered by a datacenter the size of a town and a billionaire's grudge, Groketta launches with a personality and a lawsuit. The frontier lurches.",
    effect: { kind: "frontierJump", amount: 2 },
  },
  // --- More ambient events (variety pass) ---
  {
    id: "gpu_shortage_global",
    weight: 3,
    tone: "bad",
    headline: "Global GPU Shortage",
    body: "Every lab on Earth wants the same chip. Your supplier 'prioritises strategic partners' (read: whoever pays double). Compute ×0.6 for a bit.",
    effect: { kind: "buff", target: "computeMult", factor: 0.6, durationSec: 40 },
  },
  {
    id: "power_bill",
    weight: 2,
    tone: "bad",
    headline: "The Power Bill Arrives",
    body: "Accounting opens the envelope and goes very quiet. Turns out 'compute' is a polite word for 'electricity'. −15% cash.",
    effect: { kind: "grantPct", resource: "money", pct: -0.15 },
  },
  {
    id: "benchmark_vibes",
    weight: 2,
    tone: "good",
    headline: "You Top a Benchmark Nobody Asked For",
    body: "Your model edges out the field on 'Vibes-Bench v3'. The leaderboard screenshot does numbers on social. Revenue ×1.6, briefly.",
    effect: { kind: "buff", target: "moneyMult", factor: 1.6, durationSec: 45 },
  },
  {
    id: "synthetic_breakthrough",
    weight: 2,
    tone: "good",
    headline: "Synthetic Data Breakthrough",
    body: "An intern trains the model on its own output and, against all advice, it works this time. Data yield ×1.8, briefly.",
    effect: { kind: "buff", target: "dataMult", factor: 1.8, durationSec: 50 },
  },
  {
    id: "hallucination_scandal",
    weight: 2,
    tone: "bad",
    headline: "Your Model Confidently Invents a Court Case",
    body: "A lawyer cited it. The judge was not amused. Your products take a reputational knock as the clip goes viral.",
    effect: { kind: "frontierJump", amount: 1 },
  },
  {
    id: "viral_jailbreak",
    weight: 2,
    tone: "good",
    headline: "Someone Jailbreaks Your Model Into Writing Poetry",
    body: "It's actually beautiful. The press calls it 'soul'. You call it 'an undocumented feature'. Signups spike across your products.",
    effect: { kind: "productBuzz", durationSec: 55 },
  },
  {
    id: "datacenter_cooling",
    weight: 2,
    tone: "good",
    headline: "A Cold Snap Cuts the Cooling Bill",
    body: "Winter does your thermal management for free. The fans idle; the ops team naps. Compute ×1.4 while it lasts.",
    effect: { kind: "buff", target: "computeMult", factor: 1.4, durationSec: 40 },
  },
  // --- More faction choices (doomer ↔ accelerationist) ---
  {
    id: "faction_redteam",
    weight: 2,
    tone: "bad",
    headline: "Red Team Finds Something",
    body: "Your safety team found a way to make the model do something genuinely alarming. Do you delay to fix it, or ship and patch later?",
    choices: [
      { label: "Delay & fix it (+20% data, careful)", effect: { kind: "grantPct", resource: "data", pct: 0.2 }, alignment: -0.3 },
      { label: "Ship and patch later (Compute ×1.8)", effect: { kind: "buff", target: "computeMult", factor: 1.8, durationSec: 45 }, alignment: 0.3 },
    ],
  },
  {
    id: "faction_compute_deal",
    weight: 2,
    tone: "good",
    headline: "A Hyperscaler Offers Cheap Compute",
    body: "The catch: their terms let them train on your usage. Sign for the compute, or walk for the principle?",
    choices: [
      { label: "Walk away (+25% data, integrity)", effect: { kind: "grantPct", resource: "data", pct: 0.25 }, alignment: -0.28 },
      { label: "Sign it (Compute ×2 briefly)", effect: { kind: "buff", target: "computeMult", factor: 2, durationSec: 40 }, alignment: 0.32 },
    ],
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

  // --- Phase B content wave: more ambient satire for variety across runs. ---
  {
    id: "acquihire",
    weight: 2,
    tone: "good",
    headline: "Acquihire Offer (Declined)",
    body: "A megacorp offers to buy you just to shut you down. You decline, then leak the number. The press does the rest. +30% cash.",
    effect: { kind: "grantPct", resource: "money", pct: 0.3 },
  },
  {
    id: "synthetic_flywheel",
    weight: 2,
    tone: "good",
    headline: "Synthetic Data Flywheel",
    body: "The model trains on its own outputs and somehow improves. Nobody mentions model collapse out loud. Data yield ×1.7, briefly.",
    effect: { kind: "buff", target: "dataMult", factor: 1.7, durationSec: 50 },
  },
  {
    id: "tax_break",
    weight: 2,
    tone: "good",
    headline: "Datacenter Tax Break",
    body: "A small town gives you 20 years of free electricity to build next to the school. Compute ×1.5 while the goodwill lasts.",
    effect: { kind: "buff", target: "computeMult", factor: 1.5, durationSec: 50 },
  },
  {
    id: "enterprise_pilot",
    weight: 2,
    tone: "good",
    headline: "Enterprise 'Pilot' Signs",
    body: "A Fortune 500 commits to a six-figure pilot they will never roll out. The logo goes on your homepage anyway. +28% cash.",
    effect: { kind: "grantPct", resource: "money", pct: 0.28 },
  },
  {
    id: "token_price_war",
    weight: 3,
    tone: "bad",
    headline: "Token Price War",
    body: "A rival drops their API price below cost to 'buy market share.' You follow them off the cliff. Revenue ×0.7 for a while.",
    effect: { kind: "buff", target: "moneyMult", factor: 0.7, durationSec: 45 },
  },
  {
    id: "hardware_recall",
    weight: 2,
    tone: "bad",
    headline: "Accelerator Recall",
    body: "A whole GPU generation has a silent data-corruption bug. The vendor calls it a 'feature flag.' Compute ×0.65 until swapped.",
    effect: { kind: "buff", target: "computeMult", factor: 0.65, durationSec: 45 },
  },
  {
    id: "data_poisoned",
    weight: 2,
    tone: "bad",
    headline: "Training Set Poisoned",
    body: "Artists seeded the web with traps and your scraper ate every one. The model now thinks all cats are watermarks. −18% data.",
    effect: { kind: "grantPct", resource: "data", pct: -0.18 },
  },
  {
    id: "founder_tweets",
    weight: 2,
    tone: "bad",
    headline: "The Founder Tweets",
    body: "At 3am you promise AGI by Thursday and insult three governments. The apology costs more than the engagement was worth. −14% cash.",
    effect: { kind: "grantPct", resource: "money", pct: -0.14 },
  },
  {
    id: "rolling_blackouts",
    weight: 2,
    tone: "bad",
    headline: "Grid Can't Keep Up",
    body: "Your datacenter browned out the whole county. The utility 'requests' you curtail. Compute ×0.75 until the lights come back.",
    effect: { kind: "buff", target: "computeMult", factor: 0.75, durationSec: 40 },
  },
  {
    id: "choice_defense_contract",
    weight: 2,
    tone: "good",
    headline: "Defense Contract on the Table",
    body: "A three-letter agency wants your models for 'analysis.' The pay is absurd; half the company threatens to walk. Everyone's watching.",
    choices: [
      { label: "Sign it (+35% cash)", effect: { kind: "grantPct", resource: "money", pct: 0.35 }, alignment: 0.32 },
      { label: "Walk away (+25% data, morale)", effect: { kind: "grantPct", resource: "data", pct: 0.25 }, alignment: -0.32 },
    ],
  },
  {
    id: "choice_eu_act",
    weight: 2,
    tone: "bad",
    headline: "The AI Act Lands",
    body: "Brussels mails you a compliance binder thicker than your seed deck. You can lawyer up, or quietly relocate the training run offshore.",
    choices: [
      { label: "Comply fully (−12% cash, clean record)", effect: { kind: "grantPct", resource: "money", pct: -0.12 }, alignment: -0.3 },
      { label: "Move it offshore (Compute ×1.7)", effect: { kind: "buff", target: "computeMult", factor: 1.7, durationSec: 45 }, alignment: 0.3 },
    ],
  },
  {
    id: "choice_capability_eval",
    weight: 2,
    tone: "good",
    headline: "Publish the Dangerous-Capabilities Eval?",
    body: "Your red team found something genuinely alarming. Publishing builds trust and hands rivals a roadmap. The doc is one click from public.",
    choices: [
      { label: "Publish it (+30% data, transparency)", effect: { kind: "grantPct", resource: "data", pct: 0.3 }, alignment: -0.3 },
      { label: "Bury it (Revenue ×1.8)", effect: { kind: "buff", target: "moneyMult", factor: 1.8, durationSec: 45 }, alignment: 0.3 },
    ],
  },

  // --- Content wave (2026-06-28): more 2-choice dilemmas → more player agency, each
  //     feeding the now-active alignment fork (doomer − / accelerationist +). ---
  {
    id: "choice_chat_logs",
    weight: 2,
    tone: "good",
    headline: "Mine the Chat Logs?",
    body: "Every conversation users had with your model is sitting in a bucket, unlabeled and legally grey. The data team is salivating; Legal has gone pale.",
    choices: [
      { label: "Delete them (privacy-first, +20% data the honest way)", effect: { kind: "grantPct", resource: "data", pct: 0.2 }, alignment: -0.3 },
      { label: "Train on everything (Data yield ×1.9)", effect: { kind: "buff", target: "dataMult", factor: 1.9, durationSec: 45 }, alignment: 0.32 },
    ],
  },
  {
    id: "choice_automate_staff",
    weight: 2,
    tone: "good",
    headline: "Automate Your Own Researchers?",
    body: "The model is now good enough to write most of the code. Finance has drawn up a very tidy org chart with a lot of empty boxes.",
    choices: [
      { label: "Keep the humans (morale, +25% data)", effect: { kind: "grantPct", resource: "data", pct: 0.25 }, alignment: -0.28 },
      { label: "Replace them (slash costs, +35% cash)", effect: { kind: "grantPct", resource: "money", pct: 0.35 }, alignment: 0.32 },
    ],
  },
  {
    id: "choice_power_source",
    weight: 2,
    tone: "good",
    headline: "Power the New Datacenter",
    body: "The grid can't feed your next training run. You can fast-track a gas turbine, or wait on solar-plus-storage and a stack of permits.",
    choices: [
      { label: "Solar + storage (clean, +25% data)", effect: { kind: "grantPct", resource: "data", pct: 0.25 }, alignment: -0.3 },
      { label: "Fire up the gas turbine (Compute ×2)", effect: { kind: "buff", target: "computeMult", factor: 2, durationSec: 40 }, alignment: 0.33 },
    ],
  },
  {
    id: "choice_emergency_brake",
    weight: 2,
    tone: "bad",
    headline: "The Eval Trips the Emergency Brake",
    body: "An automated safety eval just flagged the new checkpoint and halted the run on its own. You can honor the halt, or override it and keep training.",
    choices: [
      { label: "Honor the halt (careful, Revenue ×1.6)", effect: { kind: "buff", target: "moneyMult", factor: 1.6, durationSec: 50 }, alignment: -0.34 },
      { label: "Override it (Compute ×2 briefly)", effect: { kind: "buff", target: "computeMult", factor: 2, durationSec: 45 }, alignment: 0.34 },
    ],
  },

  // --- R6.2: faction-branched pools. These only enter the table once you've COMMITTED
  //     to a side (alignment past worldEvents.factionThreshold), so a "safety run" and a
  //     "send-it run" see genuinely different events. Untagged events above always fire. ---
  // Doomer pool — caution compounds: clean data, grants, goodwill.
  {
    id: "doomer_safety_grant",
    weight: 3,
    tone: "good",
    faction: "doomer",
    headline: "Safety Institute Funds You",
    body: "Your published evals and refusal to set the world on fire earn a no-strings research grant. Turns out caution has a budget line now. +30% data.",
    effect: { kind: "grantPct", resource: "data", pct: 0.3 },
  },
  {
    id: "doomer_trust_premium",
    weight: 3,
    tone: "good",
    faction: "doomer",
    headline: "Enterprises Pay for 'The Safe One'",
    body: "Risk-averse Fortune 500s route their contracts to the lab that won't end up in a hearing. Boring is, briefly, very profitable. Revenue ×1.7.",
    effect: { kind: "buff", target: "moneyMult", factor: 1.7, durationSec: 50 },
  },
  {
    id: "doomer_interpretability",
    weight: 2,
    tone: "good",
    faction: "doomer",
    headline: "Interpretability Breakthrough",
    body: "You actually understand a layer now. The findings make the model both safer AND faster — a rare day where the cautious path also wins the race. Compute ×1.6.",
    effect: { kind: "buff", target: "computeMult", factor: 1.6, durationSec: 50 },
  },
  // Accelerationist pool — speed compounds: raw compute, hype, raises.
  {
    id: "accel_scaling_run",
    weight: 3,
    tone: "good",
    faction: "accel",
    headline: "The 10× Run Pays Off",
    body: "You sent it. No eval freeze, no committee, just a glorious wall of GPUs and a prayer. It worked. (This time.) Compute ×2 while it's hot.",
    effect: { kind: "buff", target: "computeMult", factor: 2, durationSec: 45 },
  },
  {
    id: "accel_hype_raise",
    weight: 3,
    tone: "good",
    faction: "accel",
    headline: "Momentum Round at a Silly Valuation",
    body: "Going fast is its own pitch deck. Investors throw money at the lab that ships weekly and apologizes never. +40% cash.",
    effect: { kind: "grantPct", resource: "money", pct: 0.4 },
  },
  {
    id: "accel_viral_launch",
    weight: 2,
    tone: "good",
    faction: "accel",
    headline: "Ship-First Goes Viral",
    body: "You launched the half-baked feature on a Friday and the internet did your QA for free. The buzz is enormous; the bug reports are tomorrow's problem.",
    effect: { kind: "productBuzz", durationSec: 60 },
  },
];

export const balance = {
  /**
   * DIFFICULTY (owner-directed retune 2026-06-29). A single global multiplier on
   * EVERY Compute/Data/Money cost — upgrades AND research. The economy is a
   * spend-to-grow feedback loop, so scaling all costs by K stretches the whole
   * curve ~K× longer (first prestige and every generation) without distorting the
   * internal balance of *which* upgrade to buy when. Dial this one number to make
   * the game faster/slower; re-run `npm run sim` to read the new pacing.
   */
  difficulty: { costMult: 2.0 },

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
    /** A run can never resolve faster than this, however much run-speed you stack. */
    minDurationSec: 0.5,
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
    /** Recruiter hire-cost discount is floored here (hires never cheaper than this
     *  fraction of base). */
    hireDiscountFloor: 0.25,
    /** Product-team effect reductions are floored so a stacked roster can't drive a
     *  lane to zero/negative (serveCost/churn/heat multipliers). */
    productModFloors: { serveCost: 0.2, churn: 0.2, heat: 0.1 },
    /** Diminishing returns on stacking one lane. Contributors to a lane are ranked
     *  by raw output; the k-th (0-indexed) counts at 1/(1 + k·perLaneRate). Output
     *  diminishes but payroll does NOT — so a small, trained, high-trait team beats
     *  zerg-hiring a wall of juniors. perLaneRate 0 = old linear behaviour. */
    diminishing: { perLaneRate: 0.18 },
    /** Rare "legendary" recruits: occasionally a candidate rolls in already trained
     *  (higher start level) with a guaranteed elite trait — a satisfying chase on
     *  re-roll. Same signing bonus, so they're a genuine score (not pay-to-win;
     *  recruiting is opt-in and doesn't touch the lab curve). */
    rare: { chance: 0.12, level: 2, traits: ["tenx", "workaholic", "mentor"] },
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
    /** legacyWeightsGained = max(1, floor((lifetimeMoney / scale) ^ exponent)).
     *  scale raised 1e4→1e5 (2026-06-29 retune) so a much longer run banks fewer
     *  weights → a gentler per-ship boost → the meta-loop stays a real journey. */
    scale: 1e5,
    exponent: 0.5,
    /** Depth B1 — shipping with the SAME charter as the previous run multiplies the
     *  Legacy banked by this (conviction / double-down). 1 = off. Charters don't exist
     *  at the first ship and the sim never sets one, so this is curve-safe. */
    charterConvictionBonus: 1.15,
    /** Each Legacy Weight grants this much permanent global production. Halved in the
     *  2026-06-29 difficulty retune so the post-first-ship META-loop doesn't snowball
     *  into sub-minute generations — re-beating the game in minutes was the complaint. */
    multiplierPerPoint: 0.018,
    /**
     * Diminishing exponent on the Legacy multiplier: legacyMult = 1 + perPoint ×
     * weights^multiplierExponent. <1 means each extra weight is worth a little
     * less, so prestige still feels like a jump but late generations don't
     * collapse to sub-minute ships (R4.1). At 0 weights it's exactly 1 (first
     * prestige unchanged); the meta-loop past the first ship is what this retunes.
     */
    multiplierExponent: 0.8,

    /**
     * GDD §4 — shipping is a player-flavored choice with minor different bonuses.
     * `deploy` is the default and MUST equal the historical behavior exactly
     * (legacyMult 1, keeps the product draft, no kickstart) so the tuned curve /
     * `npm run sim` stay byte-identical — the sim always ships via deploy. The
     * other two are opt-in trade-offs, never the balanced baseline. First-pass
     * numbers; tune against the sim if they prove too strong/weak.
     */
    // `reputationBonus` = Lab Reputation earned per ship in this mode (community
    // goodwill). `momentum` = a temporary all-lane buff applied at the START of the
    // next run (the community iterating on your release), or null. Both are 0/null
    // for every mode the sim uses, so the tuned curve is untouched.
    shipModes: {
      deploy: {
        id: "deploy", label: "Deploy commercially",
        blurb: "Balanced. Bank full Legacy Weights and keep the model as a product draft to commercialise.",
        legacyMult: 1, keepsDraft: true, moneyKickstartPerShip: 0, frontierPenalty: 0, unlockShips: 0,
        reputationBonus: 0, momentum: null as null | { factor: number; durationSec: number },
      },
      open_source: {
        id: "open_source", label: "Open-source it",
        blurb: "Give the model to the world: no product draft, but the community rewards you — bonus Legacy, Lab Reputation, and a wave of contributions that supercharges your next run.",
        legacyMult: 1.3, keepsDraft: false, moneyKickstartPerShip: 0, frontierPenalty: 0, unlockShips: 0,
        reputationBonus: 5, momentum: { factor: 1.4, durationSec: 120 } as null | { factor: number; durationSec: number },
      },
      sell: {
        id: "sell", label: "Sell to a hyperscaler",
        blurb: "Cash up front to bootstrap the next run, but fewer Legacy Weights and no product draft.",
        legacyMult: 0.5, keepsDraft: false, moneyKickstartPerShip: 200, frontierPenalty: 0, unlockShips: 0,
        reputationBonus: 0, momentum: null as null | { factor: number; durationSec: number },
      },
      // B5 challenge: an OPTIONAL risk/reward ship, unlocked once you know the loop.
      // Rivals start further ahead (your carried products begin behind), but you
      // bank +50% Legacy. Lives in the same chooser — no new screen/mechanic.
      hard: {
        id: "hard", label: "Hard ship (challenge)",
        blurb: "Rivals leap ahead — your products start behind — but bank +50% Legacy. For when the easy money bores you.",
        legacyMult: 1.5, keepsDraft: true, moneyKickstartPerShip: 0, frontierPenalty: 6, unlockShips: 3,
        reputationBonus: 0, momentum: null as null | { factor: number; durationSec: number },
      },
    },
  },

  offline: {
    /** Cap accrued offline time so it's a reward, not an exploit (LEARNINGS). */
    maxHours: 8,
    /** Premium QoL perk: a longer offline cap (GDD-sanctioned, not pay-for-power). */
    premiumMaxHours: 24,
  },

  /** Daily Boost — an HONEST once-a-day return reward (GDD §6: no fake-urgency
   *  countdown, no penalty for missing a day). Claiming applies a short, global
   *  output buff via the normal modifier system — purely temporary, so it never
   *  inflates the permanent curve. Tracked in a UI-only localStorage key, so no
   *  game-save migration. */
  daily: {
    factor: 1.5,
    durationSec: 180,
  },

  upgrades: [
    {
      id: "rack_basic",
      name: "Consumer GPU Rack",
      desc: "A shelf of gaming cards. It hums.",
      cost: { resource: "money", base: 15, growth: 1.15 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 2 },
    },
    {
      id: "rack_server",
      name: "Server GPU Rack",
      desc: "Proper datacenter silicon.",
      cost: { resource: "money", base: 220, growth: 1.16 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 12 },
    },
    {
      id: "rack_tpu",
      name: "TPU Pod",
      desc: "Tensor cores, allegedly.",
      cost: { resource: "money", base: 3500, growth: 1.17 },
      max: Infinity,
      effect: { kind: "computeFlat", perLevel: 80 },
    },
    {
      id: "overclock",
      name: "Overclock Firmware",
      desc: "Push the clocks past the warranty.",
      cost: { resource: "money", base: 600, growth: 1.5 },
      max: 25,
      effect: { kind: "computeMult", perLevel: 0.08 },
    },
    {
      id: "data_pipeline",
      name: "Data Pipeline",
      desc: "Cleaner inputs, fatter batches.",
      cost: { resource: "money", base: 120, growth: 1.4 },
      max: 25,
      effect: { kind: "dataMult", perLevel: 0.2 },
    },
    {
      id: "monetize",
      name: "Monetization Layer",
      desc: "Now with 'synergy.'",
      cost: { resource: "money", base: 150, growth: 1.4 },
      max: 25,
      effect: { kind: "moneyMult", perLevel: 0.2 },
    },
    {
      id: "batching",
      name: "Batch Scheduler",
      desc: "Pack the batches; finish sooner.",
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
      desc: "Lease the open bay to your right.",
      cost: { resource: "money", base: 5000, growth: 2.0 },
      max: 4,
      effect: { kind: "floorCols", perLevel: 2 },
    },
    {
      id: "expand_s",
      name: "Front Expansion",
      desc: "Pour more slab toward the entrance.",
      cost: { resource: "money", base: 7000, growth: 2.0 },
      max: 4,
      effect: { kind: "floorRows", perLevel: 2 },
    },
    // --- Power & Cooling (Phase 2: raise capacity so racks don't throttle) ---
    {
      id: "psu_bay",
      name: "PSU Bay",
      desc: "More racks run before they throttle.",
      cost: { resource: "money", base: 800, growth: 1.4 },
      max: Infinity,
      effect: { kind: "powerCapacity", perLevel: 40 },
    },
    {
      id: "cooling_loop",
      name: "Liquid Cooling Loop",
      desc: "Keeps the racks cool enough to run flat out.",
      cost: { resource: "money", base: 6000, growth: 1.45 },
      max: Infinity,
      effect: { kind: "powerCapacity", perLevel: 150 },
    },
    {
      id: "substation",
      name: "On-Site Substation",
      desc: "Industrial power for an industrial lab.",
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
    /** Getting raided cools you off this much (×) — you lay low afterwards. */
    postRaidHeatMult: 0.4,
    /** R5.5 cross-system: regulatory pressure scares off customers — product churn
     *  rises by up to this fraction at MAX Heat (×(1+this), linear in heat). */
    productChurnAtMax: 0.35,
    /** Lobbying: spend Money to cool Heat (buy goodwill). Cost rises with current
     *  Heat (a hotter lab is harder to clean up); one lobby cuts Heat by a fraction. */
    lobby: { baseCost: 500, costPerHeat: 80, reductionFraction: 0.4, minHeat: 1 },
    /** UI meter tiers: label + color, picked by the lowest `upTo` heat value the meter is under. */
    tiers: [
      { upTo: 25, label: "Cold", color: "#22c55e" },
      { upTo: 55, label: "Warm", color: "#eab308" },
      { upTo: 80, label: "Hot", color: "#f97316" },
      { upTo: Infinity, label: "Blazing", color: "#ef4444" },
    ],
  },

  /**
   * Depth B3 — the Regulator: a named bureaucrat with a LONG memory. `suspicion`
   * (0..100) rises with every shady buy, doesn't cool on its own (only lobbying
   * appeases it), and PERSISTS across prestige — so the regulator remembers you
   * between runs and the pressure escalates the more corners you cut. Curve-safe:
   * a clean lab (and the sim) never buys shady, so suspicion stays 0 → identity.
   */
  regulator: {
    name: "Supervisor Chen",
    max: 100,
    /** Suspicion added per shady action (a dark-web tool buy or a Bazaar risk buy). */
    perShadyBuy: 4,
    /** Regulatory-event chance is multiplied by up to (1 + this) at MAX suspicion —
     *  a watched lab gets audited far more often at the same Heat. */
    eventChanceBoostAtMax: 1.5,
    /** Lobbying also appeases the regulator: cut suspicion by this fraction per lobby. */
    lobbyReduction: 0.25,
    /** At this tier index and above, regulatory events are signed by the regulator
     *  (the bureaucrat becomes a recurring character). */
    nameFromTier: 2,
    /** Suspicion tiers (highest `at` ≤ suspicion wins). */
    tiers: [
      { at: 0, label: "Unwatched", blurb: "Nobody's looking. Enjoy it while it lasts." },
      { at: 25, label: "On the radar", blurb: "A junior analyst has a folder with your name on it." },
      { at: 55, label: "Under investigation", blurb: "Chen has opened a formal case. Lawyer up." },
      { at: 80, label: "Personal vendetta", blurb: "This is no longer about the law. It's personal now." },
    ],
  },

  /**
   * Faction alignment (−1 doomer … 0 neutral … +1 accelerationist), shifted by
   * faction-event choices. It used to be a dead dial (set, never read). Now it's
   * a real strategic lane-tilt, folded into derive() + the Heat sites. Every value
   * scales LINEARLY with |alignment| and is 0 at neutral, so a fresh run and the
   * balance sim (which never fires faction events) are byte-identical.
   *
   * Theme: accelerationist races capability — more Compute, but it burns cash and
   * draws regulators (more Heat). Doomer is cautious & commercial — more Money and
   * far less Heat, but slower Compute. A genuine "send it vs play it safe" choice.
   */
  alignment: {
    enabled: true,
    /** +Compute at full accelerationist (+1). */
    accelComputeBonus: 0.15,
    /** −Money at full accelerationist (the cost of moving fast). */
    accelMoneyPenalty: 0.1,
    /** +Money at full doomer (−1): careful, enterprise-friendly, profitable. */
    doomerMoneyBonus: 0.15,
    /** −Compute at full doomer (you move deliberately). */
    doomerComputePenalty: 0.1,
    /** Heat-generation multiplier from shady buys at full accelerationist (hotter). */
    heatGenAtAccel: 1.5,
    /** Heat-generation multiplier at full doomer (you keep your nose clean). */
    heatGenAtDoomer: 0.5,
    /** R5.5 cross-system: accelerationist labs market harder — product acquisition
     *  bonus at full +1 (×(1+this)). */
    productAcqBonus: 0.2,
    /** R5.5 cross-system: doomer labs ship cautiously — product Heat-generation is
     *  reduced by up to this fraction at full −1. */
    productHeatReduction: 0.4,
  },

  /** Regulatory events, weighted. Picked when an event fires (see actions). */
  heatEvents: [
    {
      id: "audit",
      weight: 4,
      tone: "bad",
      message: "Surprise audit! Regulators want their cut. Fined 25% of your cash.",
      effect: { fineFraction: 0.25, heatMul: 0.3 },
    },
    {
      id: "subpoena",
      weight: 3,
      tone: "bad",
      message: "Data subpoena — a chunk of your dataset is seized as evidence.",
      effect: { dataFraction: 0.2, heatMul: 0.5 },
    },
    {
      id: "whistleblower",
      weight: 2,
      tone: "bad",
      message: "A whistleblower leaks your sourcing. The heat is on.",
      effect: { heatAdd: 25 },
    },
    {
      id: "lobbyist",
      weight: 1,
      tone: "good",
      message: "A friendly lobbyist makes it all go away. Heat cleared.",
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
    /** R6.2 — |alignment| past this commits you to a faction's event pool. Neutral
     *  players (incl. the balance sim) never see tagged events → base pool unchanged. */
    factionThreshold: 0.4,
    /** "Hot topics" chaining: after an event fires, related events (same topic) are
     *  this much likelier on the next roll for a short window, so crises cluster and
     *  feel causal instead of random. Identity when nothing recent → curve-safe. */
    chainBoost: 3,
    /** How many recent fired-event ids the store keeps to drive chaining. */
    chainWindow: 3,
    /** Event id → topic. Only tagged events chain; untagged events never bias the
     *  pool. Topics group thematically-adjacent events (a GPU shortage makes a price
     *  war / compute donation likelier next). Central map = no per-event edits. */
    topics: {
      gpu_shortage: "compute", gpu_shortage_global: "compute", heatwave: "compute",
      compute_donation: "compute", hardware_recall: "compute", rolling_blackouts: "compute",
      datacenter_cooling: "compute", quantum_unrelated: "compute", tax_break: "compute",
      power_bill: "compute", smuggling_busted: "compute",
      market_crash: "money", gov_grant: "money", series_c: "money", acquihire: "money",
      enterprise_pilot: "money", token_price_war: "money", founder_tweets: "money",
      lawsuit: "money", regulatory_sandbox: "money",
      data_breach: "data", opensource_dump: "data", benchmark_win: "data",
      synthetic_breakthrough: "data", synthetic_flywheel: "data", data_poisoned: "data",
      intern_refactor: "data", benchmark_vibes: "data",
      competitor_launch: "rival", rival_closedai: "rival", rival_goggle: "rival",
      rival_anthropos: "rival", rival_meta: "rival", rival_xaeai: "rival",
      hallucination_scandal: "rival",
      viral_demo: "hype", influencer: "hype", industry_hype: "hype",
      viral_jailbreak: "hype", agi_internally: "hype",
      pause_letter: "safety", hallucination_demo: "safety", talent_war: "safety",
    } as Record<string, string>,
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
      desc: "Someone finally read the paper.",
      requires: [],
      cost: { compute: 500, data: 0 },
      effect: { kind: "computeMult", factor: 1.5 },
    },
    {
      id: "curated_data",
      name: "Curated Dataset",
      desc: "Less garbage in. Less garbage out.",
      requires: ["backprop"],
      cost: { compute: 0, data: 120 },
      effect: { kind: "dataMult", factor: 1.6 },
    },
    {
      id: "mixed_precision",
      name: "Mixed Precision",
      desc: "Train in fp16 and pray.",
      requires: ["backprop"],
      cost: { compute: 2500, data: 0 },
      effect: { kind: "computeMult", factor: 1.5 },
    },
    {
      id: "data_aug",
      name: "Data Augmentation",
      desc: "Flip it, crop it, call it new.",
      requires: ["curated_data"],
      cost: { compute: 0, data: 700 },
      effect: { kind: "dataMult", factor: 1.6 },
    },
    {
      id: "distributed",
      name: "Distributed Training",
      desc: "Many machines, one loss curve.",
      requires: ["mixed_precision", "curated_data"],
      cost: { compute: 6000, data: 400 },
      effect: { kind: "moneyMult", factor: 1.8 },
    },
    {
      id: "rlhf",
      name: "RLHF Pipeline",
      desc: "Underpaid humans rank chatbot replies.",
      requires: ["data_aug"],
      cost: { compute: 3000, data: 2200 },
      effect: { kind: "moneyMult", factor: 1.8 },
    },
    {
      id: "caching",
      name: "KV Cache",
      desc: "Stop recomputing the obvious.",
      requires: ["distributed"],
      cost: { compute: 9000, data: 0 },
      effect: { kind: "runSpeed", factor: 0.85 },
    },
    {
      id: "distillation",
      name: "Model Distillation",
      desc: "Smaller, faster, mostly the same.",
      requires: ["distributed"],
      cost: { compute: 22000, data: 1500 },
      effect: { kind: "runSpeed", factor: 0.75 },
    },
    {
      id: "moe",
      name: "Mixture of Experts",
      desc: "A dozen mediocre models in a trench coat.",
      requires: ["caching", "distillation"],
      cost: { compute: 75000, data: 3000 },
      effect: { kind: "computeMult", factor: 2 },
    },
    {
      id: "inference_api",
      name: "Ship: Inference API",
      desc: "Deploy the model as a product. It earns while you sleep.",
      requires: ["distillation", "rlhf"],
      cost: { compute: 130000, data: 7000 },
      // Money/sec per unit of Compute/sec — a fraction of throughput becomes revenue.
      effect: { kind: "unlockPassiveMoney", perSec: 0.3 },
    },
    {
      id: "scaling_laws",
      name: "Scaling Laws",
      desc: "The graph only goes up. Probably.",
      requires: ["moe"],
      cost: { compute: 300000, data: 0 },
      effect: { kind: "computeMult", factor: 2.5 },
    },

    // --- Late-era branch (Phase B2): gated behind Scaling Laws, so it's only
    // reachable deep into a run (post-first-prestige). The early/mid curve and
    // the sim are untouched; this is extra to chase in eras 3–6. ---
    {
      id: "synthetic_data",
      name: "Synthetic Data Engine",
      desc: "Models teach models. Nobody mentions model collapse.",
      requires: ["scaling_laws"],
      cost: { compute: 250000, data: 20000 },
      effect: { kind: "dataMult", factor: 2 },
    },
    {
      id: "flash_attention",
      name: "Flash Attention",
      desc: "Attention, but it goes brrr.",
      requires: ["scaling_laws"],
      cost: { compute: 450000, data: 0 },
      effect: { kind: "runSpeed", factor: 0.75 },
    },
    {
      id: "quantization",
      name: "4-bit Quantization",
      desc: "Half the bits, somehow still coherent.",
      requires: ["scaling_laws"],
      cost: { compute: 600000, data: 15000 },
      effect: { kind: "moneyMult", factor: 2 },
    },
    {
      id: "multi_datacenter",
      name: "Multi-Datacenter Run",
      desc: "Your own power grid, your own problems.",
      requires: ["flash_attention", "synthetic_data"],
      cost: { compute: 1500000, data: 50000 },
      effect: { kind: "computeMult", factor: 3 },
    },
    {
      id: "world_model",
      name: "World Model",
      desc: "It dreams now. The dreams are mostly ads.",
      requires: ["multi_datacenter", "quantization"],
      cost: { compute: 3000000, data: 120000 },
      effect: { kind: "moneyMult", factor: 2.5 },
    },
    {
      id: "recursive_self_improvement",
      name: "Recursive Self-Improvement",
      desc: "It writes its own training code. You watch, nervously.",
      requires: ["world_model"],
      cost: { compute: 8000000, data: 300000 },
      effect: { kind: "computeMult", factor: 4 },
    },
    // --- "Pick one" specialisation (off Scaling Laws) — a per-run build choice.
    // Both are leaves (nothing depends on them), so the existing chains are intact.
    {
      id: "sparse_arch",
      name: "Sparse Activation",
      desc: "Only wake the neurons you need. Lean, mean, cheaper compute.",
      requires: ["scaling_laws"],
      exclusiveGroup: "architecture",
      cost: { compute: 500000, data: 10000 },
      effect: { kind: "computeMult", factor: 2.2 },
    },
    {
      id: "dense_scaling",
      name: "Dense Scaling",
      desc: "No tricks. Just a wall of parameters and conviction. Richer outputs.",
      requires: ["scaling_laws"],
      exclusiveGroup: "architecture",
      cost: { compute: 500000, data: 10000 },
      effect: { kind: "moneyMult", factor: 2.2 },
    },
    // --- Capstone fork (off RSI) — the thematic alignment choice.
    {
      id: "aligned_path",
      name: "The Aligned Path",
      desc: "Slow, careful, auditable. The model is safe, profitable, and a little smug.",
      requires: ["recursive_self_improvement"],
      exclusiveGroup: "doctrine",
      cost: { compute: 12000000, data: 600000 },
      effect: { kind: "moneyMult", factor: 4 },
    },
    {
      id: "accelerationist_path",
      name: "The Accelerationist Path",
      desc: "Foot down, eyes forward, brakes optional. Raw capability, consequences TBD.",
      requires: ["recursive_self_improvement"],
      exclusiveGroup: "doctrine",
      cost: { compute: 12000000, data: 600000 },
      effect: { kind: "computeMult", factor: 5 },
    },
  ] satisfies ResearchDef[],
};

export type Balance = typeof balance;
