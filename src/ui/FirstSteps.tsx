import type { GameState } from "../engine/types";
import { totalRacks } from "../engine/hall";

interface Props {
  game: GameState;
}

/**
 * Interactive onboarding (IMPROVEMENTS #11) — a live three-step checklist that
 * replaces reading with DOING: each step ticks off a real game fact, the next
 * one lights up, and the whole strip retires itself when the loop is learned.
 * Derived entirely from state (no flags to persist, nothing to get stale):
 * a returning half-way player resumes exactly where the facts say they are.
 */
export function firstStepsDone(game: GameState): boolean {
  return firstSteps(game).every((s) => s.done);
}

export function firstStepsVisible(game: GameState): boolean {
  // Gen-1 only, and gone the moment the loop is closed — veterans never see it.
  return game.prestige.ships === 0 && !firstStepsDone(game);
}

interface Step {
  label: string;
  detail: string;
  done: boolean;
}

function firstSteps(game: GameState): Step[] {
  const claimed = game.lifetimeMoney.gt(0);
  const started = claimed || game.run.active || game.run.readyToClaim;
  // ANY rack, not just a Consumer one: on a full floor a better tier upgrades in
  // place by evicting the lowest, so a first-generation lab that keeps upgrading
  // ends with zero Consumer racks. Keyed to rack_basic, the checklist came back
  // asking for a rack the full floor could not take — and, since it owns the
  // notice slot while up, hid the advisor chip and the daily boost with it.
  // Eviction never lowers the total, so this step never un-ticks.
  const racked = totalRacks(game) > 0;
  return [
    { label: "Start a training run", detail: "Spend Compute on a run in the dock", done: started },
    { label: "Claim your payout", detail: "The bar fills — collect Data + Money", done: claimed },
    { label: "Buy a Consumer GPU Rack", detail: "More Compute/sec = bigger runs", done: racked },
  ];
}

export function FirstSteps({ game }: Props) {
  const steps = firstSteps(game);
  const activeIdx = steps.findIndex((s) => !s.done);
  return (
    <div className="firststeps" role="list" aria-label="First steps">
      <div className="firststeps-title">FIRST STEPS</div>
      {steps.map((s, i) => (
        <div key={s.label} role="listitem" className={`firststeps-row ${s.done ? "done" : i === activeIdx ? "now" : ""}`}>
          <span className="firststeps-mark" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
          <span className="firststeps-label">{s.label}</span>
          {!s.done && i === activeIdx && <span className="firststeps-detail">{s.detail}</span>}
        </div>
      ))}
    </div>
  );
}
