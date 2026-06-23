import type { Derived, GameState } from "../engine/types";
import { fmt } from "./format";

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

  return (
    <div className="dock">
      <div className="dock-head">
        <span className="dock-title">Training Run</span>
        <span className="dock-sub">
          cost {fmt(derived.runComputeCost)} compute → {fmt(derived.runDataYield)} data · {fmt(derived.runMoneyYield)} money
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
        <button className="btn btn-primary" disabled={!canStart} onClick={onStart}>
          {run.active ? "Training…" : "Start training run"}
        </button>
      )}
    </div>
  );
}
