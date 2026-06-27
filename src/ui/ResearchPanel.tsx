import { balance } from "../engine/balance/config";
import { canBuyResearch, researchAvailable } from "../engine/actions";
import type { Derived, GameState } from "../engine/types";
import { fmt, fmtDur, etaSecs, effRate } from "./format";
import { burst, punch } from "./fx";
import { Big } from "../engine/math/Big";
import { CheckIcon, LockIcon } from "./Icons";
import { ResearchIcon, EffectPill } from "./effectVisual";

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

  type Def = (typeof balance.research)[number];
  const etaFor = (def: Def): number | null => {
    const legs = [
      def.cost.compute > 0 ? etaSecs(Big.of(def.cost.compute), game.resources.compute, effRate(derived, "compute")) : null,
      def.cost.data > 0 ? etaSecs(Big.of(def.cost.data), game.resources.data, effRate(derived, "data")) : null,
    ].filter((x): x is number => x !== null);
    return legs.length > 0 ? Math.max(...legs) : null;
  };

  // Recommended next research: the affordable one (cheapest by total cost), else
  // the available node you'll reach soonest. A clear "aim for this" anchor.
  const available = visible.filter((d) => !isOwned(d.id) && researchAvailable(game, d.id));
  const affordable = available.filter((d) => canBuyResearch(game, d.id));
  const totalCost = (d: Def) => d.cost.compute + d.cost.data;
  let hero: Def | null = null;
  if (affordable.length) hero = affordable.reduce((a, b) => (totalCost(a) <= totalCost(b) ? a : b));
  else {
    const withEta = available.map((d) => ({ d, eta: etaFor(d) })).filter((x) => x.eta != null) as { d: Def; eta: number }[];
    if (withEta.length) hero = withEta.reduce((a, b) => (a.eta <= b.eta ? a : b)).d;
  }

  const renderNode = (def: Def, isHero = false) => {
    const owned = game.research.includes(def.id);
    const avail = researchAvailable(game, def.id);
    const canBuy = canBuyResearch(game, def.id);
    const state = owned ? "owned" : avail ? "available" : "locked";
    const eta = !owned && avail && !canBuy ? etaFor(def) : null;
    return (
      <button
        key={def.id}
        className={`node ${isHero ? "node-hero" : ""} ${state} ${canBuy ? "affordable" : ""}`}
        disabled={!canBuy}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          burst(r.left + r.width / 2, r.top + r.height / 2, { count: isHero ? 22 : 18, power: 1.1, colors: ["#9b51e0", "#2f7bf6", "#16b364"] });
          punch(e.currentTarget);
          onResearch(def.id);
        }}
      >
        <ResearchIcon kind={def.effect.kind} />
        <div className="node-body">
          <div className="node-head">
            <span className="node-name">{def.name}</span>
            {owned && <span className="node-tag"><CheckIcon size={12} /> done</span>}
            {!owned && !avail && <span className="node-tag"><LockIcon size={12} /> locked</span>}
          </div>
          <EffectPill effect={def.effect} />
          <span className="node-desc">{def.desc}</span>
          {!owned && (
            <span className="node-cost">
              {def.cost.compute > 0 && (
                <span style={{ color: "var(--compute)" }}>{fmt(Big.of(def.cost.compute))} compute </span>
              )}
              {def.cost.data > 0 && (
                <span style={{ color: "var(--data)" }}>{fmt(Big.of(def.cost.data))} data</span>
              )}
              {eta != null && <span className="cost-eta">~{fmtDur(eta)}</span>}
            </span>
          )}
        </div>
      </button>
    );
  };

  const rest = visible.filter((d) => d.id !== hero?.id);

  return (
    <section className="panel">
      <h2 className="panel-title">Research</h2>
      {hero && (
        <div className="hero-wrap">
          <div className="hero-kicker">Recommended next</div>
          {renderNode(hero, true)}
        </div>
      )}
      <div className="research-track">
        {rest.map((def) => renderNode(def))}
      </div>
    </section>
  );
}
