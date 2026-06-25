import { useState } from "react";
import type { GameState } from "../engine/types";
import { products as B, type ProductTypeId } from "../engine/balance/products";
import {
  typeDef, productMetrics, canLaunchDraft, canStartUpgrade, versionCost,
  upgradeDurationSec, upgradeProgress, retirePayout,
} from "../engine/products";
import { Big } from "../engine/math/Big";
import { fmt, fmtMoney } from "./format";

const FUN_NAMES = ["Nimbus", "Oracle", "Synthia", "Cortex", "Lumen", "Vertex", "Sage", "Atlas", "Echo", "Prism", "Nova", "Helix", "Quasar", "Mirage"];

interface Props {
  game: GameState;
  onLaunchDraft: (draftId: string, type: ProductTypeId, name: string) => void;
  onStartUpgrade: (id: string) => void;
  onSetPrice: (id: string, v: number) => void;
  onSetMarketing: (id: string, v: number) => void;
  onRename: (id: string, name: string) => void;
  onRetire: (id: string) => void;
}

// Sign-aware: the magnitude goes through the K/M/B formatter and the sign sits
// OUTSIDE the $ (−$5K, not the raw ungrouped "$-5000" that overflowed the card).
const m$ = (n: number) => (n < 0 ? `-${fmtMoney(Big.of(Math.round(-n)))}` : fmtMoney(Big.of(Math.round(n))));
const num = (n: number) => fmt(Big.of(Math.round(n)));

/** Short, human duration ("90s", "3m", "1h 5m") for research timers. */
function fmtDur(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** Phase 3 — the Products tab: commercialise the models you ship, market them, set
 *  pricing, research new versions over time, and watch the dashboard. */
export function ProductsPanel({ game, onLaunchDraft, onStartUpgrade, onSetPrice, onSetMarketing, onRename, onRetire }: Props) {
  // Which draft (by id) is currently showing the type-picker, if any.
  const [picking, setPicking] = useState<string | null>(null);
  const ps = game.products;
  const frontier = ps.frontier;
  const slotsFull = ps.active.length >= B.maxActive;
  const totalMrr = ps.active.reduce((s, p) => s + productMetrics(p, frontier).mrr, 0);
  const totalMargin = ps.active.reduce((s, p) => s + productMetrics(p, frontier).margin, 0);

  return (
    <section className="panel">
      <h2 className="panel-title">Products</h2>
      <p className="floor-meter">
        Portfolio: <b>{m$(totalMrr)}/s MRR</b> · net {totalMargin >= 0 ? "+" : ""}{m$(totalMargin)}/s · {ps.active.length}/{B.maxActive} slots
        {ps.sold > 0 && <> · <span className="prod-sold-badge">🏷️ {ps.sold} sold</span></>}
      </p>

      {/* Raw models from Ship the Model — commercialise them into products. */}
      {ps.drafts.length > 0 && (
        <div className="prod-drafts">
          <div className="prod-drafts-head">🧪 Raw models — commercialise a model you shipped</div>
          {ps.drafts.map((d) => (
            <div className="prod-draft" key={d.id}>
              <div className="prod-draft-row">
                <div>
                  <div className="prod-draft-title">Model from Ship #{d.ships}</div>
                  <div className="prod-draft-sub">Starting quality {num(d.quality)} · pick a market to launch it</div>
                </div>
                {picking !== d.id && (
                  <button className="btn btn-primary btn-sm" disabled={slotsFull}
                    onClick={() => setPicking(d.id)}>
                    {slotsFull ? "Slots full" : "Launch"}
                  </button>
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
          const me = productMetrics(p, frontier);
          const up = p.upgrade;
          const vc = versionCost(p.version);
          const upfrontC = vc.compute * B.upgrade.upfrontFrac;
          const upfrontD = vc.data * B.upgrade.upfrontFrac;
          const canVer = canStartUpgrade(game, p.id);
          const mktCap = Math.max(1, Math.round(p.quality * B.marketingCapPerQuality));
          const qfColor = me.qf > 0.66 ? "var(--money)" : me.qf > 0.33 ? "#f97316" : "var(--coral)";
          return (
            <div className="prod-card" key={p.id}>
              <div className="prod-head">
                <button
                  className="prod-name"
                  onClick={() => { const n = window.prompt("Rename product", p.name); if (n && n.trim()) onRename(p.id, n); }}
                  title="Rename"
                >
                  {p.name} <span className="prod-rename">✎</span>
                </button>
                <span className="prod-mrr">{m$(me.mrr)}/s</span>
              </div>
              <div className="prod-sub">
                <span className="prod-badge">{t.name}</span>
                <span className="prod-ver">v{p.version}</span>
              </div>
              <div className="prod-stats">
                <span><b>{num(me.paid)}</b> subs</span>
                <span><b>{num(me.mau)}</b> users</span>
                <span><b>{me.churnPerMin.toFixed(1)}%</b>/min churn</span>
                <span className={me.margin >= 0 ? "pos" : "neg"}>{me.margin >= 0 ? "+" : ""}{m$(me.margin)}/s</span>
              </div>

              <div className="prod-quality">
                <div className="prod-quality-head">
                  <span>Competitiveness vs rivals</span>
                  <span>{Math.round(me.qf * 100)}%</span>
                </div>
                <div className="prod-bar"><div className="prod-bar-fill" style={{ width: `${me.qf * 100}%`, background: qfColor }} /></div>
              </div>

              <label className="prod-ctl">
                <span>Pricing ×{p.priceMult.toFixed(1)}{p.priceMult > 1 ? " (premium)" : p.priceMult < 1 ? " (value)" : ""}</span>
                <input type="range" min={Math.round(B.priceMin * 10)} max={Math.round(B.priceMax * 10)} step={1}
                  value={Math.round(p.priceMult * 10)} onChange={(e) => onSetPrice(p.id, Number(e.target.value) / 10)} aria-label="Pricing" />
              </label>
              <label className="prod-ctl">
                <span>Marketing {m$(p.marketingPerSec)}/s</span>
                <input type="range" min={0} max={mktCap} step={Math.max(1, Math.round(mktCap / 50))}
                  value={Math.min(p.marketingPerSec, mktCap)} onChange={(e) => onSetMarketing(p.id, Number(e.target.value))} aria-label="Marketing budget" />
              </label>

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
              ) : (
                <div className="prod-actions">
                  <button className="btn btn-ghost" disabled={!canVer} onClick={() => onStartUpgrade(p.id)}>
                    Research v{p.version + 1} · {num(upfrontC)}+{num(upfrontD)} upfront · ~{fmtDur(upgradeDurationSec(p.version))}
                  </button>
                  <button className="link-btn" onClick={() => onRetire(p.id)}>sell · {m$(retirePayout(game, p.id))}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
