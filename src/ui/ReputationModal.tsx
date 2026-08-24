import { useEffect } from "react";
import { Portal } from "./Portal";
import { burst, punch } from "./fx";
import type { GameState } from "../engine/types";
import {
  reputationBalance, reputationAvailable, earnedReputation, canBuyReputationPerk,
  endowmentUnlocked, endowmentCost, canBuyEndowment, endowmentMult,
  directivePicksAvailable, endowmentDirectiveMods, canRespecDirective, directiveRespecCost,
} from "../engine/reputation";
import { LandmarkIcon } from "./Icons";

/** Phase 3 — the Lab Reputation perk tree: spend meta-currency earned from
 *  achievements + ascensions on permanent, run-spanning boosts. Honest goals,
 *  legible effects; survives every reset. Once the whole tree is owned, the
 *  endgame Endowment (below) is the infinite home for surplus Reputation. */
export function ReputationModal({ game, onBuy, onBuyEndowment, onPickDirective, onRespecDirective, onClose }: {
  game: GameState;
  onBuy: (id: string) => void;
  onBuyEndowment: () => void;
  onPickDirective: (id: string) => void;
  /** Depth batch: refund one claimed directive (the pick is re-choosable) for an
   *  escalating Reputation fee. */
  onRespecDirective?: (id: string) => void;
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
            // Progress toward affording, the same question the Build and Research
            // cards answer with a filling ring. Only on a row that is merely
            // unaffordable — an actionable one already reads as actionable, and a
            // prerequisite-gated one has nothing to fill toward.
            const pct = !got && !afford && !lockedByReq && perk.cost > 0
              ? Math.max(0, Math.min(1, available / perk.cost))
              : 0;
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
                {pct > 0 && <span className="meta-progress" style={{ width: `${pct * 100}%` }} aria-hidden="true" />}
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
            {/* Endowment Directives — a build decision earned every few levels, so the
                infinite sink is a choice (lean a lane) and not just a rising number.
                Owned doctrines fold into the lane summary; an unclaimed pick shows the
                three options. Only ever visible in the deep endgame. */}
            {(() => {
              const dir = endowmentDirectiveMods(game);
              const owned: string[] = [];
              if (dir.computeMult > 1) owned.push(`Compute +${Math.round((dir.computeMult - 1) * 100)}%`);
              if (dir.dataMult > 1) owned.push(`Data +${Math.round((dir.dataMult - 1) * 100)}%`);
              if (dir.moneyMult > 1) owned.push(`Revenue +${Math.round((dir.moneyMult - 1) * 100)}%`);
              const picks = directivePicksAvailable(game);
              // Respec: distinct owned doctrines get a refund affordance (the freed
              // pick is re-choosable above). Fee escalates per respec — a rebuild,
              // not a re-roll. Hidden until the player actually owns directives.
              const ownedIds = [...new Set(game.endowmentDirectives)];
              const respecOpen = onRespecDirective && canRespecDirective(game);
              return (
                <div className="rep-directives">
                  {owned.length > 0 && (
                    <div className="rep-directive-summary">Directives — {owned.join(" · ")}</div>
                  )}
                  {respecOpen && (
                    <div className="rep-directive-respec">
                      <span>Change of doctrine? Refund one (fee escalates):</span>
                      {ownedIds.map((id) => {
                        const def = reputationBalance.endowment.directives.defs.find((d) => d.id === id);
                        if (!def) return null;
                        return (
                          <button key={id} className="link-btn respec-btn" onClick={() => onRespecDirective!(id)}>
                            {def.name} ({directiveRespecCost(game)} pts)
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {picks > 0 && (
                    <>
                      <div className="rep-directive-prompt">
                        Choose a Directive{picks > 1 ? ` (${picks} to assign)` : ""} — a permanent doctrine:
                      </div>
                      <div className="rep-directive-choices">
                        {reputationBalance.endowment.directives.defs.map((d) => (
                          <button
                            key={d.id}
                            className="card rep-card affordable rep-directive-choice"
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              burst(r.right - 24, r.top + r.height / 2, { count: 18, power: 1.2, colors: ["#a855f7", "#ffd60a", "#16b364"] });
                              punch(e.currentTarget);
                              onPickDirective(d.id);
                            }}
                          >
                            <div className="card-main">
                              <span className="card-name">{d.name}</span>
                              <span className="card-desc">{d.desc}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}
