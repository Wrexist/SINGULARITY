import { useMemo } from "react";
import { useGame } from "../state/store";
import { derive } from "../engine/derive";
import { currentEra, eraName } from "../engine/eras";
import { barRates, fmt, fmtRate } from "./format";
import { ComputeIcon, DataIcon, MoneyIcon } from "./Icons";
import { haptics } from "./haptics";
import { sound } from "./sound";

/**
 * The explore-mode HUD for the 3D lab (WORLD_3D_PLAN.md) — the "glass cards over a
 * live world" pattern from the references (WareTrack, Acme). Two pieces only, so the
 * world stays the hero:
 *  - ExploreHud: one glass strip, top-left — where you are and what the lab makes.
 *  - TrainingCallout: pinned in the world above the racks (the stage positions it),
 *    a progress ring + a three-step stepper + the one action that matters right now.
 * Both read the store at its tick rate and only exist while explore mode is open.
 */

export function ExploreHud({ wing }: { wing: number }) {
  const game = useGame((s) => s.game);
  const d = useMemo(() => derive(game), [game]);
  const rates = barRates(game, d);
  return (
    <div className="hall3d-hud" aria-hidden="true">
      <div className="hall3d-hud-title">
        <span>{eraName(currentEra(game))}</span>
        <span className="hall3d-hud-sub">{wing < 26 ? `Wing ${String.fromCharCode(65 + wing)}` : `Wing ${wing + 1}`}</span>
      </div>
      <div className="hall3d-hud-rates">
        <span style={{ color: "var(--compute)" }}><ComputeIcon size={13} />{fmtRate(d.computePerSec)}</span>
        <span style={{ color: "var(--data)" }}><DataIcon size={13} />{fmtRate(rates.data)}</span>
        <span style={{ color: "var(--money)" }}><MoneyIcon size={13} />${fmtRate(rates.money)}</span>
      </div>
    </div>
  );
}

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

export function TrainingCallout() {
  const game = useGame((s) => s.game);
  const start = useGame((s) => s.doStartRun);
  const claim = useGame((s) => s.doClaim);
  const d = useMemo(() => derive(game), [game]);
  const { run } = game;
  const canStart = !run.active && !run.readyToClaim && game.resources.compute.gte(d.runComputeCost);
  const pct = run.readyToClaim ? 100 : run.active ? Math.min(100, Math.round(run.progress * 100)) : 0;
  const step = run.readyToClaim ? 2 : run.active ? 1 : 0;
  const status = run.readyToClaim ? "Ready to claim" : run.active ? "Training" : d.autoTrain ? "Auto-train" : canStart ? "Ready to start" : "Charging";
  return (
    <div className={`hall3d-callout${run.readyToClaim ? " ready" : ""}`}>
      <div className="hall3d-callout-head">
        <svg className="hall3d-ring" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r={RING_R} className="hall3d-ring-track" />
          <circle cx="20" cy="20" r={RING_R} className="hall3d-ring-fill" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - pct / 100)} />
          <text x="20" y="21" textAnchor="middle" dominantBaseline="middle">{pct}%</text>
        </svg>
        <div className="hall3d-callout-text">
          <b>Training run</b>
          <span>{status} · {fmt(d.runDataYield)} data</span>
        </div>
      </div>
      <ol className="hall3d-steps" aria-hidden="true">
        {["Start", "Train", "Claim"].map((label, i) => (
          <li key={label} className={i < step ? "done" : i === step ? "now" : ""}>
            <i />
            {label}
          </li>
        ))}
      </ol>
      {run.readyToClaim ? (
        <button className="hall3d-cta" onClick={() => { haptics.success(); sound.success(); claim(); }}>Claim payout</button>
      ) : !run.active ? (
        <button className="hall3d-cta" aria-disabled={!canStart} onClick={() => { if (canStart) { haptics.tap(); sound.tap(); start(); } }}>
          Start run
        </button>
      ) : null}
    </div>
  );
}
