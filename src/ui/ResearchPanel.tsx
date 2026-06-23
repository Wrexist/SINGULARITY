import { balance } from "../engine/balance/config";
import { canBuyResearch, researchAvailable } from "../engine/actions";
import type { GameState } from "../engine/types";
import { fmt } from "./format";
import { Big } from "../engine/math/Big";

interface Props {
  game: GameState;
  onResearch: (id: string) => void;
}

export function ResearchPanel({ game, onResearch }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">Research</h2>
      <div className="research-track">
        {balance.research.map((def) => {
          const owned = game.research.includes(def.id);
          const available = researchAvailable(game, def.id);
          const affordable = canBuyResearch(game, def.id);
          const state = owned ? "owned" : available ? "available" : "locked";
          return (
            <button
              key={def.id}
              className={`node ${state} ${affordable ? "affordable" : ""}`}
              disabled={!affordable}
              onClick={() => onResearch(def.id)}
            >
              <div className="node-head">
                <span className="node-name">{def.name}</span>
                {owned && <span className="node-tag">✓ done</span>}
                {!owned && !available && <span className="node-tag">🔒 locked</span>}
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
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
