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
  rivals: [
    { name: "Cortex-5", vendor: "ClosedAI", weight: 30, focus: "scaler", blurb: "Three-hour keynotes, one new feature, infinite confidence." },
    { name: "Claudius", vendor: "Anthropos", weight: 25, focus: "safety", blurb: "Ships a 90-page safety card and a model that's annoyingly good." },
    { name: "Gemiknight", vendor: "Goggle", weight: 22, focus: "money", blurb: "Bolts an AI onto seven products nobody asked for." },
    { name: "Llamabot", vendor: "Meta", weight: 15, focus: "safety", blurb: "Open-sources everything, then acts surprised when you use it." },
    { name: "Groketta", vendor: "xAEAI", weight: 8, focus: "scaler", blurb: "Powered by a datacenter and a billionaire's grudge." },
  ] satisfies RivalDef[],
};
