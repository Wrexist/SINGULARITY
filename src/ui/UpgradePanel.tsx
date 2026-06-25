import { balance } from "../engine/balance/config";
import { upgradeCost, canBuyUpgrade } from "../engine/actions";
import { hallCapacity, totalRacks, isRackId, evictableRackFor } from "../engine/hall";
import { powerStats } from "../engine/power";
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

/** Power soft-cap meter (Phase 2): draw vs capacity; warns when throttling. */
function PowerMeter({ draw, cap, factor, throttled }: { draw: number; cap: number; factor: number; throttled: boolean }) {
  const pct = cap > 0 ? (draw / cap) * 100 : 0;
  const penalty = Math.round((1 - factor) * 100);
  const color = throttled ? "#ef4444" : pct > 80 ? "#f97316" : "var(--compute)";
  return (
    <div className="power">
      <div className="power-head">
        <span>Power</span>
        <span className="power-stat" style={{ color }}>
          {Math.round(draw)}/{Math.round(cap)} kW
          {throttled ? ` · ⚡ throttled −${penalty}%` : ` · ${Math.round(pct)}%`}
        </span>
      </div>
      <div className="power-bar">
        <div className="power-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

export function UpgradePanel({ game, onBuy }: Props) {
  // Hall expansions only matter once you have hardware to house — reveal them
  // when the closet starts to fill, rather than cluttering the first session.
  const racks = totalRacks(game);
  const capacity = hallCapacity(game);
  const floorFull = racks >= capacity;
  const showExpansions = racks >= balance.hall.expansionRevealRacks;
  const isExpansion = (k: string) => k === "floorCols" || k === "floorRows";

  // Power soft-cap (Phase 2): reveal the meter + power upgrades once the lab
  // actually draws power, so the first session stays clean.
  const power = powerStats(game);
  const showPower = balance.power.enabled && power.drawKw >= balance.power.revealAtDrawKw;

  return (
    <section className="panel">
      <h2 className="panel-title">Hardware &amp; Upgrades</h2>
      <p className={`floor-meter${floorFull ? " full" : ""}`}>
        Floor space: <b>{racks}/{capacity} racks</b>
        {floorFull && <span> — full. Expand the hall to fit more.</span>}
      </p>
      {showPower && (
        <PowerMeter draw={power.drawKw} cap={power.capacityKw} factor={power.thermalFactor} throttled={power.throttled} />
      )}
      <div className="list">
        {balance.upgrades
          .filter((def) => def.market !== "darkweb")
          .filter((def) => showExpansions || !isExpansion(def.effect.kind))
          .filter((def) => showPower || def.effect.kind !== "powerCapacity")
          .map((def) => {
          const owned = game.upgrades[def.id] ?? 0;
          const maxed = owned >= def.max;
          const cost = upgradeCost(def, owned);
          const affordable = canBuyUpgrade(game, def.id);
          // On a full floor a higher-tier rack upgrades in place (evicts a lower
          // one); only a rack with nothing lower to replace is truly blocked.
          const rack = isRackId(def.id);
          const willReplace = rack && floorFull && !maxed && !!evictableRackFor(game, def.id);
          const blockedByFloor = rack && floorFull && !maxed && !willReplace;
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
                {willReplace && <span className="card-note">↑ replaces a lower-tier rack</span>}
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
