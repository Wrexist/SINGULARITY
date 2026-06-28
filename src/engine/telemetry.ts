/**
 * Local telemetry — PURE aggregation (R8.1).
 *
 * This module is data-in → data-out: `summarize(events)` folds a list of recorded
 * play events into a readable summary. It has NO clock, NO storage, NO randomness —
 * exactly like every other `src/engine/` module, so it is fully unit-testable and the
 * engine-purity guardrail holds. The *recording* of events (which needs the wall clock
 * + localStorage) lives in `src/state/telemetry.ts`, the same store-layer boundary that
 * already owns the wall clock and the RNG rolls.
 *
 * PRIVACY: events carry only elapsed durations and counters — no ids, no device info,
 * no PII. The recorder keeps them on-device and never transmits them, so the App Store
 * "Data Not Collected" label is preserved.
 *
 * Run timing uses the engine's own accrued `playtimeSec` (from LifetimeStats), NOT
 * wall-clock deltas — so offline time and tab-backgrounding never distort the curve,
 * and the numbers line up with the balance sim (first prestige ≈ 12m15s).
 */

export interface TelemetryEventBase {
  /** Wall-clock ms when recorded (set by the store recorder). Used only for ordering
   *  and session spans — never for run timing (that uses engine playtime). */
  t: number;
}

export type TelemetryEvent =
  | ({ kind: "session" } & TelemetryEventBase)
  | ({ kind: "prestige"; gen: number; playtimeSec: number; weights: number; era: number } & TelemetryEventBase)
  | ({ kind: "era"; era: number; playtimeSec: number } & TelemetryEventBase)
  | ({ kind: "purchase"; gen: number; playtimeSec: number } & TelemetryEventBase)
  | ({ kind: "tab"; tab: string } & TelemetryEventBase);

export interface TelemetrySummary {
  /** Number of play sessions started. */
  sessions: number;
  /** Total recorded events (for the "clear" affordance + sanity). */
  totalEvents: number;
  /** Engine playtime (s) at the FIRST ship; null until the player has prestiged once. */
  firstPrestigeSec: number | null;
  /** Per-generation run length (s): genTimes[0] = first run, [1] = second run, … */
  genTimes: number[];
  /** First engine-playtime (s) at which each era index was reached. */
  eraArrivalSec: Record<number, number>;
  /** Longest stretch (s) within a single generation with no progress purchase — a
   *  "wall" proxy: where the player went longest without buying anything. */
  longestWallSec: number;
  /** Tab id → number of times the player switched to it. */
  tabCounts: Record<string, number>;
}

function finite(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

/** Fold recorded events into a readable, on-device summary. Pure. */
export function summarize(events: TelemetryEvent[]): TelemetrySummary {
  const summary: TelemetrySummary = {
    sessions: 0,
    totalEvents: Array.isArray(events) ? events.length : 0,
    firstPrestigeSec: null,
    genTimes: [],
    eraArrivalSec: {},
    longestWallSec: 0,
    tabCounts: {},
  };
  if (!Array.isArray(events) || events.length === 0) return summary;

  // Cumulative engine playtime at each generation's ship (gen → playtimeSec).
  const shipAt = new Map<number, number>();
  // Purchase playtimes grouped by generation (for wall detection).
  const buysByGen = new Map<number, number[]>();

  for (const e of events) {
    switch (e.kind) {
      case "session":
        summary.sessions += 1;
        break;
      case "prestige":
        if (finite(e.gen) && finite(e.playtimeSec)) shipAt.set(e.gen, e.playtimeSec);
        break;
      case "era":
        if (finite(e.era) && finite(e.playtimeSec)) {
          const prev = summary.eraArrivalSec[e.era];
          if (prev === undefined || e.playtimeSec < prev) summary.eraArrivalSec[e.era] = e.playtimeSec;
        }
        break;
      case "purchase":
        if (finite(e.gen) && finite(e.playtimeSec)) {
          const list = buysByGen.get(e.gen) ?? [];
          list.push(e.playtimeSec);
          buysByGen.set(e.gen, list);
        }
        break;
      case "tab":
        if (e.tab) summary.tabCounts[e.tab] = (summary.tabCounts[e.tab] ?? 0) + 1;
        break;
    }
  }

  // Per-generation run length = cumulative playtime at gen N minus at gen N-1.
  // (playtimeSec survives prestige, so it is monotonic across runs.)
  const gens = [...shipAt.keys()].sort((a, b) => a - b);
  let prevPlay = 0;
  for (const g of gens) {
    const play = shipAt.get(g) ?? prevPlay;
    const runLen = Math.max(0, play - prevPlay);
    summary.genTimes.push(runLen);
    prevPlay = play;
  }
  summary.firstPrestigeSec = summary.genTimes.length > 0 ? (summary.genTimes[0] ?? null) : null;

  // Wall = the longest gap between consecutive progress purchases within one generation.
  for (const buys of buysByGen.values()) {
    buys.sort((a, b) => a - b);
    for (let i = 1; i < buys.length; i++) {
      const gap = (buys[i] ?? 0) - (buys[i - 1] ?? 0);
      if (gap > summary.longestWallSec) summary.longestWallSec = gap;
    }
  }

  return summary;
}

/** Signature of "progress bought so far" — sum of upgrade levels (racks, automations,
 *  hall expansions) + owned research nodes. Used by the store to detect a purchase by
 *  diffing across ticks (one hook instead of touching every buy action). Pure. */
export function purchaseSignature(upgrades: Record<string, number>, research: string[]): number {
  let sum = 0;
  for (const k in upgrades) {
    const v = upgrades[k];
    if (v !== undefined && finite(v)) sum += v;
  }
  return sum + (Array.isArray(research) ? research.length : 0);
}
