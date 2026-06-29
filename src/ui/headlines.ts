import { Big } from "../engine/math/Big";

/**
 * History-aware Ship-celebration headlines (A3). The tentpole "Model Shipped" beat
 * now reflects what the run ACTUALLY achieved (market rank, peak compute/revenue,
 * generation milestones) instead of a fixed rotation — same dopamine moment, but
 * it's the player's story. Pure + deterministic (no clock/RNG) → unit-testable.
 */
export interface HeadlineInput {
  gen: number;
  rank: number | null;
  peakCompute: Big;
  peakMrr: number;
}

// Fallback rotation when no standout achievement applies (keyed by generation so
// it's stable per ship — no render churn).
const ROTATION = [
  "Model Shipped",
  "Another One Ships",
  "The Press Release Writes Itself",
  "Shipped It (Again)",
  "A New Generation Begins",
];

/** Pick the most impressive headline this run earned; fall back to the rotation. */
export function shipHeadline(r: HeadlineInput): string {
  if (r.rank === 1) return "Market Leader — You're #1";
  if (r.peakCompute.gte(Big.of(1e12))) return "The Scaling Triumph";
  if (r.peakMrr >= 100_000) return "Cash-Flow Positive (Briefly)";
  if (r.rank != null && r.rank <= 3) return "Cracking the Top Three";
  // Generation milestones (only when no scale/rank standout fired).
  if (r.gen === 1) return "Your First Ship";
  if (r.gen >= 25) return "The Veteran's Run";
  if (r.gen >= 10) return "Double Digits";
  if (r.gen === 5) return "Five and Counting";
  return ROTATION[(r.gen - 1) % ROTATION.length]!;
}
