import type { GameState } from "../engine/types";
import { visibleChallenges, challengeView, canFundChallenge } from "../engine/challenges";
import { challenges as C } from "../engine/balance/challenges";
import { fmt } from "./format";
import { ComputeIcon, DataIcon, MoneyIcon, GiftIcon } from "./Icons";
import { iconFor } from "./iconRegistry";

interface Props {
  game: GameState;
  onFund: (id: string, at?: { x: number; y: number }) => void;
}

const RES_ICON = { compute: <ComputeIcon size={12} />, data: <DataIcon size={12} />, money: <MoneyIcon size={12} /> };

/**
 * Grand Challenges — late-game moonshots you fund over long horizons for a permanent
 * reward. Each card is a filling progress bar + three resource pledges + one Fund button;
 * completing one fires the tentpole "Challenge complete" moment (handled in App). Purely a
 * grind target: the whole board is hidden until the deep endgame, and the sim never funds.
 */
export function GrandChallengesPanel({ game, onFund }: Props) {
  const list = visibleChallenges(game);
  if (list.length === 0) return null;
  const doneCount = game.challenges.completed.length;

  return (
    <section className="panel challenges">
      <div className="challenges-head">
        <h2 className="panel-title" style={{ margin: 0 }}>Grand Challenges</h2>
        <span className="challenges-count">{doneCount}/{C.list.length}</span>
      </div>
      <p className="challenges-intro">Moonshots that reshape the lab forever. Pour your output in — the reward is permanent.</p>
      <div className="list">
        {list.map((def) => {
          const v = challengeView(game, def.id)!;
          const canFund = canFundChallenge(game, def.id);
          const pct = Math.round(v.progress * 100);
          const res = [
            { key: "compute" as const, funded: v.funded.compute, cost: v.cost.compute, done: v.done.compute },
            { key: "data" as const, funded: v.funded.data, cost: v.cost.data, done: v.done.data },
            { key: "money" as const, funded: v.funded.money, cost: v.cost.money, done: v.done.money },
          ];
          return (
            <div key={def.id} className={`challenge-card ${v.complete ? "complete" : ""}`}>
              <div className="challenge-top">
                <span className="challenge-icon" aria-hidden="true">{iconFor(def.icon, 22)}</span>
                <div className="challenge-titles">
                  <span className="challenge-name">{def.name}</span>
                  <span className="challenge-blurb">{def.blurb}</span>
                </div>
              </div>

              <div className="challenge-bar">
                <div className="challenge-fill" style={{ width: `${v.complete ? 100 : pct}%` }} />
                <span className="challenge-bar-label">{v.complete ? "Complete ✓" : `${pct}%`}</span>
              </div>

              <div className="challenge-res">
                {res.map((r) => (
                  <span key={r.key} className={`challenge-pledge ${r.done ? "done" : ""}`}>
                    <span className="challenge-pledge-ic">{RES_ICON[r.key]}</span>
                    {r.key === "money" ? "$" : ""}{fmt(r.funded)}<span className="challenge-pledge-sep">/</span>{r.key === "money" ? "$" : ""}{fmt(r.cost)}
                    {r.done && <span className="challenge-pledge-check">✓</span>}
                  </span>
                ))}
              </div>

              <div className="challenge-foot">
                <span className="challenge-reward"><GiftIcon size={13} /> {def.reward.desc}</span>
                {v.complete ? (
                  <span className="challenge-active">Active</span>
                ) : (
                  <button
                    className="btn challenge-fund"
                    disabled={!canFund}
                    onClick={(e) => onFund(def.id, { x: e.clientX, y: e.clientY })}
                  >
                    {canFund ? "Fund" : "Need output"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
