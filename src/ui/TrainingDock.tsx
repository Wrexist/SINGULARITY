import type { Derived, GameState } from "../engine/types";
import { fmt, fmtMoney } from "./format";
import { trainingIntensity } from "../engine/derive";
import { burst, floatText } from "./fx";

interface Props {
  game: GameState;
  derived: Derived;
  onStart: () => void;
  onClaim: () => void;
  onSetFocus: (v: number) => void;
}

/** The active loop: assign Compute → watch the bar → claim Data + Money. */
export function TrainingDock({ game, derived, onStart, onClaim, onSetFocus }: Props) {
  const { run } = game;
  const canStart = !run.active && !run.readyToClaim && game.resources.compute.gte(derived.runComputeCost);
  const pct = Math.min(100, run.progress * 100);

  // Training intensity: scales the RUN SIZE (a light run sips Compute and pays
  // proportionally less — owner fix: at scale, full runs swallowed the whole
  // bank) AND how much auto-train reserves before firing. Only shown once
  // auto-train exists (before that the player paces runs by hand).
  const focus = game.computeFocus;
  const runSizePct = Math.round(trainingIntensity(focus) * 100);
  const focusLabel =
    focus === 0
      ? `Holding — light ${runSizePct}% runs, Compute banks freely`
      : `${Math.round(focus * 100)}% · ${runSizePct}%-size runs · banks up to ${fmt(derived.runComputeCost.div(focus))}`;

  // Coach the very first run, then get out of the way (clean-to-play).
  const firstRun = game.lifetimeMoney.eq(0) && game.prestige.ships === 0;
  let hint: string | null = null;
  if (firstRun) {
    if (run.readyToClaim) hint = "Done! Claim your first Data + Money.";
    else if (run.active) hint = "Training… payouts land when the bar fills.";
    else if (canStart) hint = "Ready — start your first training run.";
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
        <button
          className="btn btn-claim"
          onClick={(e) => {
            // Juice the most-repeated action: a payout burst + rising "+Data / +$"
            // floaters right at the button.
            const r = e.currentTarget.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            burst(cx, r.top + r.height / 2, { count: 18, power: 1.1, colors: ["#2f7bf6", "#16b364", "#ff9f0a"] });
            floatText(cx - 34, r.top, `+${fmt(derived.runDataYield)}`, "#2f7bf6", 17);
            floatText(cx + 34, r.top - 4, `+${fmtMoney(derived.runMoneyYield)}`, "#16b364", 17);
            onClaim();
          }}
        >
          Claim payout
        </button>
      ) : (
        <button className={`btn btn-primary ${canStart && firstRun ? "nudge" : ""}`} disabled={!canStart} onClick={onStart}>
          {run.active ? "Training…" : "Start training run"}
        </button>
      )}

      {derived.autoTrain && (
        <div className="focus">
          <div className="focus-head">
            <span className="focus-title">Training intensity</span>
            <span className="focus-val">{focusLabel}</span>
          </div>
          <input
            className="focus-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(focus * 100)}
            onChange={(e) => onSetFocus(Number(e.target.value) / 100)}
            aria-label="Training intensity"
            aria-valuetext={focusLabel}
          />
          <div className="focus-ends">
            <span>Light runs · bank Compute</span>
            <span>All-in · max Data &amp; $</span>
          </div>
        </div>
      )}

      {hint && <p className="coach">{hint}</p>}
    </div>
  );
}
