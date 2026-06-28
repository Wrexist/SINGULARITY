/**
 * The AI market (R-feedback) — named rival labs so "the competition" is something
 * the player can SEE and climb past, instead of an invisible `frontier` scalar.
 * Rivals' user bases scale with the frontier (the market grows as capability
 * advances), and the player's own products are ranked alongside them by real MAU.
 * Satirical, fictional names — no real companies.
 */

export interface RivalDef {
  name: string;
  vendor: string;
  /** Relative size weight; the rivals split the rival pool by these. */
  weight: number;
}

export const market = {
  /** Rival user pool = base + frontier × perFrontier, split across the rivals by
   *  weight. Tuned so a new lab is an underdog and a scaled one dominates. */
  rivalBaseUsers: 14_000_000,
  rivalUsersPerFrontier: 220_000,
  rivals: [
    { name: "Cortex-5", vendor: "ClosedAI", weight: 30 },
    { name: "Claudius", vendor: "Anthropos", weight: 25 },
    { name: "Gemiknight", vendor: "Goggle", weight: 22 },
    { name: "Llamabot", vendor: "Meta", weight: 15 },
    { name: "Groketta", vendor: "xAEAI", weight: 8 },
  ] satisfies RivalDef[],
};
