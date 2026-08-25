import { useState } from "react";
import { balance } from "../engine/balance/config";
import { upgradeCost, canBuyUpgrade, planBulkUpgrade } from "../engine/actions";
import { recommendedUpgrade } from "../engine/recommend";
import { upgradeFlavor, crossedFlavorTier } from "../engine/flavor";
import { hallCapacity, wingCapacity, hallWings, floorDrawnOut, totalRacks, isRackId, evictableRackFor } from "../engine/hall";
import { wingCost, canFoundWing, reputationAvailable } from "../engine/reputation";
import { powerStats } from "../engine/power";
import { productMetrics } from "../engine/products";
import { Big } from "../engine/math/Big";
import type { Derived, GameState } from "../engine/types";
import { fmt, effRate, fmtEta } from "./format";
import { BoltIcon } from "./Icons";
import { burst, punch, floatText, registerBuyStreak } from "./fx";
import { UpgradeRingIcon, EffectPill, upgradeGroup, UP_GROUP_ORDER, rackTierMark } from "./effectVisual";

const RES_HEX: Record<string, string> = { compute: "#2f7bf6", data: "#9b51e0", money: "#16b364" };
// Rack tiers finally read as three distinct pieces of hardware (the ramp already lives
// in the hall rack swatch): basic=green, server=blue, TPU=violet. Non-racks fall back to
// their resource color for buy feedback.
const RACK_TIER_HEX: Record<string, string> = { rack_basic: "rgb(52,210,126)", rack_server: "rgb(63,134,240)", rack_tpu: "rgb(155,81,224)" };
const buyColorFor = (id: string, resource: string) => RACK_TIER_HEX[id] ?? RES_HEX[resource] ?? "#9b51e0";

interface Props {
  game: GameState;
  derived: Derived;
  onBuy: (id: string, count?: number, at?: { x: number; y: number }) => void;
  /** Found a Facility Wing (a whole new floor, funded with Lab Reputation). */
  onFoundWing: () => void;
}

/** Wings are lettered, matching the hall's switcher — "Wing B" reads like a place in
 *  a building where "Wing 2" reads like an index. */
const WING_LETTER = (i: number) => (i < 26 ? `Wing ${String.fromCharCode(65 + i)}` : `Wing ${i + 1}`);

/** Buy-quantity for the panel: one, ten, or as many as affordable. */
type BuyQty = 1 | 10 | "max";

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

export function UpgradePanel({ game, derived, onBuy, onFoundWing }: Props) {
  // Buy quantity: ×1 / ×10 / Max. Batches purchases so late-game players aren't
  // tapping the same rack dozens of times (a core idle QoL the panel was missing).
  const [qty, setQty] = useState<BuyQty>(1);
  const want = qty === "max" ? Infinity : qty;

  // Hall expansions only matter once you have hardware to house — reveal them
  // when the closet starts to fill, rather than cluttering the first session.
  const racks = totalRacks(game);
  const capacity = hallCapacity(game);
  const floorFull = racks >= capacity;
  const showExpansions = racks >= balance.hall.expansionRevealRacks;
  const isExpansion = (k: string) => k === "floorCols" || k === "floorRows";
  // Facility Wings: once the floor meets the renderer's per-frame draw cap, another
  // expansion level buys tiles that can hold no rack — so the panel stops offering
  // expansions and offers the wing instead. That dead purchase used to be live: the
  // last level of each expansion cost tens of thousands and added ~10 slots between
  // them, or none at all.
  const drawnOut = floorDrawnOut(game);
  const wingRep = wingCost(game);
  const canWing = canFoundWing(game);
  const repLeft = reputationAvailable(game);
  const wings = hallWings(game);
  const perWing = wingCapacity(game);

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
    // Once the floor meets the renderer's per-frame draw cap, another expansion level
    // adds tiles no rack can stand on — tens of thousands for nothing. Stop OFFERING
    // it; the wing card below is what the player actually wants from here.
    //
    // Deliberately a display filter and not a `canBuyUpgrade` change: the balance sim
    // reads canBuyUpgrade to decide what an engaged player buys, so gating there would
    // move its decisions and the tuned curve with them. The purchase stays legal —
    // levels already owned stay owned, and a save carrying one still loads — it is
    // just no longer put in front of you.
    .filter((def) => !drawnOut || !isExpansion(def.effect.kind))
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
    // When buying in bulk, plan the actual batch (how many you can afford up to
    // `want`, and its total cost) so the card shows what the tap will really do.
    const bulk = qty !== 1 && affordable && !maxed && !blockedByFloor
      ? planBulkUpgrade(game, def.id, want)
      : null;
    const showBulk = !!bulk && bulk.count > 1;
    const displayCost = showBulk ? bulk!.totalCost : cost;
    // Ring progress toward the next purchase (single-resource, accrues smoothly). Full
    // when affordable/maxed; the ring is hidden by CSS on maxed cards.
    const have = game.resources[def.cost.resource];
    const pct = maxed || affordable ? 1 : (() => {
      const r = have.div(cost).toNumber();
      return Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 0;
    })();
    return (
      <button
        key={def.id}
        className={`card ${isHero ? "card-hero" : ""} ${affordable ? "affordable" : ""} ${maxed ? "maxed" : ""}`}
        disabled={!affordable}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const units = showBulk ? bulk!.count : 1;
          // Feedback escalates with the BIGGER of batch size and rapid-tap streak, so a
          // Max buy and a run of quick taps both feel like more than a single click —
          // capped so it stays premium, not chaotic. (All fx self-suppress under
          // reduced-motion; the static end state — new count + rates — is unchanged.)
          const streak = registerBuyStreak();
          const escal = Math.max(Math.log2(1 + units), streak * 0.6);
          // A buy that crosses a flavor-tier breakpoint (6th/16th/30th rack, …) earns a
          // bigger, gold-flecked beat — the milestone stops passing silently. The card's
          // own flavor line updates to the newly-earned text (wordless reward).
          const milestone = crossedFlavorTier(def.id, owned, owned + units);
          const color = buyColorFor(def.id, def.cost.resource);
          // Proportionality caps (2026-08 audit, Part 4 §5): a routine buy — even a
          // Max batch — stays BELOW an achievement (28 @ 1.45); only a flavor-tier
          // milestone may edge past it. Buying racks is shopping, not winning.
          const count = Math.min(milestone ? 32 : 26, Math.round((isHero ? 16 : 12) + escal * 5 + (milestone ? 12 : 0)));
          const power = Math.min(milestone ? 1.5 : 1.35, (isHero ? 1.1 : 0.9) + escal * 0.12 + (milestone ? 0.35 : 0));
          burst(r.right - 22, r.top + r.height / 2, { count, power, colors: milestone ? [color, "#ffd60a"] : [color] });
          punch(e.currentTarget);
          if (milestone) floatText(r.left + r.width / 2, r.top + 2, "✦", "#ffd60a", 22);
          // Pass the tap point + batch size so App can float the gain and scale haptics.
          onBuy(def.id, want, { x: r.right - 26, y: r.top + 6 });
        }}
      >
        <UpgradeRingIcon id={def.id} kind={def.effect.kind} pct={pct} showPct={isHero && !affordable && !maxed} />
        <div className="card-main">
          <span className="card-name">
            {rackTierMark(def.id) && <span className="rack-tier-mark" style={{ color: buyColorFor(def.id, def.cost.resource) }} aria-hidden="true">{rackTierMark(def.id)}</span>}
            {def.name}
            {def.max !== Infinity && <span key={owned} className="card-owned">{owned}/{def.max}</span>}
            {def.max === Infinity && owned > 0 && <span key={owned} className="card-owned">×{owned}</span>}
          </span>
          <EffectPill effect={def.effect} />
          <span className="card-desc">{upgradeFlavor(def.id, owned, def.desc)}</span>
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
                {def.cost.resource === "money" ? `$${fmt(displayCost)}` : `${fmt(displayCost)} ${def.cost.resource}`}
                {showBulk && <span className="cost-mult"> ×{bulk!.count}</span>}
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
        {wings > 1 && <span> across {wings} wings</span>}
        {floorFull && <span> — full. {drawnOut ? "The block is leased out; found a wing." : "Expand the hall to fit more."}</span>}
      </p>
      {/* Found a wing. Appears only once the floor is genuinely drawn out, so it is
          never a shortcut past the hall you were meant to fill first. Funded with Lab
          Reputation — you have leased every bay the block has, so the next floor comes
          out of the lab's standing. */}
      {drawnOut && (
        <button
          className={`wing-found ${canWing ? "affordable" : ""}`}
          disabled={!canWing}
          onClick={() => { onFoundWing(); }}
        >
          <span className="wing-found-main">
            <span className="wing-found-name">Found {WING_LETTER(wings)}</span>
            <span className="wing-found-desc">
              A whole new floor — {perWing} more rack slots, and the hall you know stays as it is.
            </span>
          </span>
          <span className="wing-found-cost">
            {wingRep} REP
            {!canWing && repLeft < wingRep && <span className="wing-found-short">{wingRep - repLeft} short</span>}
          </span>
        </button>
      )}
      {showPower && (
        <PowerMeter draw={power.drawKw} cap={power.capacityKw} factor={power.thermalFactor} throttled={power.throttled} />
      )}
      <div className="buy-qty" role="group" aria-label="Buy quantity">
        {(["1", "10", "max"] as const).map((q) => {
          const val: BuyQty = q === "max" ? "max" : (Number(q) as 1 | 10);
          return (
            <button
              key={q}
              className={`buy-qty-btn ${qty === val ? "on" : ""}`}
              aria-pressed={qty === val}
              onClick={() => setQty(val)}
            >
              {q === "max" ? "Max" : `×${q}`}
            </button>
          );
        })}
      </div>
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
