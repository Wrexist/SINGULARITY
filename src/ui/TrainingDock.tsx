import type { Derived, GameState } from "../engine/types";
import { fmt, fmtMoney } from "./format";

interface Props {
  game: GameState;
  derived: Derived;
  onStart: () => void;
  onClaim: () => void;
}

/** The active loop: assign Compute → watch the bar → claim Data + Money. */
export function TrainingDock({ game, derived, onStart, onClaim }: Props) {
  const { run } = game;
  const canStart = !run.active && !run.readyToClaim && game.resources.compute.gte(derived.runComputeCost);
  const pct = Math.min(100, run.progress * 100);

  // Coach the very first run, then get out of the way (clean-to-play).
  const firstRun = game.lifetimeMoney.eq(0) && game.prestige.ships === 0;
  let hint: string | null = null;
  if (firstRun) {
    if (run.readyToClaim) hint = "Done! Claim your first Data + Money 🎉";
    else if (run.active) hint = "Training… payouts land when the bar fills.";
    else if (canStart) hint = "Ready — start your first training run 👇";
    else hint = "Your server closet is making Compute. Start a run when you can afford it.";
  }

  return (
    <div className="dock">
      <div className="dock-head">
        <span className="dock-title">Training Run</span>
        <span className="dock-sub">
          cost {fmt(derived.runComputeCost)} compute → {fmt(derived.runDataYield)} data · {fmtMoney(derived.runMoneyYield)}
        </span>
      </div>

      <div className={`progress ${run.readyToClaim ? "ready" : ""}`}>
        <div className="progress-fill" style={{ width: `${run.readyToClaim ? 100 : pct}%` }} />
        <span className="progress-label">
          {run.readyToClaim ? "Complete" : run.active ? `${pct.toFixed(0)}%` : "Idle"}
        </span>
      </div>

      {run.readyToClaim ? (
        <button className="btn btn-claim" onClick={onClaim}>
          Claim payout
        </button>
      ) : (
        <button className={`btn btn-primary ${canStart && firstRun ? "nudge" : ""}`} disabled={!canStart} onClick={onStart}>
          {run.active ? "Training…" : "Start training run"}
        </button>
      )}

      {hint && <p className="coach">{hint}</p>}
    </div>
  );
}
