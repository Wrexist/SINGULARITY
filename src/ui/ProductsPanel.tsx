import { useMemo, useState } from "react";
import type { GameState } from "../engine/types";
import { products as B, type ProductTypeId } from "../engine/balance/products";
import { productMilestones } from "../engine/balance/products";
import {
  typeDef, productMetrics, canLaunchDraft, canStartUpgrade,
  upgradeProgress, milestoneValue,
} from "../engine/products";
import { m$, numOf as num, fmtDur } from "./format";
import { ProductDetail } from "./ProductDetail";
import { EditableName } from "./EditableName";

const FUN_NAMES = ["Nimbus", "Oracle", "Synthia", "Cortex", "Lumen", "Vertex", "Sage", "Atlas", "Echo", "Prism", "Nova", "Helix", "Quasar", "Mirage"];

interface Props {
  game: GameState;
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
}

/** Phase 3 — the Products tab: commercialise the models you ship, market them, set
 *  pricing, research new versions over time, and watch the dashboard. */
export function ProductsPanel({ game, onLaunchDraft, onStartUpgrade, onSetPrice, onSetMarketing, onSetEnterprise, onSetEnterprisePrice, onSetChannelMix, onBuyFeature, onRename, onRetire }: Props) {
  // Which draft (by id) is currently showing the type-picker, if any.
  const [picking, setPicking] = useState<string | null>(null);
  // Which product's deep-management screen is open, if any.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [msOpen, setMsOpen] = useState(false);
  const ps = game.products;
  const frontier = ps.frontier;
  const slotsFull = ps.active.length >= B.maxActive;
  // One metrics pass per product (was computed up to 3× each, every 10Hz tick).
  const metrics = useMemo(
    () => new Map(ps.active.map((p) => [p.id, productMetrics(p, frontier)])),
    [ps.active, frontier],
  );
  const totalMrr = ps.active.reduce((s, p) => s + (metrics.get(p.id)?.mrr ?? 0), 0);
  const totalMargin = ps.active.reduce((s, p) => s + (metrics.get(p.id)?.margin ?? 0), 0);

  return (
    <section className="panel">
      <h2 className="panel-title">Products</h2>
      <p className="floor-meter">
        Portfolio: <b>{m$(totalMrr)}/s</b> revenue · {totalMargin >= 0 ? "+" : ""}{m$(totalMargin)}/s profit · {ps.active.length}/{B.maxActive} slots
        {ps.sold > 0 && <> · <span className="prod-sold-badge">🏷️ {ps.sold} sold</span></>}
      </p>

      {/* Raw models from Ship the Model — commercialise them into products. */}
      {ps.drafts.length > 0 && (
        <div className="prod-drafts">
          <div className="prod-drafts-head">🧪 Raw models — commercialise a model you shipped</div>
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
                        <span className="prod-type-name">{locked ? "🔒 " : ""}{t.name}</span>
                        <span className="prod-type-blurb">
                          {locked ? `Unlocks after shipping ${t.unlockAtShips} models (you've shipped ${game.prestige.ships}).` : t.blurb}
                        </span>
                      </button>
                    );
                  })}
                  <p className="market-warn">
                    Launches v1 for {num(B.releaseCost.compute)} compute · {num(B.releaseCost.data)} data.
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
        {ps.active.map((p) => {
          const t = typeDef(p.type);
          const me = metrics.get(p.id)!;
          const up = p.upgrade;
          const canVer = !up && canStartUpgrade(game, p.id);
          const qfColor = me.qf > 0.66 ? "var(--money)" : me.qf > 0.33 ? "#f97316" : "var(--coral)";
          return (
            <div className="prod-card" key={p.id}>
              <div className="prod-head">
                <EditableName className="prod-name" value={p.name} onCommit={(n) => onRename(p.id, n)} />
                <span className="prod-mrr">{m$(me.mrr)}/s</span>
              </div>
              <div className="prod-sub">
                <span className="prod-badge">{t.name}</span>
                <span className="prod-ver">v{p.version}</span>
                <span className={`prod-profit ${me.margin >= 0 ? "pos" : "neg"}`}>{me.margin >= 0 ? "+" : ""}{m$(me.margin)}/s profit</span>
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
                    <span>🔬 Researching v{up.targetVersion}</span>
                    <span>{Math.round(upgradeProgress(up) * 100)}% · ~{fmtDur(up.remainingSec)} left</span>
                  </div>
                  <div className="prod-bar">
                    <div className="prod-bar-fill prod-bar-research" style={{ width: `${upgradeProgress(up) * 100}%` }} />
                  </div>
                </div>
              ) : canVer ? (
                <div className="prod-status ready">✨ v{p.version + 1} ready to research</div>
              ) : me.qf < 0.5 ? (
                <div className="prod-status behind">📉 Falling behind — research a new version</div>
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
            🏆 Milestones <span className="prod-ms-count">{ps.milestones.length}/{productMilestones.length}</span>
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

      {detailId && (
        <ProductDetail
          game={game}
          productId={detailId}
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
        />
      )}
    </section>
  );
}
