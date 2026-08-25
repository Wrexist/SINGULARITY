import { useMemo } from "react";
import type { GameState, ShipLogEntry } from "../engine/types";
import { balance } from "../engine/balance/config";
import { charters } from "../engine/balance/charters";
import { trialsBalance } from "../engine/trials";
import { eraName } from "../engine/eras";
import { EmptyState } from "./EmptyState";
import { BookIcon, SparkIcon } from "./Icons";
import { Sparkline } from "./Sparkline";
import { fmt, fmtDur } from "./format";
import { Big } from "../engine/math/Big";

/**
 * THE ARCHIVE — every generation you have shipped, as it was.
 *
 * The game had a Legacy Wall in the hall (eight trophy plinths) and a Generation
 * Report that appears for one moment after a ship and is then gone forever. Nothing
 * held the shape of a career: by generation forty a player could not answer "what
 * was my longest run", "when did I stop hiring", "which generation did I fly the
 * moonshot charter". The runs blurred, which is precisely the failure mode the whole
 * depth programme exists to fight.
 *
 * The Archive is read-only by design and has ZERO economy surface — nothing in the
 * engine reads it, no perk, no multiplier, no claim. That is what makes it the
 * safest possible addition to a live, tuned game: it cannot move the curve because
 * it is not wired to anything that could.
 *
 * Generations shipped before save v35 kept no record, so their unrecorded fields
 * render as an em dash. The Archive never invents a history the player didn't play.
 */

const MODE_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(balance.prestige.shipModes).map((m) => [m.id, m.label]),
);
const CHARTER_LABEL: Record<string, string> = Object.fromEntries(
  charters.list.map((c) => [c.id, c.name]),
);
const TRIAL_LABEL: Record<string, string> = Object.fromEntries(
  trialsBalance.list.map((t) => [t.id, t.name]),
);

const DASH = "—";

/** 10^mag as a display string. The Archive stores magnitudes, so this is where the
 *  number comes back — via Big, so an endgame magnitude never overflows to Infinity
 *  the way Math.pow(10, mag) would past ~308. */
function fromMag(mag: number | undefined): string {
  if (mag === undefined) return DASH;
  return fmt(Big.of(10).pow(mag));
}

function count(n: number | undefined): string {
  return n === undefined ? DASH : String(n);
}

/** One generation's row, with the length of the run derived by differencing the
 *  playtime stamps of consecutive entries (no run clock needed on state). */
interface Row {
  entry: ShipLogEntry;
  /** Display number: the recorded gen, or the position in the log for old entries. */
  label: number | null;
  /** Seconds this generation ran, or null when either stamp is missing. */
  durationSec: number | null;
}

export function archiveRows(game: GameState): Row[] {
  const log = game.shipLog;
  return log.map((entry, i) => {
    const prev = i > 0 ? log[i - 1] : undefined;
    // Differencing against zero at index 0 is only right when that entry really IS
    // the first generation. The log is capped, so past `shipLogCap` ships the oldest
    // RETAINED entry is generation 41-odd — and treating its playtime stamp as an
    // elapsed time would report the player's entire career as the length of one run.
    // Without the generation below it there is no honest answer, so say so.
    const fromZero = i === 0 && entry.gen === 1;
    const havePrev = prev?.atSec !== undefined;
    const durationSec =
      entry.atSec !== undefined && (fromZero || havePrev)
        ? Math.max(0, entry.atSec - (prev?.atSec ?? 0))
        : null;
    return { entry, label: entry.gen ?? null, durationSec };
  });
}

/**
 * The career arc — the one thing forty rows of numbers cannot tell you: whether you
 * are actually getting better. Legacy banked per generation, oldest to newest.
 *
 * Reads `legacyMag` directly, which is already a base-10 log — so the trace stays
 * legible across the twenty-odd orders of magnitude a long career spans, where a
 * linear plot of the same data would be a flat line and then a cliff. (That the
 * stored form happens to be exactly the right form to plot is the payoff for storing
 * magnitudes rather than Bigs.)
 *
 * Only the CONTIGUOUS RECORDED TAIL is plotted. Generations shipped before save v35
 * recorded nothing, and drawing a line across that gap would invent a slope between
 * two points that were never measured together.
 */
export function careerArc(game: GameState): { mags: number[]; from: number; to: number } | null {
  const log = game.shipLog;
  let start = log.length;
  while (start > 0 && log[start - 1]!.legacyMag !== undefined) start--;
  const tail = log.slice(start);
  if (tail.length < 2) return null;
  const from = tail[0]!.gen, to = tail[tail.length - 1]!.gen;
  if (from === undefined || to === undefined) return null;
  return { mags: tail.map((e) => e.legacyMag!), from, to };
}

export function ArchiveBoard({ game }: { game: GameState }) {
  // Newest first: the question a player opens the Archive with is almost always
  // about the recent past, and a forty-row scroll to reach it is a wall.
  const rows = useMemo(() => archiveRows(game).slice().reverse(), [game]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<BookIcon size={20} />}
        text="No generations on record yet."
        hint="Ship your first model and this fills in — one entry per generation, kept for good."
      />
    );
  }

  const arc = careerArc(game);

  return (
    <div className="archive">
      {arc && (
        <div className="archive-arc">
          <div className="archive-arc-line">
            <Sparkline values={arc.mags} width={240} height={34} />
          </div>
          <div className="archive-arc-foot">
            <span>Legacy banked</span>
            <span>Gen {arc.from} → {arc.to}</span>
          </div>
        </div>
      )}
      {rows.map((row, i) => {
        const e = row.entry;
        return (
          <div className={`archive-row ${e.asc ? "ascended" : ""}`} key={`${row.label ?? "g"}-${i}`}>
            <div className="archive-head">
              <span className="archive-gen">{row.label !== null ? `Gen ${row.label}` : "Gen —"}</span>
              <span className="archive-era">{eraName(e.era) || DASH}</span>
              {e.asc && (
                <span className="archive-asc" title="An AGI ascension">
                  <SparkIcon size={11} /> ascended
                </span>
              )}
            </div>
            <div className="archive-mode">
              {MODE_LABEL[e.mode] ?? e.mode}
              {e.charter && <span className="archive-tag">{CHARTER_LABEL[e.charter] ?? e.charter}</span>}
              {e.trial && <span className="archive-tag archive-trial">{TRIAL_LABEL[e.trial] ?? e.trial}</span>}
            </div>
            <dl className="archive-stats">
              <div><dt>Legacy</dt><dd>{fromMag(e.legacyMag)}</dd></div>
              <div><dt>Peak Compute</dt><dd>{e.peakComputeMag === undefined ? DASH : `${fromMag(e.peakComputeMag)}/s`}</dd></div>
              <div><dt>Research</dt><dd>{count(e.research)}</dd></div>
              <div><dt>Products</dt><dd>{count(e.products)}</dd></div>
              <div><dt>Staff</dt><dd>{count(e.staff)}</dd></div>
              <div><dt>Ran for</dt><dd>{row.durationSec === null ? DASH : fmtDur(row.durationSec)}</dd></div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

/** Generations on record / the depth the Archive keeps — for the Collapsible badge. */
export function archiveCount(game: GameState): number {
  return game.shipLog.length;
}
