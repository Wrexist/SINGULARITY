import type { GameState } from "../engine/types";
import {
  instituteBalance, grantsAvailable, canBuyInstitute,
  fellowshipsUnlocked, fellowshipCost, canEndowFellowship, fellowName, fellowshipMult,
} from "../engine/institute";

interface Props {
  game: GameState;
  onBuy: (id: string) => void;
  onEndowFellowship: () => void;
}

const nameOf = (id?: string) => instituteBalance.perks.find((p) => p.id === id)?.name ?? "a prerequisite";

/**
 * The Institute — the third meta-layer, above ascension. Founded and expanded with
 * Grants (one per AGI ascension), a fresh tree of powerful permanent wings. Rendered
 * inside a Collapsible so it never adds to the HQ wall until a deep player opens it.
 */
export function InstitutePanel({ game, onBuy, onEndowFellowship }: Props) {
  const owned = new Set(game.institute);
  const grants = grantsAvailable(game);
  const doneCount = instituteBalance.perks.filter((p) => owned.has(p.id)).length;

  return (
    <>
      <p className="institute-note">
        Ascensions mint <b>Grants</b> — you have <b>{grants}</b>. Found the Institute's wings: powerful, permanent, no reset.
      </p>
      <div className="list">
        {instituteBalance.perks.map((p) => {
          const isOwned = owned.has(p.id);
          const can = canBuyInstitute(game, p.id);
          const lockedByReq = !!p.requires && !owned.has(p.requires);
          return (
            <button key={p.id} className={`institute-wing ${isOwned ? "owned" : ""}`} disabled={isOwned || !can} onClick={() => onBuy(p.id)}>
              <div className="institute-main">
                <span className="institute-name">{p.name}{isOwned ? " ✓" : ""}</span>
                <span className="institute-desc">{p.desc}</span>
                {!isOwned && lockedByReq && <span className="institute-req">needs {nameOf(p.requires)}</span>}
              </div>
              <span className="institute-cost">{isOwned ? "founded" : `${p.cost} ${p.cost === 1 ? "grant" : "grants"}`}</span>
            </button>
          );
        })}
      </div>
      <div className="institute-count">{doneCount}/{instituteBalance.perks.length} wings founded</div>

      {/* Fellowships — the Institute's infinite tail. Only appears once every wing is
          founded, so it never adds noise to a player still working through the tree.
          Before this, the deepest layer in the game simply ran out of things to buy. */}
      {fellowshipsUnlocked(game) && (
        <div className="institute-fellows">
          <div className="institute-fellows-head">
            <span className="institute-fellows-title">Fellowships</span>
            <span className="institute-fellows-mult">×{fellowshipMult(game).toFixed(2)} all output</span>
          </div>
          <p className="institute-note">
            The wings are built. Endow a permanent chair — every Grant from here on funds
            a Fellow, and the Institute keeps growing for as long as you keep ascending.
          </p>
          {game.instituteFellowships > 0 && (
            <div className="institute-fellow-latest">
              Latest chair: <b>{fellowName(game.instituteFellowships)}</b>
              {game.instituteFellowships > 1 && <span className="institute-fellow-count"> · {game.instituteFellowships} endowed</span>}
            </div>
          )}
          <button
            className="institute-wing"
            disabled={!canEndowFellowship(game)}
            onClick={onEndowFellowship}
          >
            <div className="institute-main">
              <span className="institute-name">Endow {fellowName(game.instituteFellowships + 1)}</span>
              <span className="institute-desc">
                +{Math.round(instituteBalance.fellowships.perLevel * 100)}% to ALL output, forever.
              </span>
            </div>
            <span className="institute-cost">
              {fellowshipCost(game)} {fellowshipCost(game) === 1 ? "grant" : "grants"}
            </span>
          </button>
        </div>
      )}
    </>
  );
}
