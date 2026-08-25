import { useMemo } from "react";
import type { GameState, ShipLogEntry } from "../engine/types";
import { balance } from "../engine/balance/config";
import { charters } from "../engine/balance/charters";
import { trialsBalance } from "../engine/trials";
import { eraName } from "../engine/eras";
import { EmptyState } from "./EmptyState";
import { BookIcon, SparkIcon } from "./Icons";
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
    const durationSec =
      entry.atSec !== undefined && (i === 0 || prev?.atSec !== undefined)
        ? Math.max(0, entry.atSec - (prev?.atSec ?? 0))
        : null;
    return { entry, label: entry.gen ?? null, durationSec };
  });
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

  return (
    <div className="archive">
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
