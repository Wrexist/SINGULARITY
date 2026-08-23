import { useEffect, useRef, useState } from "react";
import type { Big } from "../engine/math/Big";
import { fmt, m$ } from "./format";
import { shipHeadline, runStory, shipSubtitle } from "./headlines";
import { shareRunCard } from "./shareCard";
import { useSettings } from "./settings";
import { RocketIcon } from "./Icons";

export interface ShipReport {
  /** The generation number just completed (ships). */
  gen: number;
  /** Player's market rank this run, or null (no live product). */
  rank: number | null;
  peakCompute: Big;
  peakMrr: number;
  /** Run context for the "this run's story" recap (A5). */
  era: number;
  alignment: number;
  productsLive: number;
  rivalsBeaten: number;
}

interface Props {
  weightsGained: Big;
  totalWeights: Big;
  report?: ShipReport;
  /** An AGI ascension ship: the gold super-ceremony (own headline tier, all-gold
   *  confetti at double density, a gilded card) — the grandest beat shouldn't
   *  wear generation 2's clothes. */
  ascended?: boolean;
  onDone: () => void;
}

const CONFETTI = Array.from({ length: 26 });
const ASCENSION_CONFETTI = Array.from({ length: 48 });
const COLORS = ["#ff385c", "#2f7bf6", "#9b51e0", "#16b364", "#ff9f0a"];
const GOLD = ["#ffd60a", "#ff9f0a", "#a855f7", "#ffe9a3", "#fff"];

/**
 * The "Ship the Model" milestone moment (GDD §6) — now a Generation Report: the
 * tentpole reward beat with the Legacy banked AND a snapshot of how far the run
 * got (peak compute, peak revenue, market rank). Auto-dismisses; tap to skip.
 */
export function Celebration({ weightsGained, totalWeights, report, ascended, onDone }: Props) {
  // Sharing pauses the auto-dismiss: the OS share sheet must never race the
  // card unmounting underneath it. Once held, dismissal is manual only.
  // The timer is armed exactly ONCE (mount) and calls through a ref: App
  // re-renders at 10Hz with a fresh onDone identity, so an [onDone] dep would
  // silently re-arm the timeout every render — and un-pause it after a share.
  const timer = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [shareNote, setShareNote] = useState<string | null>(null);
  useEffect(() => {
    timer.current = window.setTimeout(() => onDoneRef.current(), 4200);
    return () => { if (timer.current !== null) window.clearTimeout(timer.current); };
  }, []);

  const onShare = async (e: React.MouseEvent) => {
    e.stopPropagation(); // the backdrop tap dismisses — sharing must not
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    if (!report) return;
    const note = await shareRunCard(report, weightsGained, totalWeights);
    if (note) setShareNote(note);
  };

  // History-aware: the headline AND the subtitle reflect what THIS run achieved (A3);
  // an ascension overrides every tier with its own ceremony copy.
  const headline = report ? shipHeadline(report) : "Model Shipped";
  const subtitle = report ? shipSubtitle(report) : "Investors are “thrilled.” You banked:";
  const story = report ? runStory(report) : [];

  const reducedMotion = useSettings((s) => s.reducedMotion);

  return (
    <div className="celebrate" onClick={onDone}>
      {!reducedMotion && <div className="confetti" aria-hidden="true">
        {(ascended ? ASCENSION_CONFETTI : CONFETTI).map((_, i) => (
          <span
            key={i}
            style={{
              ["--x" as string]: `${(Math.random() * 2 - 1).toFixed(2)}`,
              ["--d" as string]: `${(Math.random() * 0.5).toFixed(2)}s`,
              ["--r" as string]: `${Math.floor(Math.random() * 360)}deg`,
              left: `${Math.floor(Math.random() * 100)}%`,
              background: (ascended ? GOLD : COLORS)[i % (ascended ? GOLD : COLORS).length],
            }}
          />
        ))}
      </div>}

      <div className={`celebrate-card${ascended ? " ascended" : ""}`}>
        <div className="celebrate-rocket"><RocketIcon size={40} /></div>
        {report && <div className="celebrate-gen">Generation {report.gen}</div>}
        <h2>{headline}</h2>
        <p className="celebrate-sub">{subtitle}</p>
        <div className="celebrate-weights">
          +{fmt(weightsGained)}
          <span>Legacy Weights</span>
        </div>
        {report && (
          <div className="celebrate-report">
            <div className="cr-stat"><b>{fmt(report.peakCompute)}</b><span>peak compute/s</span></div>
            <div className="cr-stat"><b>{report.peakMrr > 0 ? `${m$(report.peakMrr)}/s` : "—"}</b><span>peak revenue</span></div>
            <div className="cr-stat"><b>{report.rank != null ? `#${report.rank}` : "—"}</b><span>market rank</span></div>
          </div>
        )}
        {story.length > 0 && (
          <div className="celebrate-story">
            {story.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        )}
        <p className="celebrate-total">New total: {fmt(totalWeights)} · a faster lab awaits</p>
        <button className="btn btn-ship" onClick={onDone}>
          Begin next generation
        </button>
        {report && (
          <button className="link-btn celebrate-share" onClick={onShare}>
            Share this run ↗
          </button>
        )}
        {shareNote && <p className="celebrate-share-note">{shareNote}</p>}
      </div>
    </div>
  );
}
