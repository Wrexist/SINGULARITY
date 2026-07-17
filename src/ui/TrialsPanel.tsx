import type { GameState } from "../engine/types";
import { trialsBalance, canStartTrial, trialConditionMet } from "../engine/trials";
import { canPrestige } from "../engine/prestige";

interface Props {
  game: GameState;
  onStart: (id: string) => void;
  onAbandon: () => void;
}

const LANE_LABEL: Record<string, string> = { compute: "Compute", data: "Data", money: "Money" };

/**
 * Prestige Trials — opt-in "constrained training runs". You commit to a Trial early
 * in a generation (before you can ship), endure its handicap for the whole run, and
 * complete it by shipping — banking a small PERMANENT reward. Makes a generation feel
 * different, not just faster. Curve-safe: the sim never opts in (see engine/trials.ts).
 */
/** Rendered inside a Collapsible (which supplies the panel section + title), so this
 *  returns just the body. */
export function TrialsPanel({ game, onStart, onAbandon }: Props) {
  const active = game.activeTrial ? trialsBalance.list.find((t) => t.id === game.activeTrial) : null;
  const done = new Set(game.trialsDone);
  const shippable = canPrestige(game);

  return (
    <>
      {/* First-run scaffolding — hide once the player has completed a Trial. */}
      {game.trialsDone.length === 0 && (
        <p className="trials-note">
          Constrained runs — commit before you can ship, endure the handicap, then bank a permanent edge.
        </p>
      )}

      {active && (() => {
        const condMet = trialConditionMet(game);
        return (
          <div className="trial-card trial-on">
            <div className="trial-main">
              <span className="trial-name">{active.name} — running</span>
              <span className="trial-desc">{active.desc}</span>
              {active.condition === "solo" && (
                <span className="trial-status" style={condMet ? undefined : { color: "var(--ink-3)" }}>
                  Condition: no staff on the roster — {condMet ? "met ✓" : "not met (fire your team to qualify)"}
                </span>
              )}
              <span className="trial-status">
                Ship the Model {active.condition && !condMet ? "with the condition met " : ""}to bank +{Math.round(active.reward.value * 100)}% {LANE_LABEL[active.reward.lane]}.
              </span>
            </div>
            <button className="trial-abandon" onClick={onAbandon}>Abandon</button>
          </div>
        );
      })()}

      <div className="list">
        {trialsBalance.list.map((t) => {
          if (game.activeTrial === t.id) return null; // shown above
          const isDone = done.has(t.id);
          const locked = game.prestige.ships < t.unlockShips;
          const canStart = canStartTrial(game, t.id);
          return (
            <div key={t.id} className={`trial-card ${isDone ? "trial-done" : ""}`}>
              <div className="trial-main">
                <span className="trial-name">{t.name}{isDone ? " ✓" : ""}</span>
                <span className="trial-desc">{t.desc}</span>
                {locked && <span className="trial-req">Unlocks at {t.unlockShips} ships</span>}
                {!locked && !isDone && !canStart && !game.activeTrial && shippable && (
                  <span className="trial-req">Start on a fresh run — before you can ship.</span>
                )}
                {!locked && !isDone && !canStart && game.activeTrial && (
                  <span className="trial-req">Finish your active Trial first.</span>
                )}
              </div>
              {isDone ? (
                <span className="trial-owned">banked</span>
              ) : (
                <button className="trial-attempt" disabled={!canStart} onClick={() => onStart(t.id)}>Attempt</button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Trials completed / total — for the Collapsible badge. */
export function trialsDoneCount(game: GameState): number {
  return trialsBalance.list.filter((t) => game.trialsDone.includes(t.id)).length;
}
export const trialsTotal = trialsBalance.list.length;
