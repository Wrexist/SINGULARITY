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
  /** An AGI ASCENSION (a ship in the Post-Singularity era): the grandest beat in
   *  the game gets its own headline tier, above every other standout. */
  ascended?: boolean;
}

// Fallback rotation when no standout achievement applies (keyed by generation so
// it's stable per ship — no render churn). The biggest dopamine beat in the game;
// deep enough that mid-game ships don't visibly cycle.
const ROTATION = [
  "Model Shipped",
  "Another One Ships",
  "The Press Release Writes Itself",
  "Shipped It (Again)",
  "A New Generation Begins",
  "State of the Art (For a Week)",
  "The Benchmarks Never Saw It Coming",
  "Weights Up, Doubts Down",
  "Investors Notified. Rivals Too.",
  "Somewhere, a Rival Slack Goes Quiet",
  "The Launch Tweet Is Live",
  "Bigger. Hungrier. Shippier.",
  "Ship Logged, Ego Restored",
  "The Demo Gods Were Merciful",
  "One More for the Changelog",
  "The Frontier Moved. You Moved It.",
  "Weights Banked, Hubris Deployed",
  "The Board Will Be Pleased",
  "A Fresh Coat of State-of-the-Art",
  "Ship First, Benchmark Later",
  "The Roadmap Bends Toward Shipping",
  "Another Notch on the GPU",
  "The Waitlist Groans With Joy",
  "Version Whatever, Vibes Immaculate",
];

/** Pick the most impressive headline this run earned; fall back to the rotation. */
export function shipHeadline(r: HeadlineInput): string {
  if (r.ascended) return "The Singularity Files Its Own Press Release";
  if (r.rank === 1) return "Market Leader — You're #1";
  if (r.peakCompute.gte(Big.of(1e12))) return "The Scaling Triumph";
  if (r.peakMrr >= 100_000) return "Cash-Flow Positive (Briefly)";
  if (r.rank != null && r.rank <= 3) return "Cracking the Top Three";
  // Second-tier standouts — a run that was strong-but-not-record still earns a
  // headline about ITS story instead of dropping to the generic rotation.
  if (r.rank != null && r.rank <= 10) return "Onto the Leaderboard";
  if (r.peakCompute.gte(Big.of(1e9))) return "Gigascale and Climbing";
  if (r.peakMrr >= 10_000) return "The Revenue Is Real";
  // Generation milestones (only when no scale/rank standout fired).
  if (r.gen === 1) return "Your First Ship";
  if (r.gen >= 25) return "The Veteran's Run";
  if (r.gen >= 10) return "Double Digits";
  if (r.gen === 5) return "Five and Counting";
  return ROTATION[(r.gen - 1) % ROTATION.length]!;
}

/** The tentpole subtitle under the headline — a one-line reaction to THIS run that
 *  leads into the banked weights. Was a single frozen "Investors are thrilled";
 *  now it reflects the run's standout (era, rank, scale, stance). Pure; always ends
 *  with the "You banked:" lead-in so the weights block reads on from it. */
export function shipSubtitle(r: HeadlineInput): string {
  const tail = " You banked:";
  if (r.ascended) return "History splits into before and after." + tail;
  if (r.era != null && r.era >= 5) return "The singularity files its own press release." + tail;
  if (r.rank === 1) return "The board is already drafting a bigger fund." + tail;
  if (r.peakMrr >= 100_000) return "Finance is doing a quiet victory lap." + tail;
  if (r.peakCompute.gte(Big.of(1e12))) return "The cluster finally earned its power bill." + tail;
  if (r.rank != null && r.rank <= 3) return "The press is paying attention now." + tail;
  if (r.alignment != null && r.alignment <= -0.4) return "The safety team sleeps easy tonight." + tail;
  if (r.alignment != null && r.alignment >= 0.4) return "e/acc is in the mentions, approvingly." + tail;
  if (r.productsLive === 0) return "You shipped the model and skipped the business. Bold." + tail;
  const generic = [
    "Investors are “thrilled.”",
    "The all-hands erupts.",
    "Somewhere, a rival refreshes your blog.",
    "The changelog is short; the mood is not.",
    "Marketing has already made the graphic.",
    "The group chat is all rocket emoji.",
    "Legal asks that “AGI” stay in scare quotes.",
    "The GPUs are still warm; HR is not.",
    "Your cap table does a small confident lap.",
    "A competitor announces theirs tomorrow, coincidentally.",
    "The term “safe deployment” is used loosely.",
    "Someone updates the wiki at 2am, triumphantly.",
    "The office plant gets named after it.",
    "Two VCs slide in; one claims they called it.",
  ];
  return generic[(r.gen - 1 + generic.length * 100) % generic.length]! + tail;
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
