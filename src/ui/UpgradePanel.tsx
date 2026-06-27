import { balance } from "../engine/balance/config";
import { upgradeCost, canBuyUpgrade } from "../engine/actions";
import { recommendedUpgrade } from "../engine/recommend";
import { hallCapacity, totalRacks, isRackId, evictableRackFor } from "../engine/hall";
import { powerStats } from "../engine/power";
import { productMetrics } from "../engine/products";
import { Big } from "../engine/math/Big";
import type { Derived, GameState } from "../engine/types";
import { fmt, effRate, fmtEta } from "./format";
import { BoltIcon } from "./Icons";
import { burst, punch } from "./fx";
import { UpgradeIcon, EffectPill, upgradeGroup, UP_GROUP_ORDER } from "./effectVisual";

const RES_HEX: Record<string, string> = { compute: "#2f7bf6", data: "#9b51e0", money: "#16b364" };

interface Props {
  game: GameState;
  derived: Derived;
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
          {throttled ? <> · <BoltIcon size={12} /> throttled −{penalty}%</> : ` · ${Math.round(pct)}%`}
        </span>
      </div>
      <div className="power-bar">
        <div className="power-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

export function UpgradePanel({ game, derived, onBuy }: Props) {
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

  // ETA income rates. Money also flows from live products (net margin) minus payroll,
  // so a money-cost ETA isn't misleadingly long once a product business is running.
  const prodMargin = game.products.active.reduce((s, p) => s + productMetrics(p, game.products.frontier).margin, 0);
  const moneyRate = effRate(derived, "money").add(Big.of(prodMargin)).sub(derived.payrollPerSec);
  const rateFor = (r: "compute" | "data" | "money") => (r === "money" ? moneyRate : effRate(derived, r));

  type Def = (typeof balance.upgrades)[number];
  const defs = balance.upgrades
    .filter((def) => def.market !== "darkweb")
    .filter((def) => showExpansions || !isExpansion(def.effect.kind))
    .filter((def) => showPower || def.effect.kind !== "powerCapacity");
  // Recommended next buy: the best-VALUE upgrade you can afford (most marginal
  // benefit per cost), NOT merely the cheapest — so it never points you at a
  // strictly-worse rack. Pure/tested in the engine. Null if nothing's buyable.
  const heroId = recommendedUpgrade(game);
  const hero = heroId ? (defs.find((d) => d.id === heroId) ?? null) : null;

  const rest = defs.filter((def) => def.id !== hero?.id);
  const groups = UP_GROUP_ORDER
    .map((g) => ({ g, items: rest.filter((d) => upgradeGroup(d.id, d.effect.kind) === g) }))
    .filter((x) => x.items.length > 0);

  const renderCard = (def: Def, isHero = false) => {
    const owned = game.upgrades[def.id] ?? 0;
    const maxed = owned >= def.max;
    const cost = upgradeCost(def, owned);
    const affordable = canBuyUpgrade(game, def.id);
    // On a full floor a higher-tier rack upgrades in place (evicts a lower one);
    // only a rack with nothing lower to replace is truly blocked.
    const rack = isRackId(def.id);
    const willReplace = rack && floorFull && !maxed && !!evictableRackFor(game, def.id);
    const blockedByFloor = rack && floorFull && !maxed && !willReplace;
    return (
      <button
        key={def.id}
        className={`card ${isHero ? "card-hero" : ""} ${affordable ? "affordable" : ""} ${maxed ? "maxed" : ""}`}
        disabled={!affordable}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          burst(r.right - 22, r.top + r.height / 2, { count: isHero ? 16 : 12, power: isHero ? 1.1 : 0.9, colors: [RES_HEX[def.cost.resource] ?? "#9b51e0"] });
          punch(e.currentTarget);
          onBuy(def.id);
        }}
      >
        <UpgradeIcon id={def.id} kind={def.effect.kind} />
        <div className="card-main">
          <span className="card-name">
            {def.name}
            {def.max !== Infinity && <span key={owned} className="card-owned">{owned}/{def.max}</span>}
            {def.max === Infinity && owned > 0 && <span key={owned} className="card-owned">×{owned}</span>}
          </span>
          <EffectPill effect={def.effect} />
          <span className="card-desc">{def.desc}</span>
          {willReplace && <span className="card-note">↑ replaces a lower-tier rack</span>}
        </div>
        <div className="card-cost">
          {maxed ? (
            <span className="cost-max">MAX</span>
          ) : blockedByFloor ? (
            <span className="cost-blocked">Floor full</span>
          ) : (
            <>
              <span style={{ color: `var(${RESOURCE_VAR[def.cost.resource]})` }}>
                {def.cost.resource === "money" ? `$${fmt(cost)}` : `${fmt(cost)} ${def.cost.resource}`}
              </span>
              {!affordable && (() => {
                const eta = fmtEta(cost, game.resources[def.cost.resource], rateFor(def.cost.resource));
                return eta ? <span className="cost-eta">{eta}</span> : null;
              })()}
            </>
          )}
        </div>
      </button>
    );
  };

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
      {hero && (
        <div className="hero-wrap">
          <div className="hero-kicker">Recommended next</div>
          {renderCard(hero, true)}
        </div>
      )}
      {groups.map(({ g, items }) => (
        <div className="up-group" key={g}>
          <div className="up-group-head">{g}</div>
          <div className="list">{items.map((d) => renderCard(d))}</div>
        </div>
      ))}
    </section>
  );
}
