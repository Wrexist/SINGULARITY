import { useEffect } from "react";
import type { Big } from "../engine/math/Big";
import { fmt, m$ } from "./format";
import { RocketIcon } from "./Icons";

export interface ShipReport {
  /** The generation number just completed (ships). */
  gen: number;
  /** Player's market rank this run, or null (no live product). */
  rank: number | null;
  peakCompute: Big;
  peakMrr: number;
}

interface Props {
  weightsGained: Big;
  totalWeights: Big;
  report?: ShipReport;
  onDone: () => void;
}

const CONFETTI = Array.from({ length: 26 });
const COLORS = ["#ff385c", "#2f7bf6", "#9b51e0", "#16b364", "#ff9f0a"];

// Rotating satirical headlines so the tentpole moment doesn't read the same every
// ship (picked deterministically by generation, so no render churn).
const HEADLINES = [
  "Model Shipped",
  "Another One Ships",
  "The Press Release Writes Itself",
  "Shipped It (Again)",
  "A New Generation Begins",
];

/**
 * The "Ship the Model" milestone moment (GDD §6) — now a Generation Report: the
 * tentpole reward beat with the Legacy banked AND a snapshot of how far the run
 * got (peak compute, peak revenue, market rank). Auto-dismisses; tap to skip.
 */
export function Celebration({ weightsGained, totalWeights, report, onDone }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 4200);
    return () => window.clearTimeout(t);
  }, [onDone]);

  // gen is 1-based (first ship = gen 1), so offset to zero-based before the modulo
  // or generation 1 would skip the first headline.
  const headline = report ? HEADLINES[(report.gen - 1) % HEADLINES.length]! : "Model Shipped";

  return (
    <div className="celebrate" onClick={onDone}>
      <div className="confetti" aria-hidden="true">
        {CONFETTI.map((_, i) => (
          <span
            key={i}
            style={{
              ["--x" as string]: `${(Math.random() * 2 - 1).toFixed(2)}`,
              ["--d" as string]: `${(Math.random() * 0.5).toFixed(2)}s`,
              ["--r" as string]: `${Math.floor(Math.random() * 360)}deg`,
              left: `${Math.floor(Math.random() * 100)}%`,
              background: COLORS[i % COLORS.length],
            }}
          />
        ))}
      </div>

      <div className="celebrate-card">
        <div className="celebrate-rocket"><RocketIcon size={40} /></div>
        {report && <div className="celebrate-gen">Generation {report.gen}</div>}
        <h2>{headline}</h2>
        <p className="celebrate-sub">Investors are “thrilled.” You banked:</p>
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
        <p className="celebrate-total">New total: {fmt(totalWeights)} · a faster lab awaits</p>
        <button className="btn btn-ship" onClick={onDone}>
          Begin next generation
        </button>
      </div>
    </div>
  );
}
