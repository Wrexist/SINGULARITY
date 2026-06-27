import { balance } from "../engine/balance/config";
import { canBuyResearch, researchAvailable } from "../engine/actions";
import type { Derived, GameState } from "../engine/types";
import { fmt, fmtDur, etaSecs, effRate } from "./format";
import { burst } from "./fx";
import { Big } from "../engine/math/Big";
import { CheckIcon, LockIcon } from "./Icons";

interface Props {
  game: GameState;
  derived: Derived;
  onResearch: (id: string) => void;
}

export function ResearchPanel({ game, derived, onResearch }: Props) {
  const isOwned = (id: string) => game.research.includes(id);
  // Reveal in waves (GDD): show owned/available nodes and the NEXT wave (locked
  // nodes whose prerequisites are owned or already available) — not the whole tree.
  const visible = balance.research.filter((def) => {
    if (isOwned(def.id) || researchAvailable(game, def.id)) return true;
    return def.requires.every((r) => isOwned(r) || researchAvailable(game, r));
  });

  return (
    <section className="panel">
      <h2 className="panel-title">Research</h2>
      <div className="research-track">
        {visible.map((def) => {
          const owned = game.research.includes(def.id);
          const available = researchAvailable(game, def.id);
          const affordable = canBuyResearch(game, def.id);
          const state = owned ? "owned" : available ? "available" : "locked";
          // Time-to-afford for an available-but-unaffordable node: the binding
          // (longest) of its compute + data legs.
          let etaText: string | null = null;
          if (available && !affordable) {
            const legs = [
              def.cost.compute > 0 ? etaSecs(Big.of(def.cost.compute), game.resources.compute, effRate(derived, "compute")) : null,
              def.cost.data > 0 ? etaSecs(Big.of(def.cost.data), game.resources.data, effRate(derived, "data")) : null,
            ].filter((x): x is number => x !== null);
            if (legs.length > 0) etaText = `~${fmtDur(Math.max(...legs))}`;
          }
          return (
            <button
              key={def.id}
              className={`node ${state} ${affordable ? "affordable" : ""}`}
              disabled={!affordable}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                burst(r.left + r.width / 2, r.top + r.height / 2, { count: 14, power: 1, colors: ["#9b51e0", "#2f7bf6"] });
                onResearch(def.id);
              }}
            >
              <div className="node-head">
                <span className="node-name">{def.name}</span>
                {owned && <span className="node-tag"><CheckIcon size={12} /> done</span>}
                {!owned && !available && <span className="node-tag"><LockIcon size={12} /> locked</span>}
              </div>
              <span className="node-desc">{def.desc}</span>
              {!owned && (
                <span className="node-cost">
                  {def.cost.compute > 0 && (
                    <span style={{ color: "var(--compute)" }}>{fmt(Big.of(def.cost.compute))} compute </span>
                  )}
                  {def.cost.data > 0 && (
                    <span style={{ color: "var(--data)" }}>{fmt(Big.of(def.cost.data))} data</span>
                  )}
                  {etaText && <span className="cost-eta">{etaText}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
