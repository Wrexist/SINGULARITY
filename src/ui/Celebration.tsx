import { useEffect } from "react";
import type { Big } from "../engine/math/Big";
import { fmt } from "./format";

interface Props {
  weightsGained: Big;
  totalWeights: Big;
  onDone: () => void;
}

const CONFETTI = Array.from({ length: 26 });
const COLORS = ["#ff385c", "#2f7bf6", "#9b51e0", "#16b364", "#ff9f0a"];

/**
 * The "Ship the Model" milestone moment (GDD §6 / GAMEPLAN §7.3) — the tentpole
 * reward beat. Full-screen glass takeover, confetti burst, the satirical
 * headline, and the Legacy Weights banked. Auto-dismisses; tap to skip.
 */
export function Celebration({ weightsGained, totalWeights, onDone }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 3600);
    return () => window.clearTimeout(t);
  }, [onDone]);

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
        <div className="celebrate-rocket">🚀</div>
        <h2>Model Shipped</h2>
        <p className="celebrate-sub">
          Investors are “thrilled.” The press release writes itself. You banked:
        </p>
        <div className="celebrate-weights">
          +{fmt(weightsGained)}
          <span>Legacy Weights</span>
        </div>
        <p className="celebrate-total">New total: {fmt(totalWeights)} · a faster lab awaits</p>
        <button className="btn btn-ship" onClick={onDone}>
          Begin next generation
        </button>
      </div>
    </div>
  );
}
