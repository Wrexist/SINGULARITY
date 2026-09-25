import type { Derived, GameState } from "../engine/types";
import { fmt, fmtMoney } from "./format";
import { trainingIntensity, runYieldAt, computeBankCeiling } from "../engine/derive";
import { useEffect, useRef } from "react";
import { burst, floatText } from "./fx";
import { RepeatIcon } from "./Icons";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { useGame } from "../state/store";

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

  // The automation hand-off. After dozens of hand claims, the moment runs start
  // claiming themselves is the idle genre's first big payoff, and it used to pass
  // as a plain purchase. Mark it once, in place: a burst from the bar that will
  // now finish on its own. Only on the live transition (never on load), and fx
  // self-suppress under reduced motion.
  const dockRef = useRef<HTMLDivElement>(null);
  const hadAutoClaim = useRef(derived.autoClaim);
  // The dock first renders with the placeholder fresh state; the save loads a tick
  // later, in the same update that sets `initialized`. Only a flip seen on an
  // ALREADY-initialized render is a purchase; the load itself must stay silent.
  const initialized = useGame((s) => s.initialized);
  const wasInit = useRef(initialized);
  useEffect(() => {
    if (derived.autoClaim && !hadAutoClaim.current && wasInit.current && dockRef.current) {
      const r = dockRef.current.querySelector(".progress")?.getBoundingClientRect();
      if (r) burst(r.left + r.width / 2, r.top + r.height / 2, { count: 26, power: 1.3, colors: ["#2f7bf6", "#9b51e0", "#16b364"] });
      haptics.success(); sound.success();
    }
    hadAutoClaim.current = derived.autoClaim;
    wasInit.current = initialized;
  }, [derived.autoClaim, initialized]);
  const pct = Math.min(100, run.progress * 100);

  // Training intensity: scales the RUN SIZE (a light run sips Compute and pays
  // proportionally less — owner fix: at scale, full runs swallowed the whole
  // bank) AND how much auto-train reserves before firing. Only shown once
  // auto-train exists (before that the player paces runs by hand).
  const focus = game.computeFocus;
  const runSizePct = Math.round(trainingIntensity(focus) * 100);
  // "banks up to" only while a ceiling really binds: once runs last longer than their
  // Compute takes to produce, the bank climbs past it on its own (see derive.ts).
  const ceiling = computeBankCeiling(game, derived);
  const focusLabel =
    focus === 0
      ? `Holding — light ${runSizePct}% runs, Compute banks freely`
      : `${Math.round(focus * 100)}% · ${runSizePct}%-size runs${ceiling ? ` · banks up to ${fmt(ceiling)}` : ""}`;

  // Coach the very first run, then get out of the way (clean-to-play).
  const firstRun = game.lifetimeMoney.eq(0) && game.prestige.ships === 0;
  // The mandatory ~4s cold-start before the first run can afford to fire used to read
  // a static "Idle" — dead time. Instead charge the bar toward affordability so the wait
  // FEELS like the meter filling. First-run only; later idles can afford instantly.
  const charging = firstRun && !run.active && !run.readyToClaim && !canStart;
  const chargeFrac = charging && derived.runComputeCost.gt(0)
    ? Math.min(1, Math.max(0, game.resources.compute.div(derived.runComputeCost).toNumber()))
    : 0;
  const fillPct = run.readyToClaim ? 100 : run.active ? pct : charging ? chargeFrac * 100 : 0;
  const barText = run.readyToClaim ? "Complete" : run.active ? `${pct.toFixed(0)}%` : charging ? "Charging…" : "Idle";
  // Screen-reader cue for the loop's payoff. The text only changes when a run
  // completes, so the polite live region speaks once per run and stays quiet
  // through the 10Hz re-renders; auto-claim takes the payout itself, so it's silent.
  const announce = run.readyToClaim && !derived.autoClaim ? "Run complete — claim your payout" : "";
  let hint: string | null = null;
  if (firstRun) {
    if (run.readyToClaim) hint = "Done! Claim your first Data + Money.";
    else if (run.active) hint = "Training… payouts land when the bar fills.";
    else if (canStart) hint = "Ready — start your first training run.";
    else hint = "Your server closet is making Compute. Start a run when you can afford it.";
  }

  return (
    <div className="dock" ref={dockRef}>
      <div className="dock-head">
        <span className="dock-title">Training Run</span>
        <span className="dock-sub">
          cost {fmt(derived.runComputeCost)} compute → {fmt(derived.runDataYield)} data · {fmtMoney(derived.runMoneyYield)}
        </span>
      </div>

      <div
        className={`progress ${run.readyToClaim ? "ready" : run.active ? "active" : charging ? "charging" : ""}`}
        role="progressbar"
        aria-label={derived.autoClaim ? "Training run, claims automatically" : "Training run"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fillPct)}
        aria-valuetext={barText}
      >
        <div className="progress-fill" style={{ width: `${fillPct}%` }} />
        <span className={`progress-label${fillPct < 50 ? " on-track" : ""}`}>
          {barText}
        </span>
        {/* Wordless: this bar pays out by itself now. */}
        {derived.autoClaim && <span className="progress-auto" role="img" aria-label="Claims automatically"><RepeatIcon size={13} /></span>}
      </div>

      {run.readyToClaim ? (
        <button
          className="btn btn-claim"
          onClick={(e) => {
            // Juice the most-repeated action: a payout burst + rising "+Data / +$"
            // floaters right at the button.
            const r = e.currentTarget.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            // What this claim actually pays: the run is priced at the intensity it
            // started at, which the slider may have moved away from since.
            const paid = runYieldAt(game, derived, run.focus);
            burst(cx, r.top + r.height / 2, { count: 18, power: 1.1, colors: ["#2f7bf6", "#16b364", "#ff9f0a"] });
            floatText(cx - 34, r.top, `+${fmt(paid.data)}`, "#9b51e0", 17);
            floatText(cx + 34, r.top - 4, `+${fmtMoney(paid.money)}`, "#16b364", 17);
            onClaim();
          }}
        >
          Claim payout
        </button>
      ) : (
        // aria-disabled, not disabled: a real `disabled` drops focus to <body> the
        // moment a run starts, stranding keyboard / Switch Control / VoiceOver users.
        // Same look via the [aria-disabled] rule in styles.css; the guard keeps it inert.
        <button
          className={`btn btn-primary ${canStart && firstRun ? "nudge" : ""}`}
          aria-disabled={!canStart}
          onClick={() => { if (canStart) onStart(); }}
        >
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
      <span className="sr-only" aria-live="polite">{announce}</span>
    </div>
  );
}
