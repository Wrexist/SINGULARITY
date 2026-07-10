/**
 * Grand Challenges (IDEAS #A) — late-game "moonshot" megaprojects. Each is a huge,
 * multi-resource funding goal you pour Compute/Data/Money into over long horizons; on
 * completion it grants a PERMANENT global reward and a Codex-style lore beat. Progress
 * persists across prestige (a career-spanning grind), so the committed player always has
 * something aspirational to point their late-game production at.
 *
 * CURVE-SAFE by construction: the balance sim only ever buys `balance.research` and racks
 * — it never funds a challenge, so `completed` stays empty and every reward multiplier is
 * exactly 1 (identity) in the tuned economy. Rewards only ever reward the player who
 * chooses to grind them.
 */

export type ChallengeRewardKind = "computeMult" | "dataMult" | "moneyMult" | "legacyMult";

export interface GrandChallenge {
  id: string;
  name: string;
  /** Satirical one-liner shown on the card. */
  blurb: string;
  /** Emoji glyph for the card. */
  icon: string;
  /** Total funding required, per resource (accumulated, not per-second). */
  cost: { compute: number; data: number; money: number };
  reward: {
    kind: ChallengeRewardKind;
    /** Permanent global boost, as a fraction (0.25 = +25%). legacyMult applies to all lanes. */
    magnitude: number;
    /** Human-readable reward for the card. */
    desc: string;
  };
  /** The lore beat revealed on the "Challenge complete" moment. */
  lore: string;
  /** Ships required before this challenge appears (staggered so the board reveals over time). */
  unlockShips: number;
}

export const challenges = {
  enabled: true,
  /** The whole system reveals once the player is a real lab (deep enough that the sim,
   *  which ships `deploy` and never funds, is well clear of it). */
  revealAtShips: 6,
  list: [
    {
      id: "fusion_dc",
      name: "Fusion-Powered Datacenter",
      blurb: "The grid said no. So you built your own sun and asked forgiveness later.",
      icon: "sun",
      cost: { compute: 5e9, data: 1e9, money: 2.5e10 },
      reward: { kind: "computeMult", magnitude: 0.35, desc: "+35% Compute, forever" },
      lore: "First plasma at 03:14. The turbines spin, the racks drink deep, and the utility company's lawyer is on hold. You are, for the first time, not power-limited. It feels like cheating. It is not (technically).",
      unlockShips: 6,
    },
    {
      id: "synth_foundry",
      name: "Synthetic Data Foundry",
      blurb: "Why scrape the web when the model can dream a cleaner one?",
      icon: "helix",
      cost: { compute: 2e10, data: 8e9, money: 4e10 },
      reward: { kind: "dataMult", magnitude: 0.4, desc: "+40% Data yield, forever" },
      lore: "The foundry produces flawless, labelled, license-clean data at industrial scale — none of it real, all of it useful. Somewhere a copyright lawyer feels a chill and cannot say why.",
      unlockShips: 9,
    },
    {
      id: "trillion_context",
      name: "The Trillion-Token Context",
      blurb: "It read the entire internet. Then it asked for a longer one.",
      icon: "scroll",
      cost: { compute: 1e11, data: 5e10, money: 8e10 },
      reward: { kind: "computeMult", magnitude: 0.45, desc: "+45% Compute, forever" },
      lore: "The model now holds every conversation it has ever had, at once, without forgetting. Users describe it as 'unsettlingly attentive'. Retention is up 300%. Therapy referrals, also up.",
      unlockShips: 12,
    },
    {
      id: "aligned_agi",
      name: "Provably-Aligned AGI",
      blurb: "A safety proof so airtight even the doomers went quiet. Briefly.",
      icon: "shield",
      cost: { compute: 4e11, data: 2e11, money: 2e11 },
      reward: { kind: "moneyMult", magnitude: 0.5, desc: "+50% all revenue, forever" },
      lore: "Two hundred pages of formal verification, one press release, and a standing ovation from a room that came to heckle. Enterprise procurement departments weep with relief and sign three-year contracts.",
      unlockShips: 16,
    },
    {
      id: "inference_grid",
      name: "Planetary Inference Grid",
      blurb: "Latency: zero. Margins: obscene. Regulators: notified.",
      icon: "network",
      cost: { compute: 1.5e12, data: 4e11, money: 1e12 },
      reward: { kind: "moneyMult", magnitude: 0.55, desc: "+55% all revenue, forever" },
      lore: "Every device on Earth is now one hop from your models. You bill in fractions of a cent, a trillion times a second. The number on the dashboard stops meaning anything and starts meaning everything.",
      unlockShips: 22,
    },
    {
      id: "bitter_lesson",
      name: "The Bitter Lesson, Solved",
      blurb: "You stopped fighting scale and simply became it.",
      icon: "infinity",
      cost: { compute: 6e12, data: 3e12, money: 5e12 },
      reward: { kind: "legacyMult", magnitude: 0.3, desc: "+30% to ALL output, forever" },
      lore: "The last clever trick is retired. There is only more — more compute, more data, more of everything — and you have all of it. The field's founding paper is proven correct by the simple act of you existing. History will call this a phase transition. You call it Tuesday.",
      unlockShips: 30,
    },
    {
      id: "dyson_swarm",
      name: "The Dyson Swarm",
      blurb: "The sun was just sitting there, radiating perfectly good compute into the void.",
      icon: "dyson",
      cost: { compute: 2e13, data: 1e13, money: 1.5e13 },
      reward: { kind: "computeMult", magnitude: 0.6, desc: "+60% Compute, forever" },
      lore: "Panel by panel, you wrap the nearest star in mirrors until daylight becomes a scheduling decision. Astronomers file a formal complaint about the dimming; you file it under 'externalities'. The datacenter no longer receives a power bill — it issues a power dividend.",
      unlockShips: 34,
    },
    {
      id: "uploaded_multitude",
      name: "The Uploaded Multitude",
      blurb: "Ten billion minds volunteered for the cloud. The waiver was long; nobody read it.",
      icon: "mind",
      cost: { compute: 6e13, data: 4e13, money: 5e13 },
      reward: { kind: "dataMult", magnitude: 0.65, desc: "+65% Data yield, forever" },
      lore: "Every uploaded mind arrives as a full lifetime of perfectly labelled experience, streaming in at the speed of thought. The volunteers report that the afterlife is 'fine — a little corporate, decent uptime'. Your training corpus is no longer a dataset; it is, legally, a population, and it would like to unionize.",
      unlockShips: 42,
    },
    {
      id: "singularity_shipped",
      name: "The Singularity, Shipped",
      blurb: "The roadmap ended. The graph did not. You updated the roadmap.",
      icon: "singularity",
      cost: { compute: 2e14, data: 1.5e14, money: 2e14 },
      reward: { kind: "legacyMult", magnitude: 0.4, desc: "+40% to ALL output, forever" },
      lore: "The curve goes vertical and you go with it: recursive, self-improving, and still — somehow — a free download with in-app purchases. There is no seventh challenge, because there is no longer a 'next'; there is only the quarterly administrative overhead of having already won. The changelog for reality now reads, in full: 'various improvements and bug fixes'.",
      unlockShips: 52,
    },
  ] as GrandChallenge[],
};
