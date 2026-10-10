/**
 * The AI market (R-feedback) — named rival labs so "the competition" is something
 * the player can SEE and climb past, instead of an invisible `frontier` scalar.
 * Rivals' user bases scale with the frontier (the market grows as capability
 * advances), and the player's own products are ranked alongside them by real MAU.
 * Satirical, fictional names — no real companies.
 *
 * Each rival has a FOCUS (a worldview that mirrors the player's alignment axis:
 * scaler ≈ accelerationist, safety ≈ doomer, money ≈ commercial) + a personality
 * blurb, so the leaderboard reacts to the player with character instead of just a
 * bar (see engine/market.ts `marketLeaderboard` reactions). Pure data.
 */

export type RivalFocus = "scaler" | "safety" | "money";

export interface RivalDef {
  name: string;
  vendor: string;
  /** Relative size weight; the rivals split the rival pool by these. */
  weight: number;
  focus: RivalFocus;
  /** Personality one-liner shown in the rival's leaderboard row. */
  blurb: string;
}

export const market = {
  /** Rival user pool = base + frontier × perFrontier, split across the rivals by
   *  weight. Tuned so a new lab is an underdog and a scaled one dominates. */
  rivalBaseUsers: 14_000_000,
  rivalUsersPerFrontier: 220_000,
  /** Rival counterplay (IMPROVEMENTS #8) — the "press blitz": spend Money to dent
   *  a rival that's ahead of you. CURVE-SAFE BY DESIGN: the leaderboard is a pure
   *  sidecar (no incomes flow from it), so a strike buys race position and
   *  bragging rights, never production — the cost is a genuine money sink. */
  counterplay: {
    enabled: true,
    /** Money cost per (current) user of the targeted rival. Scales with the
     *  frontier automatically, so the blitz stays a real decision all game. */
    costPerUser: 0.005,
    /** Each strike multiplies the rival's user base by this for the rest of the
     *  run (they "recover" when the acquirer resets the board at prestige). */
    effectPerStrike: 0.85,
    /** A rival can only be blitzed this many times per run (diminishing story
     *  beats, not a delete button). */
    maxStrikesPerRival: 3,
    /** Playtime seconds between strikes (any rival) — a pacing valve, surfaced
     *  honestly in the UI as "the press cycle needs to reset". */
    cooldownSec: 240,
  },
  /** Frontier Race stakes (depth batch 2026-08) — wager Reputation on overtaking a
   *  specific rival before your next ship. CURVE-SAFE: placing is a player-only
   *  action (the sim never stakes) and the payout is Lab Reputation (a meta-currency
   *  that feeds nothing in derive), so a stake buys race TENSION, never production. */
  stakes: {
    enabled: true,
    /** Reputation paid on a WON stake, by the rival's weight tier (bigger rival =
     *  bolder claim = bigger payout). Losing pays nothing — that's the wager. */
    repPerWeightTier: [
      { minWeight: 25, rep: 6 },
      { minWeight: 12, rep: 4 },
    ],
    /** Fallback payout for the smallest rivals (below every tier above). */
    repFloor: 2,
  },
  /**
   * AUDIT 2026-08 #8 — THE RIVAL COLD WAR. A second verb for the stretch where the
   * only verb is "buy": Money-only Operations against your nearest rival (the one just
   * ahead of you, or the runner-up when you lead). Poach a researcher or publish a
   * takedown and they turn hostile — and retaliate, on a deterministic delay, with a
   * short "bad" modifier (a workable incident). Sign a compute pact for a surge and a
   * truce; move against a pact partner and it's a betrayal (sooner, harsher). Every
   * effect is a TEMPORARY modifier behind a player tap, and the balance sim never runs
   * an operation, so the tuned curve cannot move. Resets on prestige.
   */
  coldWar: {
    enabled: true,
    /** Playtime seconds between operations (any rival): one per news cycle. */
    cooldownSec: 180,
    /** A hostile operation is answered after min + (hash % spread) seconds of play. */
    retaliateMinSec: 60,
    retaliateSpreadSec: 90,
    /** Moving against a pact partner is answered this soon. */
    betrayalSec: 20,
    /** How long a compute pact's truce holds (playtime seconds). */
    pactSec: 600,
    ops: {
      // Cost = the larger of (rival users × costPerUser) and (your Money × bankShare):
      // the bank share keeps an operation a real decision all game (a rival-sized fee
      // alone was pocket change to a lab with a deep bank), never a wall.
      poach: { costPerUser: 0.004, bankShare: 0.04, target: "dataMult", factor: 1.5, durationSec: 180, hostile: true },
      takedown: { costPerUser: 0.006, bankShare: 0.06, target: "moneyMult", factor: 1.3, durationSec: 180, hostile: true },
      pact: { costPerUser: 0.003, bankShare: 0.03, target: "computeMult", factor: 1.35, durationSec: 300, hostile: false },
    },
    /** What each kind of retaliation does to you (all temporary, all workable). */
    retaliation: {
      poach: { target: "dataMult", factor: 0.75, durationSec: 90, label: "Counter-poached" },
      takedown: { target: "moneyMult", factor: 0.8, durationSec: 90, label: "Your evals leaked" },
      betrayal: { target: "computeMult", factor: 0.6, durationSec: 120, label: "Pact betrayed" },
    },
  },
  rivals: [
    { name: "Cortex-5", vendor: "ClosedAI", weight: 30, focus: "scaler", blurb: "Three-hour keynotes, one new feature, infinite confidence." },
    { name: "Claudius", vendor: "Anthropos", weight: 25, focus: "safety", blurb: "Ships a 90-page safety card and a model that's annoyingly good." },
    { name: "Gemiknight", vendor: "Goggle", weight: 22, focus: "money", blurb: "Bolts an AI onto seven products nobody asked for." },
    { name: "Llamabot", vendor: "Meta", weight: 15, focus: "safety", blurb: "Open-sources everything, then acts surprised when you use it." },
    { name: "Groketta", vendor: "xAEAI", weight: 8, focus: "scaler", blurb: "Powered by a datacenter and a billionaire's grudge." },
  ] satisfies RivalDef[],
};
