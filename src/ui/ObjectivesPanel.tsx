import type { GameState } from "../engine/types";
import { objectiveBoard, claimableObjectives } from "../engine/objectives";
import { objectives as O, objectiveRewardOptions, objectiveRewardStrength, laneLabel } from "../engine/balance/objectives";
import { fmt } from "./format";
import { Big } from "../engine/math/Big";

type Lane = "computeMult" | "dataMult" | "moneyMult";
const LANE_COLOR: Record<Lane, string> = { computeMult: "var(--compute)", dataMult: "var(--data)", moneyMult: "var(--money)" };

interface Props {
  game: GameState;
  onClaim: (id: string, target?: Lane, at?: { x: number; y: number }) => void;
}

/**
 * Lab Objectives — an early/mid "lots to do" board: three rotating quick goals, each with a
 * live progress bar. A met objective is claimed by picking WHICH lane its boost lands on
 * (Compute / Data / Revenue) — a small "where do I need this now?" decision rather than an
 * auto-resolve. Both lanes share the same strength, so the pick is placement only. Hidden
 * once the ladder is cleared (it's an onboarding-grind feature).
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
                <span className="objective-reward">🎁 {objectiveRewardStrength(def.reward)}{isReady ? " — pick a lane" : ""}</span>
              </span>
            </div>
            {isReady ? (
              <div className="objective-choice" role="group" aria-label={`Claim reward — pick a lane`}>
                {objectiveRewardOptions(def.reward).map((o) => (
                  <button
                    key={o.target}
                    className="objective-lane"
                    style={{ ["--lane" as string]: LANE_COLOR[o.target as Lane] }}
                    onClick={(e) => onClaim(def.id, o.target as Lane, { x: e.clientX, y: e.clientY })}
                  >
                    {laneLabel(o.target)}
                  </button>
                ))}
              </div>
            ) : (
              <button className="objective-claim" disabled>{Math.round(progress * 100)}%</button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
