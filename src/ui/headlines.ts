import { Big } from "../engine/math/Big";
import { eraName } from "../engine/eras";

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
  /** Run context for the "this run's story" recap (A5). Optional so older callers
   *  still type-check; the recap is skipped when absent. */
  era?: number;
  alignment?: number;
  productsLive?: number;
  rivalsBeaten?: number;
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

const plural = (n: number) => (n === 1 ? "" : "s");

/** A 2–3 line satirical recap of the run just shipped (A5). Auto-generated from run
 *  stats so the Generation Report reads like a story, not just a stat block. Pure. */
export function runStory(r: HeadlineInput): string[] {
  const lines: string[] = [];
  if (r.era != null) lines.push(`Reached ${eraName(r.era)} in Generation ${r.gen}.`);

  if (r.alignment != null) {
    if (r.alignment <= -0.4) lines.push("Held the line on safety — the cautious path, taken on purpose.");
    else if (r.alignment >= 0.4) lines.push("Went all gas, no brakes — acceleration above all.");
    else lines.push("Played it down the middle, ideologically uncommitted.");
  }

  if (r.productsLive != null) {
    if (r.productsLive > 0) {
      const beaten = r.rivalsBeaten ?? 0;
      const tail = r.rank === 1 ? " — #1 on the market." : beaten > 0 ? `, outranking ${beaten} rival${plural(beaten)}.` : ".";
      lines.push(`Ran ${r.productsLive} product${plural(r.productsLive)}${tail}`);
    } else {
      lines.push("Shipped the model before commercialising a single product. Bold.");
    }
  }
  return lines.slice(0, 3);
}
