import { balance } from "../engine/balance/config";
import { upgradeCost, canBuyUpgrade } from "../engine/actions";
import { hallCapacity, totalRacks, isRackId } from "../engine/hall";
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
  // Hall expansions only matter once you have hardware to house — reveal them
  // when the closet starts to fill, rather than cluttering the first session.
  const racks = totalRacks(game);
  const capacity = hallCapacity(game);
  const floorFull = racks >= capacity;
  const showExpansions = racks >= balance.hall.expansionRevealRacks;
  const isExpansion = (k: string) => k === "floorCols" || k === "floorRows";

  return (
    <section className="panel">
      <h2 className="panel-title">Hardware &amp; Upgrades</h2>
      <p className={`floor-meter${floorFull ? " full" : ""}`}>
        Floor space: <b>{racks}/{capacity} racks</b>
        {floorFull && <span> — full. Expand the hall to fit more.</span>}
      </p>
      <div className="list">
        {balance.upgrades
          .filter((def) => def.market !== "darkweb")
          .filter((def) => showExpansions || !isExpansion(def.effect.kind))
          .map((def) => {
          const owned = game.upgrades[def.id] ?? 0;
          const maxed = owned >= def.max;
          const cost = upgradeCost(def, owned);
          const affordable = canBuyUpgrade(game, def.id);
          // A rack you could otherwise afford but can't buy because the floor is
          // full: tell the player to expand rather than leaving a dead button.
          const blockedByFloor = isRackId(def.id) && floorFull && !maxed;
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
                ) : blockedByFloor ? (
                  <span className="cost-blocked">Floor full</span>
                ) : (
                  <span style={{ color: `var(${RESOURCE_VAR[def.cost.resource]})` }}>
                    {def.cost.resource === "money" ? `$${fmt(cost)}` : `${fmt(cost)} ${def.cost.resource}`}
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
