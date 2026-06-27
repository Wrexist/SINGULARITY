import { useEffect } from "react";
import { Portal } from "./Portal";
import type { GameState } from "../engine/types";
import { reputationBalance, reputationAvailable, earnedReputation, canBuyReputationPerk } from "../engine/reputation";
import { LandmarkIcon } from "./Icons";

/** Phase 3 — the Lab Reputation perk tree: spend meta-currency earned from
 *  achievements + ascensions on permanent, run-spanning boosts. Honest goals,
 *  legible effects; survives every reset. */
export function ReputationModal({ game, onBuy, onClose }: {
  game: GameState;
  onBuy: (id: string) => void;
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
                onClick={() => onBuy(perk.id)}
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
      </div>
    </div>
    </Portal>
  );
}
