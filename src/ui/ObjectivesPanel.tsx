import type { GameState } from "../engine/types";
import { objectiveBoard, objectiveRewardLabel, claimableObjectives } from "../engine/objectives";
import { objectives as O } from "../engine/balance/objectives";
import { fmt } from "./format";
import { Big } from "../engine/math/Big";

interface Props {
  game: GameState;
  onClaim: (id: string, at?: { x: number; y: number }) => void;
}

/**
 * Lab Objectives — an early/mid "lots to do" board: three rotating quick goals, each with a
 * live progress bar and a reward that lands on Claim (a temp boost, or a resource windfall).
 * Clearing one rotates the next pool entry in, so there's always a next payoff. Hidden once
 * the ladder is cleared (it's an onboarding-grind feature).
 */
export function ObjectivesPanel({ game, onClaim }: Props) {
  const board = objectiveBoard(game);
  if (board.length === 0) return null;
  const ready = claimableObjectives(game);
  const doneCount = game.objectives.completed.filter((id) => O.pool.some((o) => o.id === id)).length;

  return (
    <section className="panel objectives">
      <div className="objectives-head">
        <h2 className="panel-title" style={{ margin: 0 }}>Objectives</h2>
        {ready > 0 ? (
          <span className="objectives-badge">{ready} to claim</span>
        ) : (
          <span className="objectives-count">{doneCount}/{O.pool.length}</span>
        )}
      </div>
      <div className="list">
        {board.map(({ def, value, progress, ready: isReady }) => (
          <div key={def.id} className={`objective-card ${isReady ? "ready" : ""}`}>
            <div className="objective-main">
              <span className="objective-desc">{def.desc}</span>
              <div className="objective-bar">
                <div className="objective-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="objective-prog">
                {fmt(Big.of(Math.floor(value)))} / {fmt(Big.of(def.target))}
                <span className="objective-reward">🎁 {objectiveRewardLabel(def.reward)}</span>
              </span>
            </div>
            <button
              className="objective-claim"
              disabled={!isReady}
              onClick={(e) => onClaim(def.id, { x: e.clientX, y: e.clientY })}
            >
              {isReady ? "Claim" : `${Math.round(progress * 100)}%`}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
