import type { GameState } from "../engine/types";
import { instituteBalance, grantsAvailable, canBuyInstitute } from "../engine/institute";

interface Props {
  game: GameState;
  onBuy: (id: string) => void;
}

const nameOf = (id?: string) => instituteBalance.perks.find((p) => p.id === id)?.name ?? "a prerequisite";

/**
 * The Institute — the third meta-layer, above ascension. Founded and expanded with
 * Grants (one per AGI ascension), a fresh tree of powerful permanent wings. Rendered
 * inside a Collapsible so it never adds to the HQ wall until a deep player opens it.
 */
export function InstitutePanel({ game, onBuy }: Props) {
  const owned = new Set(game.institute);
  const grants = grantsAvailable(game);
  const doneCount = instituteBalance.perks.filter((p) => owned.has(p.id)).length;

  return (
    <>
      {/* First-run scaffolding — once a wing is founded, the wings + the grants
          badge on the Collapsible header carry the system. */}
      {doneCount === 0 && (
        <p className="institute-note">
          Ascensions mint <b>Grants</b> — you have <b>{grants}</b>. Found the Institute's wings: powerful, permanent, no reset.
        </p>
      )}
      <div className="list">
        {instituteBalance.perks.map((p) => {
          const isOwned = owned.has(p.id);
          const can = canBuyInstitute(game, p.id);
          const lockedByReq = !!p.requires && !owned.has(p.requires);
          return (
            <button key={p.id} className={`institute-wing meta-item ${isOwned ? "owned" : can ? "affordable" : lockedByReq ? "locked" : ""}`} disabled={isOwned || !can} onClick={() => onBuy(p.id)}>
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
    </>
  );
}
