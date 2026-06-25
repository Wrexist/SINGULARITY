import { useState } from "react";
import type { GameState } from "../engine/types";
import { products as B, type ProductTypeId } from "../engine/balance/products";
import {
  typeDef, productMetrics, canReleaseProduct, canPushVersion, versionCost,
} from "../engine/products";
import { Big } from "../engine/math/Big";
import { fmt, fmtMoney } from "./format";

const FUN_NAMES = ["Nimbus", "Oracle", "Synthia", "Cortex", "Lumen", "Vertex", "Sage", "Atlas", "Echo", "Prism", "Nova", "Helix", "Quasar", "Mirage"];

interface Props {
  game: GameState;
  onRelease: (type: ProductTypeId, name: string) => void;
  onPushVersion: (id: string) => void;
  onSetPrice: (id: string, v: number) => void;
  onSetMarketing: (id: string, v: number) => void;
  onRetire: (id: string) => void;
}

const m$ = (n: number) => fmtMoney(Big.of(Math.round(n)));
const num = (n: number) => fmt(Big.of(Math.round(n)));

/** Phase 3 — the Products tab: release AIs as products, market them, set pricing,
 *  push versions, and watch the dashboard. */
export function ProductsPanel({ game, onRelease, onPushVersion, onSetPrice, onSetMarketing, onRetire }: Props) {
  const [picking, setPicking] = useState(false);
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
      </p>

      <div className="list">
        {ps.active.map((p) => {
          const t = typeDef(p.type);
          const me = productMetrics(p, frontier);
          const vc = versionCost(p.version);
          const canVer = canPushVersion(game, p.id);
          const mktCap = Math.max(1, Math.round(p.quality * B.marketingCapPerQuality));
          const qfColor = me.qf > 0.66 ? "var(--money)" : me.qf > 0.33 ? "#f97316" : "var(--coral)";
          return (
            <div className="prod-card" key={p.id}>
              <div className="prod-head">
                <span className="prod-name">{p.name}</span>
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

              <div className="prod-actions">
                <button className="btn btn-ghost" disabled={!canVer} onClick={() => onPushVersion(p.id)}>
                  Push v{p.version + 1} · {num(vc.compute)} cpu + {num(vc.data)} data
                </button>
                <button className="link-btn" onClick={() => onRetire(p.id)}>retire</button>
              </div>
            </div>
          );
        })}
      </div>

      {!slotsFull && (picking ? (
        <div className="prod-release">
          <div className="prod-release-head">
            <span>Pick a model type</span>
            <button className="link-btn" onClick={() => setPicking(false)}>cancel</button>
          </div>
          {B.types.map((t) => {
            const afford = canReleaseProduct(game, t.id);
            return (
              <button key={t.id} className={`prod-type ${afford ? "" : "maxed"}`} disabled={!afford}
                onClick={() => { onRelease(t.id, FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)]!); setPicking(false); }}>
                <span className="prod-type-name">{t.name}</span>
                <span className="prod-type-blurb">{t.blurb}</span>
              </button>
            );
          })}
          <p className="market-warn">
            Trains v1 for {num(B.releaseCost.compute)} compute · {num(B.releaseCost.data)} data.
          </p>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setPicking(true)}>+ Release new AI</button>
      ))}
      {slotsFull && <p className="market-warn">Portfolio full ({B.maxActive}). Retire one to release another.</p>}
    </section>
  );
}
