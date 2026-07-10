import { useEffect } from "react";
import { Portal } from "./Portal";
import { burst, punch } from "./fx";
import type { GameState } from "../engine/types";
import {
  reputationBalance, reputationAvailable, earnedReputation, canBuyReputationPerk,
  endowmentUnlocked, endowmentCost, canBuyEndowment, endowmentMult,
} from "../engine/reputation";
import { LandmarkIcon } from "./Icons";

/** Phase 3 — the Lab Reputation perk tree: spend meta-currency earned from
 *  achievements + ascensions on permanent, run-spanning boosts. Honest goals,
 *  legible effects; survives every reset. Once the whole tree is owned, the
 *  endgame Endowment (below) is the infinite home for surplus Reputation. */
export function ReputationModal({ game, onBuy, onBuyEndowment, onClose }: {
  game: GameState;
  onBuy: (id: string) => void;
  onBuyEndowment: () => void;
  onClose: () => void;
}) {
  const available = reputationAvailable(game);
  const earned = earnedReputation(game);
  const owned = new Set(game.reputation.perks);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rep-modal" role="dialog" aria-modal="true" aria-label="Lab Reputation" onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <div>
            <h2 className="ach-title"><LandmarkIcon size={20} /> Lab Reputation</h2>
            <div className="ach-count"><b className="rep-pts">{available}</b> available · {earned} earned all-time</div>
          </div>
          <button className="link-btn" onClick={onClose}>close</button>
        </div>

        <p className="pd-pane-tip">Reputation comes from achievements and AGI ascensions. Perks are permanent and survive every reset — including ascension.</p>

        <div className="list rep-list">
          {reputationBalance.perks.map((perk) => {
            const got = owned.has(perk.id);
            const afford = canBuyReputationPerk(game, perk.id);
            const lockedByReq = perk.requires && !owned.has(perk.requires);
            const reqName = perk.requires ? reputationBalance.perks.find((p) => p.id === perk.requires)?.name : null;
            return (
              <button
                key={perk.id}
                className={`card rep-card ${got ? "owned" : afford ? "affordable" : ""}`}
                disabled={got || !afford}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  burst(r.right - 24, r.top + r.height / 2, { count: 16, power: 1, colors: ["#7c5cff", "#ffd60a", "#16b364"] });
                  punch(e.currentTarget);
                  onBuy(perk.id);
                }}
              >
                <div className="card-main">
                  <span className="card-name">{got ? "✓ " : ""}{perk.name}</span>
                  <span className="card-desc">{perk.desc}</span>
                  {lockedByReq && <span className="card-note rep-req">Requires: {reqName}</span>}
                </div>
                <div className="card-cost">
                  <span className="rep-cost">{got ? "owned" : `${perk.cost} pts`}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Endgame Endowment — appears only once every finite perk is owned, so
            surplus Reputation (and the daily sponsor's payout) always has a home. */}
        {endowmentUnlocked(game) && (
          <div className="rep-endowment">
            <div className="rep-endow-head">
              <span className="card-name">✦ Singularity Endowment</span>
              <span className="rep-endow-lvl">Level {game.repEndowment} · +{Math.round((endowmentMult(game) - 1) * 100)}% all production</span>
            </div>
            <button
              className={`card rep-card ${canBuyEndowment(game) ? "affordable" : ""}`}
              disabled={!canBuyEndowment(game)}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                burst(r.right - 24, r.top + r.height / 2, { count: 22, power: 1.3, colors: ["#a855f7", "#ffd60a", "#16b364"] });
                punch(e.currentTarget);
                onBuyEndowment();
              }}
            >
              <div className="card-main">
                <span className="card-name">Endow the next level</span>
                <span className="card-desc">+{Math.round(reputationBalance.endowment.perLevel * 100)}% to all production, permanently. The tree is finished — this is where legend compounds now.</span>
              </div>
              <div className="card-cost"><span className="rep-cost">{endowmentCost(game).toLocaleString()} pts</span></div>
            </button>
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}
