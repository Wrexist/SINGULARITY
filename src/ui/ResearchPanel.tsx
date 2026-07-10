import { balance } from "../engine/balance/config";
import { canBuyResearch, researchAvailable, researchLockedOut, researchCost } from "../engine/actions";
import { computeBankCeiling } from "../engine/derive";
import { canBuyPreprint, preprintCost, preprintTitle } from "../engine/preprints";
import { Big } from "../engine/math/Big";
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
  /** IDEAS #10 — publish a frontier preprint (post-tree repeatable). */
  onBuyPreprint: () => void;
}

export function ResearchPanel({ game, derived, onResearch, onBuyPreprint }: Props) {
  const isOwned = (id: string) => game.research.includes(id);
  // Reveal in waves (GDD): show owned/available nodes and the NEXT wave (locked
  // nodes whose prerequisites are owned or already available) — not the whole tree.
  const visible = balance.research.filter((def) => {
    if (isOwned(def.id) || researchAvailable(game, def.id)) return true;
    return def.requires.every((r) => isOwned(r) || researchAvailable(game, r));
  });

  type Def = (typeof balance.research)[number];
  // Compute the auto-train bank ceiling once: any node costing more Compute than this is
  // unreachable at the current intensity, so a "~2m" ETA would be a lie (see derive.ts).
  const ceiling = computeBankCeiling(game, derived);
  const computeWalled = (computeCost: Big) => ceiling !== null && computeCost.gt(ceiling);
  const etaFor = (def: Def): number | null => {
    const c = researchCost(game, def); // discounted by Research Fellowship if owned
    if (def.cost.compute > 0 && computeWalled(c.compute)) return null; // unreachable until intensity eases
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
            // Walled = the auto-train bank can't hold this much Compute at the current
            // intensity. Show the real lever, not a countdown that will never arrive.
            const walled = def.cost.compute > 0 && !canBuy && computeWalled(c.compute);
            return (
              <span className="node-cost">
                {def.cost.compute > 0 && (
                  <span style={{ color: "var(--compute)" }}>{fmt(c.compute)} compute </span>
                )}
                {def.cost.data > 0 && (
                  <span style={{ color: "var(--data)" }}>{fmt(c.data)} data</span>
                )}
                {walled ? (
                  <span className="cost-eta walled" title="Auto-train is draining Compute — ease training intensity to let the bank climb">ease intensity ↓</span>
                ) : eta != null && <span className="cost-eta">~{fmtDur(eta)}</span>}
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

  // Capstone: every node owned or exclusive-locked-out. Maxing the core
  // progression system deserves a beat, not a silent wall of "done" tags.
  const treeComplete = balance.research.every((d) => isOwned(d.id) || researchLockedOut(game, d.id));

  return (
    <section className="panel">
      <h2 className="panel-title">Research</h2>
      {treeComplete && (() => {
        // IDEAS #10 — frontier preprints: the tree's repeatable coda. One card,
        // rotating satirical titles, escalating cost, hard per-run cap.
        const cap = balance.preprints.maxPerRun;
        const level = game.preprints;
        if (!balance.preprints.enabled || level >= cap) {
          return (
            <p className="panel-capstone">
              {level >= cap
                ? "Reviewer 2 has surrendered — the literature is saturated. Ship the Model to run it back."
                : <>Tree complete — the field is now studying <em>you</em>. Ship the Model to run it back.</>}
            </p>
          );
        }
        const c = preprintCost(game);
        const canBuy = canBuyPreprint(game);
        const preprintWalled = !canBuy && computeWalled(c.compute);
        const eta = !canBuy && !preprintWalled
          ? Math.max(
              etaSecs(c.compute, game.resources.compute, effRate(derived, "compute")) ?? 0,
              etaSecs(c.data, game.resources.data, effRate(derived, "data")) ?? 0,
            )
          : null;
        return (
          <div className="hero-wrap">
            <div className="hero-kicker">Frontier preprints — {level}/{cap} published this run</div>
            <button
              className={`node node-hero available ${canBuy ? "affordable" : ""}`}
              disabled={!canBuy}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                burst(r.left + r.width / 2, r.top + r.height / 2, { count: 22, power: 1.1, colors: ["#9b51e0", "#2f7bf6", "#16b364"] });
                punch(e.currentTarget);
                onBuyPreprint();
              }}
            >
              <ResearchIcon kind="mult" />
              <div className="node-body">
                <div className="node-head">
                  <span className="node-name">“{preprintTitle(level)}”</span>
                </div>
                <span className="node-desc">
                  Publish a preprint: ×{balance.preprints.perLevelMult.toFixed(2)} to everything, this run. Peer review optional.
                </span>
                <span className="node-cost">
                  <span style={{ color: "var(--compute)" }}>{fmt(c.compute)} compute </span>
                  <span style={{ color: "var(--data)" }}>{fmt(c.data)} data</span>
                  {preprintWalled ? (
                    <span className="cost-eta walled" title="Auto-train is draining Compute — ease training intensity to let the bank climb">ease intensity ↓</span>
                  ) : eta != null && eta > 0 && <span className="cost-eta">~{fmtDur(eta)}</span>}
                </span>
              </div>
            </button>
          </div>
        );
      })()}
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
