import { useEffect, useMemo, useState } from "react";
import type { GameState, Derived } from "../engine/types";
import { products as B, type ProductTypeId } from "../engine/balance/products";
import { productMilestones } from "../engine/balance/products";
import { marketLeaderboard, playerMarketRank, canCounterRival, counterCost, counterCooldownRemaining } from "../engine/market";
import { market as MKT } from "../engine/balance/market";
import {
  typeDef, productMetrics, canLaunchDraft, canStartUpgrade,
  upgradeProgress, milestoneValue, maxActiveProducts,
} from "../engine/products";
import { m$, numOf as num, fmtDur } from "./format";
import { ProductDetail, TYPE_GLYPH } from "./ProductDetail";
import { EditableName } from "./EditableName";
import { TagIcon, AtomIcon, LockIcon, SparkIcon, TrendDownIcon, TrophyIcon, BarsIcon, AlertTriangleIcon, BoltIcon } from "./Icons";

const FUN_NAMES = ["Nimbus", "Oracle", "Synthia", "Cortex", "Lumen", "Vertex", "Sage", "Atlas", "Echo", "Prism", "Nova", "Helix", "Quasar", "Mirage"];

interface Props {
  game: GameState;
  derived: Derived;
  onLaunchDraft: (draftId: string, type: ProductTypeId, name: string) => void;
  onStartUpgrade: (id: string) => void;
  onSetPrice: (id: string, v: number) => void;
  onSetMarketing: (id: string, v: number) => void;
  onSetEnterprise: (id: string, on: boolean) => void;
  onSetEnterprisePrice: (id: string, v: number) => void;
  onSetChannelMix: (id: string, channelId: string, weight: number) => void;
  onBuyFeature: (id: string, featureId: string) => void;
  onRename: (id: string, name: string) => void;
  onRetire: (id: string) => void;
  onSetFlagship: (id: string | null) => void;
  onCounterRival: (name: string) => void;
}

/** Phase 3 — the Products tab: commercialise the models you ship, market them, set
 *  pricing, research new versions over time, and watch the dashboard. */
export function ProductsPanel({ game, derived, onLaunchDraft, onStartUpgrade, onSetPrice, onSetMarketing, onSetEnterprise, onSetEnterprisePrice, onSetChannelMix, onBuyFeature, onRename, onRetire, onSetFlagship, onCounterRival }: Props) {
  // Which draft (by id) is currently showing the type-picker, if any.
  const [picking, setPicking] = useState<string | null>(null);
  // Which product's deep-management screen is open, if any. If that product
  // disappears (sold via the confirm flow, which no longer closes the sheet
  // itself), drop the id so the sheet unmounts cleanly — otherwise a stale
  // ProductDetail lingers with its Escape listener still registered.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailGone = detailId != null && !game.products.active.some((p) => p.id === detailId);
  useEffect(() => {
    if (detailGone) setDetailId(null);
  }, [detailGone]);
  const [msOpen, setMsOpen] = useState(false);
  // Collapsed by default (like Milestones) — the leaderboard is reference, not a
  // control, and open-by-default it pushed a tall block under every product card.
  const [mktOpen, setMktOpen] = useState(false);
  const ps = game.products;
  const board = useMemo(() => marketLeaderboard(game).slice(0, 8), [game.products.active, game.products.frontier, game.rivalOps]);
  const myRank = playerMarketRank(game);
  const frontier = ps.frontier;
  const maxSlots = maxActiveProducts(game);
  const slotsFull = ps.active.length >= maxSlots;
  // One metrics pass per product (was computed up to 3× each, every 10Hz tick).
  // Mods-aware: the cards now reflect staff assignment + heat/faction buffs, so
  // assigning a Sales Exec or SRE visibly moves Revenue/s and Profit/s.
  const modsById = derived.productModsById;
  const metrics = useMemo(
    () => new Map(ps.active.map((p) => [p.id, productMetrics(p, frontier, modsById[p.id])])),
    [ps.active, frontier, modsById],
  );
  const totalMrr = ps.active.reduce((s, p) => s + (metrics.get(p.id)?.mrr ?? 0), 0);
  const totalMargin = ps.active.reduce((s, p) => s + (metrics.get(p.id)?.margin ?? 0), 0);
  // Portfolio health (C1): a product needs attention if it's losing money or falling
  // behind the frontier. Float the bleeders to the top so problems are seen first —
  // sorted by margin-sign only (a stable signal), so the list doesn't jitter at 10Hz.
  const needsAttention = (p: typeof ps.active[number]) => {
    const m = metrics.get(p.id);
    return !!m && (m.margin < 0 || m.qf < 0.5);
  };
  const attentionCount = ps.active.filter(needsAttention).length;
  const sortedActive = useMemo(() => {
    return [...ps.active].sort((a, b) => {
      const ma = (metrics.get(a.id)?.margin ?? 0) < 0 ? 0 : 1;
      const mb = (metrics.get(b.id)?.margin ?? 0) < 0 ? 0 : 1;
      return ma - mb; // bleeders (0) first; stable within each group preserves order
    });
  }, [ps.active, metrics]);

  return (
    <section className="panel">
      <h2 className="panel-title">Products</h2>
      <p className="floor-meter">
        Portfolio: <b>{m$(totalMrr)}/s</b> revenue · {totalMargin >= 0 ? "+" : ""}{m$(totalMargin)}/s profit · {ps.active.length}/{maxSlots} slots
        {ps.sold > 0 && <> · <span className="prod-sold-badge"><TagIcon size={12} /> {ps.sold} sold</span></>}
        {attentionCount > 0 && <> · <span className="prod-attention-badge"><AlertTriangleIcon size={12} /> {attentionCount} need{attentionCount === 1 ? "s" : ""} attention</span></>}
      </p>

      {/* Raw models from Ship the Model — commercialise them into products. */}
      {ps.drafts.length > 0 && (
        <div className="prod-drafts">
          <div className="prod-drafts-head"><AtomIcon size={15} /> Raw models — commercialise a model you shipped</div>
          {ps.drafts.map((d) => (
            <div className="prod-draft" key={d.id}>
              <div className="prod-draft-row">
                <div className="prod-draft-main">
                  <div className="prod-draft-title">Shipped model #{d.ships}</div>
                  <div className="prod-draft-sub">Quality {num(d.quality)} · pick a market to launch</div>
                </div>
                {picking !== d.id && (
                  slotsFull
                    ? <span className="prod-draft-full">Slots full</span>
                    : <button className="btn btn-primary btn-sm prod-draft-btn" onClick={() => setPicking(d.id)}>Launch</button>
                )}
              </div>

              {picking === d.id && (
                <div className="prod-release">
                  <div className="prod-release-head">
                    <span>Pick a market for this model</span>
                    <button className="link-btn" onClick={() => setPicking(null)}>cancel</button>
                  </div>
                  {B.types.map((t) => {
                    const locked = game.prestige.ships < t.unlockAtShips;
                    const afford = canLaunchDraft(game, d.id, t.id);
                    return (
                      <button key={t.id} className={`prod-type ${afford ? "" : "maxed"}`} disabled={!afford}
                        onClick={() => { onLaunchDraft(d.id, t.id, FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)]!); setPicking(null); }}>
                        <span className="prod-type-name">{locked && <LockIcon size={13} />}{t.name}</span>
                        <span className="prod-type-blurb">
                          {locked ? `Unlocks after shipping ${t.unlockAtShips} models (you've shipped ${game.prestige.ships}).` : t.blurb}
                        </span>
                      </button>
                    );
                  })}
                  <p className="market-warn">
                    Launches instantly — free. You earned this model by shipping.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ps.active.length === 0 && ps.drafts.length === 0 && (
        <p className="market-warn">Ship a model in the Lab to get a raw model you can turn into a product.</p>
      )}

      <div className="list">
        {sortedActive.map((p) => {
          const t = typeDef(p.type);
          const me = metrics.get(p.id)!;
          const up = p.upgrade;
          const canVer = !up && canStartUpgrade(game, p.id);
          const qfColor = me.qf > 0.66 ? "var(--money)" : me.qf > 0.33 ? "#f97316" : "var(--coral)";
          return (
            <div className="prod-card" key={p.id}>
              <div className="prod-head">
                <span className="prod-icon">{TYPE_GLYPH[p.type] ?? <SparkIcon size={20} />}</span>
                <div className="prod-head-text">
                  <div className="prod-head-row">
                    <EditableName className="prod-name" value={p.name} onCommit={(n) => onRename(p.id, n)} />
                    <span className="prod-mrr">
                      {me.mrr > 0 && <span className="prod-live" title="Earning now" />}
                      {m$(me.mrr)}/s
                    </span>
                  </div>
                  <div className="prod-sub">
                    <span className="prod-badge">{t.name}</span>
                    <span className="prod-ver">v{p.version}</span>
                    <span className={`prod-profit ${me.margin >= 0 ? "pos" : "neg"}`}>{me.margin >= 0 ? "+" : ""}{m$(me.margin)}/s profit</span>
                  </div>
                </div>
              </div>
              <div className="prod-stats">
                <div className="prod-stat"><b>{num(me.paid)}</b><span>paying</span></div>
                <div className="prod-stat"><b>{num(me.mau)}</b><span>users</span></div>
              </div>

              <div className="prod-quality">
                <div className="prod-quality-head">
                  <span>Competitiveness</span>
                  <span>{Math.round(me.qf * 100)}%</span>
                </div>
                <div className="prod-bar"><div className="prod-bar-fill" style={{ width: `${me.qf * 100}%`, background: qfColor }} /></div>
              </div>

              {up ? (
                <div className="prod-research">
                  <div className="prod-research-head">
                    <span className="prod-inline-ic"><AtomIcon size={13} /> Researching v{up.targetVersion}</span>
                    <span>{Math.round(upgradeProgress(up) * 100)}% · ~{fmtDur(up.remainingSec)} left</span>
                  </div>
                  <div className="prod-bar">
                    <div className="prod-bar-fill prod-bar-research" style={{ width: `${upgradeProgress(up) * 100}%` }} />
                  </div>
                </div>
              ) : canVer ? (
                <div className="prod-status ready"><SparkIcon size={13} /> v{p.version + 1} ready to research</div>
              ) : me.qf < 0.5 ? (
                <div className="prod-status behind"><TrendDownIcon size={13} /> Falling behind — research a new version</div>
              ) : null}

              <button className="prod-manage" onClick={() => setDetailId(p.id)}>
                <span className="prod-manage-main">Manage product</span>
                <span className="prod-manage-sub">pricing · marketing · research · upgrades</span>
              </button>
            </div>
          );
        })}
      </div>

      {ps.active.length + ps.milestones.length > 0 && (
        <div className="prod-milestones">
          <button className="prod-ms-head" onClick={() => setMsOpen((o) => !o)} aria-expanded={msOpen}>
            <span className="prod-ms-title"><TrophyIcon size={15} /> Milestones</span> <span className="prod-ms-count">{ps.milestones.length}/{productMilestones.length}</span>
            <span className="prod-ms-toggle">{msOpen ? "▾" : "▸"}</span>
          </button>
          {msOpen && (
            <div className="prod-ms-grid">
              {productMilestones.map((mDef) => {
                const done = ps.milestones.includes(mDef.id);
                const val = milestoneValue(game, mDef.metric);
                const pct = Math.max(0, Math.min(1, val / mDef.threshold));
                return (
                  <div className={`prod-ms ${done ? "done" : ""}`} key={mDef.id} title={mDef.desc}>
                    <div className="prod-ms-top">
                      <span className="prod-ms-name">{done ? "✓ " : ""}{mDef.label}</span>
                      <span className="prod-ms-reward">+{m$(mDef.reward)}</span>
                    </div>
                    <div className="prod-ms-desc">{mDef.desc}</div>
                    {!done && <div className="prod-bar prod-ms-bar"><div className="prod-bar-fill" style={{ width: `${pct * 100}%`, background: "var(--data)" }} /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="market-board">
        <button className="prod-ms-head" onClick={() => setMktOpen((o) => !o)} aria-expanded={mktOpen}>
          <span className="prod-ms-title"><BarsIcon size={15} /> Top AIs on the market</span>
          {myRank != null && <span className="prod-ms-count">you're #{myRank}</span>}
          <span className="prod-ms-toggle">{mktOpen ? "▾" : "▸"}</span>
        </button>
        {mktOpen && (
          <div className="market-list">
            {board.map((e, i) => {
              // Counterplay (IMPROVEMENTS #8): rivals AHEAD of you can be hit
              // with a press blitz — money for race position, nothing else.
              const myBest = board.find((b) => b.isYou)?.users ?? 0;
              const strikes = e.isYou ? 0 : (game.rivalOps.strikes[e.name] ?? 0);
              const targetable = !e.isYou && MKT.counterplay.enabled && game.products.active.length > 0
                && e.users > myBest && strikes < MKT.counterplay.maxStrikesPerRival;
              const cooldown = Math.ceil(counterCooldownRemaining(game));
              const cost = targetable ? counterCost(game, e.name) : 0;
              const ready = targetable && canCounterRival(game, e.name);
              return (
                <div className={`market-row ${e.isYou ? "you" : ""}`} key={`${e.name}-${i}`}>
                  <span className="market-rank">{i + 1}</span>
                  <div className="market-main">
                    <div className="market-top">
                      <span className="market-name">{e.name}{strikes > 0 && <span className="market-struck" title="Press blitzes landed this run"><BoltIcon size={11} />×{strikes}</span>}</span>
                      <span className="market-share">{(e.share * 100).toFixed(e.share < 0.01 ? 2 : 1)}%</span>
                    </div>
                    <div className="market-bar"><div className="market-bar-fill" style={{ width: `${Math.min(100, e.share * 100)}%` }} /></div>
                    <span className="market-vendor">{e.isYou ? "Your lab" : e.vendor} · {num(e.users)} users</span>
                    {e.reaction && <span className="market-reaction">{e.reaction}</span>}
                    {targetable && (
                      <button
                        className="btn btn-ghost btn-sm market-blitz"
                        disabled={!ready}
                        title={cooldown > 0 ? `The press cycle resets in ${cooldown}s` : undefined}
                        onClick={() => onCounterRival(e.name)}
                      >
                        <BoltIcon size={12} /> {cooldown > 0 ? `Press blitz — ready in ${cooldown}s` : `Press blitz — ${m$(cost)}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {detailId && (
        <ProductDetail
          game={game}
          productId={detailId}
          mods={modsById[detailId]}
          onClose={() => setDetailId(null)}
          onStartUpgrade={onStartUpgrade}
          onSetPrice={onSetPrice}
          onSetMarketing={onSetMarketing}
          onSetEnterprise={onSetEnterprise}
          onSetEnterprisePrice={onSetEnterprisePrice}
          onSetChannelMix={onSetChannelMix}
          onBuyFeature={onBuyFeature}
          onRename={onRename}
          onRetire={onRetire}
          onSetFlagship={onSetFlagship}
        />
      )}
    </section>
  );
}
