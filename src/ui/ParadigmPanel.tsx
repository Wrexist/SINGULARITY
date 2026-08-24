import type { GameState } from "../engine/types";
import { paradigmsBalance, paradigmsUnlocked, canBuyParadigm } from "../engine/paradigms";
import { reputationAvailable } from "../engine/reputation";

interface Props {
  game: GameState;
  onBuy: (id: string) => void;
}

const nameOf = (id?: string) => paradigmsBalance.list.find((p) => p.id === id)?.name ?? "a prerequisite";

/**
 * Paradigm Research — the deep-endgame layer that finally REVEALS new research nodes
 * (the base tree is identical every generation). Bought with Reputation; each is a
 * genuine capability paradigm a veteran has never seen before. Hidden until the reveal
 * ship count; curve-safe (meta-currency cost — see engine/paradigms.ts).
 */
export function ParadigmPanel({ game, onBuy }: Props) {
  if (!paradigmsUnlocked(game)) return null;
  const owned = new Set(game.paradigms);
  const avail = reputationAvailable(game);
  const doneCount = paradigmsBalance.list.filter((p) => owned.has(p.id)).length;

  return (
    <section className="panel paradigms">
      <div className="paradigms-head">
        <h2 className="panel-title" style={{ margin: 0 }}>Paradigm Research</h2>
        <span className="paradigms-count">{doneCount}/{paradigmsBalance.list.length} · {Math.floor(avail)} rep</span>
      </div>
      {/* First-run scaffolding — the head chip carries the rep balance after that. */}
      {doneCount === 0 && (
        <p className="paradigms-note">Breakthroughs beyond the standard tree — bought with <b>{Math.floor(avail)}</b> Lab Reputation.</p>
      )}
      <div className="list">
        {paradigmsBalance.list.map((p) => {
          const isOwned = owned.has(p.id);
          const can = canBuyParadigm(game, p.id);
          const lockedByReq = !!p.requires && !owned.has(p.requires);
          // How close this one is, for a row that is merely unaffordable (an
          // actionable row says so with .affordable; a gated one has nothing to
          // fill toward). Same question the Build/Research rings answer.
          const pct = !isOwned && !can && !lockedByReq && p.cost > 0
            ? Math.max(0, Math.min(1, avail / p.cost))
            : 0;
          return (
            <button key={p.id} className={`paradigm-node meta-item ${isOwned ? "owned" : can ? "affordable" : lockedByReq ? "locked" : ""}`} disabled={isOwned || !can} onClick={() => onBuy(p.id)}>
              {pct > 0 && <span className="meta-progress" style={{ width: `${pct * 100}%` }} aria-hidden="true" />}
              <div className="paradigm-main">
                <span className="paradigm-name">{p.name}{isOwned ? " ✓" : ""}</span>
                <span className="paradigm-desc">{p.desc}</span>
                {lockedByReq && <span className="paradigm-req">needs {nameOf(p.requires)}</span>}
              </div>
              <span className="paradigm-cost">{isOwned ? "owned" : `${p.cost} rep`}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
