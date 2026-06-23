import { balance } from "../engine/balance/config";
import { upgradeCost, canBuyUpgrade } from "../engine/actions";
import type { GameState } from "../engine/types";
import { fmt } from "./format";

interface Props {
  game: GameState;
  onBuy: (id: string) => void;
}

const RESOURCE_VAR: Record<string, string> = {
  money: "--money",
  data: "--data",
  compute: "--compute",
};

export function UpgradePanel({ game, onBuy }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">Hardware &amp; Upgrades</h2>
      <div className="list">
        {balance.upgrades.map((def) => {
          const owned = game.upgrades[def.id] ?? 0;
          const maxed = owned >= def.max;
          const cost = upgradeCost(def, owned);
          const affordable = canBuyUpgrade(game, def.id);
          return (
            <button
              key={def.id}
              className={`card ${affordable ? "affordable" : ""} ${maxed ? "maxed" : ""}`}
              disabled={!affordable}
              onClick={() => onBuy(def.id)}
            >
              <div className="card-main">
                <span className="card-name">
                  {def.name}
                  {def.max !== Infinity && <span className="card-owned">{owned}/{def.max}</span>}
                  {def.max === Infinity && owned > 0 && <span className="card-owned">×{owned}</span>}
                </span>
                <span className="card-desc">{def.desc}</span>
              </div>
              <div className="card-cost">
                {maxed ? (
                  <span className="cost-max">MAX</span>
                ) : (
                  <span style={{ color: `var(${RESOURCE_VAR[def.cost.resource]})` }}>
                    {fmt(cost)} {def.cost.resource}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
