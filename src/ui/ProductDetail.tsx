import { useState } from "react";
import type { GameState } from "../engine/types";
import { products as B, productFeatures, type FeatureLane } from "../engine/balance/products";
import {
  typeDef, productMetrics, canStartUpgrade, canBuyFeature, versionCost,
  upgradeDurationSec, upgradeProgress, retirePayout, enterpriseUnlocked, suggestChannelMix,
} from "../engine/products";
import { m$, numOf as num, fmtDur } from "./format";
import { EditableName } from "./EditableName";

/** Short human label for a feature's effect lane. */
const LANE_LABEL: Record<FeatureLane, string> = {
  acq: "new users", arpu: "revenue/user", conversion: "conversion", churn: "users leaving",
  serveCost: "serve cost", tam: "market size", heat: "heat",
};

interface Props {
  game: GameState;
  productId: string;
  onClose: () => void;
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

function featureEffect(lane: FeatureLane, factor: number): string {
  const pct = Math.round(Math.abs(factor - 1) * 100);
  return `${factor < 1 ? "−" : "+"}${pct}% ${LANE_LABEL[lane]}`;
}

type Tab = "overview" | "pricing" | "marketing" | "upgrades";

/** Phase 3 — per-product management, organised into focused tabs so new players see
 *  a simple Overview first and only meet the deep knobs when they go looking. */
export function ProductDetail({ game, productId, onClose, onStartUpgrade, onSetPrice, onSetMarketing, onSetEnterprise, onSetEnterprisePrice, onSetChannelMix, onBuyFeature, onRename, onRetire }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const p = game.products.active.find((x) => x.id === productId);
  if (!p) return null;
  const t = typeDef(p.type);
  const frontier = game.products.frontier;
  const me = productMetrics(p, frontier);
  const up = p.upgrade;
  const penetration = t.tam > 0 ? p.mau / t.tam : 0;
  const mktCap = Math.max(1, Math.round(p.quality * B.marketingCapPerQuality));
  const qfColor = me.qf > 0.66 ? "var(--money)" : me.qf > 0.33 ? "#f97316" : "var(--coral)";
  const crew = game.employees.filter((e) => e.assignedProductId === p.id);

  const stat = (label: string, value: string, cls = "") => (
    <div className="pd-stat"><span className={`pd-stat-v ${cls}`}>{value}</span><span className="pd-stat-l">{label}</span></div>
  );
  const bar = (label: string, pct: number, color: string, right: string) => (
    <div className="prod-quality">
      <div className="prod-quality-head"><span>{label}</span><span>{right}</span></div>
      <div className="prod-bar"><div className="prod-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>
    </div>
  );

  // The headline action: research the next version (or show its progress).
  const researchCta = up ? (
    <div className="prod-research">
      <div className="prod-research-head">
        <span>🔬 Researching v{up.targetVersion}</span>
        <span>{Math.round(upgradeProgress(up) * 100)}% · ~{fmtDur(up.remainingSec)} left</span>
      </div>
      <div className="prod-bar"><div className="prod-bar-fill prod-bar-research" style={{ width: `${upgradeProgress(up) * 100}%` }} /></div>
    </div>
  ) : (
    <button className="btn btn-primary pd-research-btn" disabled={!canStartUpgrade(game, p.id)} onClick={() => onStartUpgrade(p.id)}>
      Research v{p.version + 1}
      <span className="pd-cta-sub">{num(versionCost(p.version).compute * B.upgrade.upfrontFrac)}+{num(versionCost(p.version).data * B.upgrade.upfrontFrac)} upfront · ~{fmtDur(upgradeDurationSec(p.version))}</span>
    </button>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <div>
            <EditableName className="prod-name" value={p.name} onCommit={(n) => onRename(p.id, n)} />
            <div className="prod-sub"><span className="prod-badge">{t.name}</span><span className="prod-ver">v{p.version}</span></div>
          </div>
          <button className="link-btn" onClick={onClose}>close</button>
        </div>

        <div className="pd-tabs" role="tablist">
          {(["overview", "pricing", "marketing", "upgrades"] as Tab[]).map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`pd-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
              {id === "overview" ? "Overview" : id === "pricing" ? "Pricing" : id === "marketing" ? "Marketing" : "Upgrades"}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="pd-pane">
            <div className="pd-grid">
              {stat("Revenue/s", `${m$(me.mrr)}/s`)}
              {stat("Profit/s", `${me.margin >= 0 ? "+" : ""}${m$(me.margin)}/s`, me.margin >= 0 ? "pos" : "neg")}
              {stat("Paying users", num(me.paid))}
              {stat("Total users", num(me.mau))}
            </div>
            {bar("Competitiveness vs rivals", me.qf * 100, qfColor, `${Math.round(me.qf * 100)}%`)}
            {bar(`Market share (of ${num(t.tam)})`, penetration * 100, "var(--data)", `${(penetration * 100).toFixed(penetration < 0.01 ? 2 : 1)}%`)}
            {me.qf < 0.5 && <p className="pd-hint">📉 Rivals are pulling ahead — research a new version to catch up.</p>}
            {researchCta}
            {crew.length > 0 && (
              <div className="pd-crew">{crew.map((e) => <span className="pd-crew-chip" key={e.id}>{e.name} · L{e.level}</span>)}</div>
            )}
            <div className="pd-foot">
              <button className="link-btn" onClick={() => { onRetire(p.id); onClose(); }}>Sell this product · {m$(retirePayout(game, p.id))}</button>
            </div>
          </div>
        )}

        {tab === "pricing" && (
          <div className="pd-pane">
            <p className="pd-pane-tip">Higher prices earn more per user but fewer convert. Free users are everyone who hasn't paid.</p>
            <label className="prod-ctl">
              <span>Pro price ×{p.priceMult.toFixed(1)}{p.priceMult > 1 ? " — premium" : p.priceMult < 1 ? " — value" : ""}</span>
              <input type="range" min={Math.round(B.priceMin * 10)} max={Math.round(B.priceMax * 10)} step={1}
                value={Math.round(p.priceMult * 10)} onChange={(e) => onSetPrice(p.id, Number(e.target.value) / 10)} aria-label="Pro pricing" />
            </label>
            {enterpriseUnlocked(game) ? (
              <div className="pd-tier">
                <label className="pd-tier-head">
                  <input type="checkbox" checked={p.enterprise} onChange={(e) => onSetEnterprise(p.id, e.target.checked)} />
                  <span>Enterprise tier {p.enterprise ? "— open" : "— closed"}</span>
                </label>
                {p.enterprise && (
                  <label className="prod-ctl">
                    <span>Enterprise price ×{p.enterprisePrice.toFixed(1)} — small slice, ~{B.enterprise.arpuMult}× revenue/user</span>
                    <input type="range" min={Math.round(B.enterprise.priceMin * 10)} max={Math.round(B.enterprise.priceMax * 10)} step={1}
                      value={Math.round(p.enterprisePrice * 10)} onChange={(e) => onSetEnterprisePrice(p.id, Number(e.target.value) / 10)} aria-label="Enterprise pricing" />
                  </label>
                )}
              </div>
            ) : (
              <p className="market-warn">🔒 Enterprise tier unlocks after shipping {B.enterprise.unlockShips} models.</p>
            )}
          </div>
        )}

        {tab === "marketing" && (
          <div className="pd-pane">
            <p className="pd-pane-tip">Set your total budget, then split it across channels. Cheap channels saturate fast — diversify as you grow.</p>
            <label className="prod-ctl">
              <span>Budget {m$(p.marketingPerSec)}/s {p.marketingPerSec >= mktCap ? "(at quality cap)" : ""}</span>
              <input type="range" min={0} max={mktCap} step={Math.max(1, Math.round(mktCap / 50))}
                value={Math.min(p.marketingPerSec, mktCap)} onChange={(e) => onSetMarketing(p.id, Number(e.target.value))} aria-label="Marketing budget" />
            </label>
            <div className="pd-mix-head">
              <span>Channel split</span>
              <button className="link-btn" onClick={() => { const mix = suggestChannelMix(p, t); for (const c of B.channels) onSetChannelMix(p.id, c.id, mix[c.id] ?? 0); }}>
                ✨ Suggest mix
              </button>
            </div>
            {(() => {
              const totalW = B.channels.reduce((s, c) => s + Math.max(0, p.channelMix[c.id] ?? 0), 0) || 1;
              return B.channels.map((c) => {
                const w = Math.max(0, p.channelMix[c.id] ?? 0);
                return (
                  <label className="prod-ctl" key={c.id}>
                    <span>{c.name} · {Math.round((w / totalW) * 100)}% <span className="pd-ch-desc">{c.desc}</span></span>
                    <input type="range" min={0} max={100} step={5}
                      value={Math.round(w * 100)} onChange={(e) => onSetChannelMix(p.id, c.id, Number(e.target.value) / 100)} aria-label={`${c.name} weight`} />
                  </label>
                );
              });
            })()}
          </div>
        )}

        {tab === "upgrades" && (
          <div className="pd-pane">
            <p className="pd-pane-tip">One-time Money investments that permanently improve this product.</p>
            <div className="pd-features">
              {productFeatures.map((f) => {
                const owned = p.features.includes(f.id);
                const afford = canBuyFeature(game, p.id, f.id);
                return (
                  <button key={f.id} className={`pd-feature ${owned ? "owned" : ""}`} disabled={owned || !afford} onClick={() => onBuyFeature(p.id, f.id)}>
                    <div className="pd-feature-main">
                      <span className="pd-feature-name">{owned ? "✓ " : ""}{f.name}</span>
                      <span className="pd-feature-desc">{f.desc}</span>
                      <span className="pd-feature-fx">{featureEffect(f.lane, f.factor)}</span>
                    </div>
                    <span className="pd-feature-cost">{owned ? "owned" : m$(f.cost)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
