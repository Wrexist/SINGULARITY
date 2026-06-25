import type { GameState } from "../engine/types";
import { products as B, productFeatures, type FeatureLane } from "../engine/balance/products";
import { balance } from "../engine/balance/config";
import {
  typeDef, productMetrics, canStartUpgrade, canBuyFeature, versionCost,
  upgradeDurationSec, upgradeProgress, retirePayout, rolePool,
} from "../engine/products";
import { m$, numOf as num, fmtDur } from "./format";

/** Short human label for a feature's effect lane. */
const LANE_LABEL: Record<FeatureLane, string> = {
  acq: "acquisition", arpu: "ARPU", conversion: "conversion", churn: "churn",
  serveCost: "serve cost", tam: "market size", heat: "heat",
};

interface Props {
  game: GameState;
  productId: string;
  onClose: () => void;
  onStartUpgrade: (id: string) => void;
  onSetPrice: (id: string, v: number) => void;
  onSetMarketing: (id: string, v: number) => void;
  onBuyFeature: (id: string, featureId: string) => void;
  onAssign: (id: string, roleId: string, delta: number) => void;
  onRename: (id: string, name: string) => void;
  onRetire: (id: string) => void;
}

/** "+25% conversion", "−20% churn" — the human effect of a feature factor. */
function featureEffect(lane: FeatureLane, factor: number): string {
  const pct = Math.round(Math.abs(factor - 1) * 100);
  const reduces = factor < 1;
  return `${reduces ? "−" : "+"}${pct}% ${LANE_LABEL[lane]}`;
}

/** Phase 3 — the deep, per-product management dashboard. Opens from a portfolio
 *  card: full metric breakdown, market penetration, the pricing/marketing
 *  workbench, the version-research roadmap, and retire. */
export function ProductDetail({ game, productId, onClose, onStartUpgrade, onSetPrice, onSetMarketing, onBuyFeature, onAssign, onRename, onRetire }: Props) {
  const p = game.products.active.find((x) => x.id === productId);
  if (!p) return null;
  const t = typeDef(p.type);
  const frontier = game.products.frontier;
  const me = productMetrics(p, frontier);
  const up = p.upgrade;
  const penetration = t.tam > 0 ? p.mau / t.tam : 0;
  const conversion = p.mau > 0 ? p.paid / p.mau : 0;
  const mktCap = Math.max(1, Math.round(p.quality * B.marketingCapPerQuality));
  const qfColor = me.qf > 0.66 ? "var(--money)" : me.qf > 0.33 ? "#f97316" : "var(--coral)";

  // Next few versions' research cost + duration — the upgrade roadmap.
  const roadmap = [0, 1, 2].map((i) => {
    const v = p.version + i;
    const c = versionCost(v);
    return { v: v + 1, compute: c.compute, data: c.data, sec: upgradeDurationSec(v) };
  });

  const stat = (label: string, value: string, cls = "") => (
    <div className="pd-stat"><span className={`pd-stat-v ${cls}`}>{value}</span><span className="pd-stat-l">{label}</span></div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <button className="prod-name" onClick={() => { const n = window.prompt("Rename product", p.name); if (n && n.trim()) onRename(p.id, n); }}>
            {p.name} <span className="prod-rename">✎</span>
          </button>
          <button className="link-btn" onClick={onClose}>close</button>
        </div>
        <div className="prod-sub">
          <span className="prod-badge">{t.name}</span>
          <span className="prod-ver">v{p.version}</span>
        </div>
        <p className="pd-blurb">{t.blurb}</p>

        <div className="pd-grid">
          {stat("MRR", `${m$(me.mrr)}/s`)}
          {stat("Net margin", `${me.margin >= 0 ? "+" : ""}${m$(me.margin)}/s`, me.margin >= 0 ? "pos" : "neg")}
          {stat("Paying subs", num(me.paid))}
          {stat("Monthly users", num(me.mau))}
          {stat("Conversion", `${(conversion * 100).toFixed(1)}%`)}
          {stat("Churn", `${me.churnPerMin.toFixed(1)}%/min`)}
          {stat("ARPU", `${m$(me.arpu)}/s`)}
          {stat("Serving cost", `${m$(me.serve)}/s`)}
        </div>

        <div className="prod-quality">
          <div className="prod-quality-head"><span>Competitiveness vs rivals</span><span>{Math.round(me.qf * 100)}%</span></div>
          <div className="prod-bar"><div className="prod-bar-fill" style={{ width: `${me.qf * 100}%`, background: qfColor }} /></div>
        </div>
        <div className="prod-quality">
          <div className="prod-quality-head"><span>Market penetration (of TAM {num(t.tam)})</span><span>{(penetration * 100).toFixed(penetration < 0.01 ? 2 : 1)}%</span></div>
          <div className="prod-bar"><div className="prod-bar-fill" style={{ width: `${Math.min(100, penetration * 100)}%`, background: "var(--data)" }} /></div>
        </div>

        <label className="prod-ctl">
          <span>Pricing ×{p.priceMult.toFixed(1)}{p.priceMult > 1 ? " (premium — more $/user, fewer convert)" : p.priceMult < 1 ? " (value — cheaper, more convert)" : ""}</span>
          <input type="range" min={Math.round(B.priceMin * 10)} max={Math.round(B.priceMax * 10)} step={1}
            value={Math.round(p.priceMult * 10)} onChange={(e) => onSetPrice(p.id, Number(e.target.value) / 10)} aria-label="Pricing" />
        </label>
        <label className="prod-ctl">
          <span>Marketing {m$(p.marketingPerSec)}/s {p.marketingPerSec >= mktCap ? "(at quality cap)" : ""}</span>
          <input type="range" min={0} max={mktCap} step={Math.max(1, Math.round(mktCap / 50))}
            value={Math.min(p.marketingPerSec, mktCap)} onChange={(e) => onSetMarketing(p.id, Number(e.target.value))} aria-label="Marketing budget" />
        </label>

        {(() => {
          const roles = balance.staff.roles.filter((r) => r.effect.kind === "product");
          const shown = roles.filter((r) => (game.upgrades[r.id] ?? 0) > 0);
          if (shown.length === 0) return null;
          return (
            <>
              <div className="pd-section-head">Assigned team — focused employees buff only this product (2×)</div>
              <div className="pd-team">
                {shown.map((r) => {
                  const here = game.products.assignments[p.id]?.[r.id] ?? 0;
                  const pool = rolePool(game, r.id);
                  return (
                    <div className="pd-team-row" key={r.id}>
                      <span className="pd-team-name">{r.name}</span>
                      <span className="pd-team-pool">{pool} free</span>
                      <div className="pd-team-step">
                        <button disabled={here <= 0} onClick={() => onAssign(p.id, r.id, -1)} aria-label={`Unassign ${r.name}`}>−</button>
                        <span>{here}</span>
                        <button disabled={pool <= 0} onClick={() => onAssign(p.id, r.id, 1)} aria-label={`Assign ${r.name}`}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        <div className="pd-section-head">Version research</div>
        {up ? (
          <div className="prod-research">
            <div className="prod-research-head">
              <span>🔬 Researching v{up.targetVersion}</span>
              <span>{Math.round(upgradeProgress(up) * 100)}% · ~{fmtDur(up.remainingSec)} left</span>
            </div>
            <div className="prod-bar"><div className="prod-bar-fill prod-bar-research" style={{ width: `${upgradeProgress(up) * 100}%` }} /></div>
          </div>
        ) : (
          <button className="btn btn-ghost" disabled={!canStartUpgrade(game, p.id)} onClick={() => onStartUpgrade(p.id)}>
            Research v{p.version + 1} · {num(roadmap[0]!.compute * B.upgrade.upfrontFrac)}+{num(roadmap[0]!.data * B.upgrade.upfrontFrac)} upfront · ~{fmtDur(roadmap[0]!.sec)}
          </button>
        )}
        <div className="pd-roadmap">
          {roadmap.map((r) => (
            <div className="pd-roadmap-row" key={r.v}>
              <span>v{r.v}</span>
              <span>{num(r.compute)} cpu · {num(r.data)} data</span>
              <span>~{fmtDur(r.sec)}</span>
            </div>
          ))}
        </div>

        <div className="pd-section-head">Features — invest Money to perfect this product</div>
        <div className="pd-features">
          {productFeatures.map((f) => {
            const owned = p.features.includes(f.id);
            const afford = canBuyFeature(game, p.id, f.id);
            return (
              <button key={f.id} className={`pd-feature ${owned ? "owned" : ""}`} disabled={owned || !afford}
                onClick={() => onBuyFeature(p.id, f.id)}>
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

        <div className="pd-foot">
          <button className="link-btn" onClick={() => { onRetire(p.id); onClose(); }}>
            Sell this product · {m$(retirePayout(game, p.id))}
          </button>
        </div>
      </div>
    </div>
  );
}
