import { balance } from "../engine/balance/config";
import { canBuyResearch, researchAvailable, researchLockedOut, researchCost } from "../engine/actions";
import type { Derived, GameState } from "../engine/types";
import { fmt, fmtDur, etaSecs, effRate } from "./format";
import { burst, punch } from "./fx";
import { CheckIcon, LockIcon } from "./Icons";
import { ResearchIcon, EffectPill } from "./effectVisual";
import { groupByCategory } from "../engine/researchCategories";

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
    const c = researchCost(game, def); // discounted by Research Fellowship if owned
    const legs = [
      def.cost.compute > 0 ? etaSecs(c.compute, game.resources.compute, effRate(derived, "compute")) : null,
      def.cost.data > 0 ? etaSecs(c.data, game.resources.data, effRate(derived, "data")) : null,
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
    const lockedOut = !owned && researchLockedOut(game, def.id);
    const state = owned ? "owned" : lockedOut ? "excluded" : avail ? "available" : "locked";
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
            {lockedOut && <span className="node-tag">✗ not chosen</span>}
            {!owned && !lockedOut && def.exclusiveGroup && avail && <span className="node-tag excl">⊻ pick one</span>}
            {!owned && !avail && !lockedOut && <span className="node-tag"><LockIcon size={12} /> locked</span>}
          </div>
          <EffectPill effect={def.effect} />
          <span className="node-desc">{def.desc}</span>
          {!owned && (() => {
            const c = researchCost(game, def); // reflects the Research Fellowship discount
            return (
              <span className="node-cost">
                {def.cost.compute > 0 && (
                  <span style={{ color: "var(--compute)" }}>{fmt(c.compute)} compute </span>
                )}
                {def.cost.data > 0 && (
                  <span style={{ color: "var(--data)" }}>{fmt(c.data)} data</span>
                )}
                {eta != null && <span className="cost-eta">~{fmtDur(eta)}</span>}
              </span>
            );
          })()}
        </div>
      </button>
    );
  };

  const rest = visible.filter((d) => d.id !== hero?.id);
  // Group the remaining nodes under themed category headers so the growing tree
  // reads as structured waves instead of a flat wall (legibility subsystem).
  const groups = groupByCategory(rest, (d) => d.id);

  return (
    <section className="panel">
      <h2 className="panel-title">Research</h2>
      {hero && (
        <div className="hero-wrap">
          <div className="hero-kicker">Recommended next</div>
          {renderNode(hero, true)}
        </div>
      )}
      {groups.map(({ category, items }) => (
        <div className="research-cat" key={category.id}>
          <div className="research-cat-head">
            <span className="research-cat-name">{category.name}</span>
            <span className="research-cat-count">{items.filter((d) => isOwned(d.id)).length}/{items.length}</span>
          </div>
          <div className="research-track">
            {items.map((def) => renderNode(def))}
          </div>
        </div>
      ))}
    </section>
  );
}
