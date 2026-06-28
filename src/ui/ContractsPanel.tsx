import { contractBoard, contractsBalance } from "../engine/contracts";
import { fmt } from "./format";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

interface Props {
  game: GameState;
  onClaim: (id: string, rep: number) => void;
}

/**
 * Contracts board (Phase 4) — directed objectives with Reputation rewards. The
 * board is the first few uncompleted goals from the pool (a guided ladder); a
 * contract shows a live progress bar and a Claim button once met. Reputation is
 * a meta-currency, so this never injects in-run cash (curve stays intact).
 */
export function ContractsPanel({ game, onClaim }: Props) {
  const board = contractBoard(game);
  const allDone = board.length === 0;

  return (
    <section className="panel contracts">
      <h2 className="panel-title">Contracts</h2>
      {allDone ? (
        <p className="contracts-empty">All contracts cleared. The board's empty — for now. 📈</p>
      ) : (
        <div className="list">
          {board.map(({ def, value, progress, ready }) => (
            <div key={def.id} className={`contract-card ${ready ? "ready" : ""}`}>
              <div className="contract-main">
                <span className="contract-title">{def.title}</span>
                <span className="contract-desc">{def.desc}</span>
                <div className="contract-bar">
                  <div className="contract-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <span className="contract-prog">{fmt(Big.of(Math.floor(value)))} / {fmt(Big.of(def.target))}</span>
              </div>
              <div className="contract-side">
                <span className="contract-rep">+{def.rep} Rep</span>
                <button
                  className="contract-claim"
                  disabled={!ready}
                  onClick={() => onClaim(def.id, def.rep)}
                >
                  {ready ? "Claim" : "In progress"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="contracts-foot">
        {game.contracts.completed.length} / {contractsBalance.pool.length} contracts complete · rewards <b>Lab Reputation</b>
      </p>
    </section>
  );
}
