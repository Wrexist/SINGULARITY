import { contractBoard, contractsBalance, sponsorView } from "../engine/contracts";
import { fmt } from "./format";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

interface Props {
  game: GameState;
  onClaim: (id: string, rep: number, title: string) => void;
  /** IDEAS #9 — claim today's sponsor objective (post-ladder daily). */
  onClaimSponsor: () => void;
}

/**
 * Contracts board (Phase 4) — directed objectives with Reputation rewards. The
 * board is the first few uncompleted goals from the pool (a guided ladder); a
 * contract shows a live progress bar and a Claim button once met. Reputation is
 * a meta-currency, so this never injects in-run cash (curve stays intact).
 */
export function ContractsPanel({ game, onClaim, onClaimSponsor }: Props) {
  const board = contractBoard(game);
  const allDone = board.length === 0;
  // Post-ladder: one date-seeded sponsor objective per local day (IDEAS #9).
  const sponsor = allDone ? sponsorView(game) : null;

  return (
    <section className="panel contracts">
      <h2 className="panel-title">Contracts</h2>
      {allDone ? (
        sponsor ? (
          <div className="list">
            <div className={`contract-card ${sponsor.ready ? "ready" : ""}`}>
              <div className="contract-main">
                <span className="contract-title">{sponsor.def.title}</span>
                <span className="contract-desc">{sponsor.def.desc}</span>
                <div className="contract-bar">
                  <div className="contract-fill" style={{ width: `${Math.round(sponsor.progress * 100)}%` }} />
                </div>
                <span className="contract-prog">{fmt(Big.of(Math.floor(sponsor.value)))} / {fmt(Big.of(sponsor.def.target))}</span>
              </div>
              <div className="contract-side">
                <span className="contract-rep">+{sponsor.def.rep} Rep</span>
                <button className="contract-claim" disabled={!sponsor.ready} onClick={onClaimSponsor}>
                  {sponsor.claimed ? "Done today" : sponsor.ready ? "Claim" : "In progress"}
                </button>
              </div>
            </div>
            <p className="contracts-empty">Daily sponsor objective — a new one calls tomorrow.</p>
          </div>
        ) : (
          <p className="contracts-empty">All contracts cleared. Sponsors are circling — check back tomorrow. 📈</p>
        )
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
                  onClick={() => onClaim(def.id, def.rep, def.title)}
                >
                  {ready ? "Claim" : "In progress"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="contracts-foot">
        {/* Ladder progress only — sponsor completions (sponsor_*) are the daily
            post-ladder track and would overflow the pool denominator. */}
        {game.contracts.completed.filter((id) => !id.startsWith("sponsor_")).length} / {contractsBalance.pool.length} contracts complete
        {game.contracts.completed.some((id) => id.startsWith("sponsor_")) &&
          ` · ${game.contracts.completed.filter((id) => id.startsWith("sponsor_")).length} sponsor deals`}
        {" "}· rewards <b>Lab Reputation</b>
      </p>
    </section>
  );
}
