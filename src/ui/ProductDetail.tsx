import { useEffect, useState } from "react";
import { Portal } from "./Portal";
import type { GameState } from "../engine/types";
import { products as B, productFeatures, type FeatureLane, type ProductTypeId } from "../engine/balance/products";
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

/** Glyph shown in the header app-icon, per product type. Shared with the list. */
export const TYPE_GLYPH: Record<ProductTypeId, string> = {
  general: "💬", code: "⌘", reasoning: "🧠", multimodal: "🎨", small: "⚡", domain: "⚖️",
  companion: "💞", science: "🔬",
};

/** Tinted icon chip per marketing channel (matches the design's coloured glyphs). */
const CH_META: Record<string, { glyph: string; tint: string }> = {
  ads: { glyph: "📣", tint: "#7c5cff" },
  organic: { glyph: "🌱", tint: "#16b364" },
  influencer: { glyph: "👤", tint: "#ff8c42" },
  events: { glyph: "🎤", tint: "#2f7bf6" },
};

/** Small monochrome tab icons (colour via currentColor). */
const TAB_ICON: Record<Tab, JSX.Element> = {
  overview: <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" /><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" /><rect x="9" y="9" width="5.5" height="5.5" rx="1.5" /></svg>,
  pricing: <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6.3" /><path d="M8 4.4v7.2M10 6.1c0-.9-.9-1.5-2-1.5s-2 .6-2 1.5.9 1.4 2 1.5 2 .6 2 1.5-.9 1.5-2 1.5-2-.6-2-1.5" /></svg>,
  marketing: <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1.5" y="9" width="3" height="5.5" rx="1" /><rect x="6.5" y="5" width="3" height="9.5" rx="1" /><rect x="11.5" y="2" width="3" height="12.5" rx="1" /></svg>,
  upgrades: <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.92L8 10.56l-3.52 1.85.67-3.92L2.3 5.64l3.94-.57z" /></svg>,
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
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "pricing", label: "Pricing" },
  { id: "marketing", label: "Marketing" }, { id: "upgrades", label: "Upgrades" },
];

/** Purple-filled slider track up to `pct` (0..100), matching the design. */
const fill = (pct: number) => ({ background: `linear-gradient(90deg, #7c5cff 0%, #7c5cff ${pct}%, #e7e4f3 ${pct}%, #e7e4f3 100%)` });

/** Phase 3 — per-product management, redesigned into a clean, soft, card-based sheet
 *  (icon chips, segmented tabs, purple accent) so the depth stays legible. */
export function ProductDetail({ game, productId, onClose, onStartUpgrade, onSetPrice, onSetMarketing, onSetEnterprise, onSetEnterprisePrice, onSetChannelMix, onBuyFeature, onRename, onRetire }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  const statCard = (label: string, value: string, cls = "") => (
    <div className="pd-stat"><span className={`pd-stat-v ${cls}`}>{value}</span><span className="pd-stat-l">{label}</span></div>
  );
  const barCard = (label: string, pct: number, color: string, right: string) => (
    <div className="pd-card">
      <div className="pd-card-row"><span className="pd-card-label">{label}</span><span className="pd-card-value" style={{ color }}>{right}</span></div>
      <div className="pd-track"><div className="pd-track-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>
    </div>
  );
  const info = (glyph: string, title: string, sub: string) => (
    <div className="pd-info-card">
      <span className="pd-info-ic">{glyph}</span>
      <div><div className="pd-info-title">{title}</div><div className="pd-info-sub">{sub}</div></div>
    </div>
  );

  // Portal to <body> so the fixed backdrop overlays the true viewport — never
  // trapped/clipped by an ancestor's containing block (panels carry filters).
  return (
    <Portal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal pd-modal" role="dialog" aria-modal="true" aria-label={`${p.name} — manage`} onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <div className="pd-head-id">
            <span className="pd-app-icon">{TYPE_GLYPH[p.type] ?? "✦"}</span>
            <div className="pd-head-text">
              <div className="pd-title-row">
                <EditableName className="pd-name" value={p.name} onCommit={(n) => onRename(p.id, n)} />
                <span className="pd-ver-pill">v{p.version}</span>
              </div>
              <span className="pd-type-tag">{t.name}</span>
            </div>
          </div>
          <button className="pd-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pd-tabs" role="tablist">
          {TABS.map(({ id, label }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`pd-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
              <span className="pd-tab-ic">{TAB_ICON[id]}</span>{label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="pd-pane">
            <div className="pd-grid">
              {statCard("Revenue /s", `${m$(me.mrr)}/s`)}
              {statCard("Profit /s", `${me.margin >= 0 ? "+" : ""}${m$(me.margin)}/s`, me.margin >= 0 ? "pos" : "neg")}
              {statCard("Paying users", num(me.paid))}
              {statCard("Total users", num(me.mau))}
            </div>
            {barCard("Competitiveness vs rivals", me.qf * 100, qfColor, `${Math.round(me.qf * 100)}%`)}
            {barCard(`Market share (of ${num(t.tam)})`, penetration * 100, "var(--data)", `${(penetration * 100).toFixed(penetration < 0.01 ? 2 : 1)}%`)}
            {me.qf < 0.5 && <p className="pd-hint">📉 Rivals are pulling ahead — research a new version to catch up.</p>}
            {up ? (
              <div className="pd-card">
                <div className="pd-card-row"><span className="pd-card-label">🔬 Researching v{up.targetVersion}</span><span className="pd-card-value">{Math.round(upgradeProgress(up) * 100)}% · ~{fmtDur(up.remainingSec)}</span></div>
                <div className="pd-track"><div className="pd-track-fill" style={{ width: `${upgradeProgress(up) * 100}%`, background: "#7c5cff" }} /></div>
              </div>
            ) : (
              <button className="pd-primary" disabled={!canStartUpgrade(game, p.id)} onClick={() => onStartUpgrade(p.id)}>
                <span>Research v{p.version + 1}</span>
                <span className="pd-primary-sub">{num(versionCost(p.version).compute * B.upgrade.upfrontFrac)}+{num(versionCost(p.version).data * B.upgrade.upfrontFrac)} upfront · ~{fmtDur(upgradeDurationSec(p.version))}</span>
              </button>
            )}
            {crew.length > 0 && (
              <div className="pd-crew">{crew.map((e) => <span className="pd-crew-chip" key={e.id}>{e.name.split(" ")[0]} · L{e.level}</span>)}</div>
            )}
            <button className="pd-sell" onClick={() => { onRetire(p.id); onClose(); }}>Sell this product · {m$(retirePayout(game, p.id))}</button>
          </div>
        )}

        {tab === "pricing" && (
          <div className="pd-pane">
            {info("💲", "Pricing strategy", "Higher prices earn more per user but fewer convert. Free users are everyone who hasn't paid.")}
            <div className="pd-card">
              <div className="pd-card-row">
                <span className="pd-card-label">Pro price</span>
                <span className="pd-card-value">×{p.priceMult.toFixed(1)}{p.priceMult > 1 ? " · premium" : p.priceMult < 1 ? " · value" : ""}</span>
              </div>
              <input className="pd-slider" type="range" min={Math.round(B.priceMin * 10)} max={Math.round(B.priceMax * 10)} step={1}
                style={fill(((p.priceMult - B.priceMin) / (B.priceMax - B.priceMin)) * 100)}
                value={Math.round(p.priceMult * 10)} onChange={(e) => onSetPrice(p.id, Number(e.target.value) / 10)} aria-label="Pro pricing" />
            </div>
            {enterpriseUnlocked(game) ? (
              <div className="pd-card">
                <label className="pd-toggle-row">
                  <span className="pd-card-label">Enterprise tier</span>
                  <input type="checkbox" className="pd-switch" checked={p.enterprise} onChange={(e) => onSetEnterprise(p.id, e.target.checked)} aria-label="Enterprise tier" />
                </label>
                {p.enterprise && (
                  <>
                    <div className="pd-card-row pd-sub-row"><span>Enterprise price ×{p.enterprisePrice.toFixed(1)}</span><span>~{B.enterprise.arpuMult}× revenue/user</span></div>
                    <input className="pd-slider" type="range" min={Math.round(B.enterprise.priceMin * 10)} max={Math.round(B.enterprise.priceMax * 10)} step={1}
                      style={fill(((p.enterprisePrice - B.enterprise.priceMin) / (B.enterprise.priceMax - B.enterprise.priceMin)) * 100)}
                      value={Math.round(p.enterprisePrice * 10)} onChange={(e) => onSetEnterprisePrice(p.id, Number(e.target.value) / 10)} aria-label="Enterprise pricing" />
                  </>
                )}
              </div>
            ) : (
              <p className="pd-hint">🔒 Enterprise tier unlocks after shipping {B.enterprise.unlockShips} models.</p>
            )}
          </div>
        )}

        {tab === "marketing" && (() => {
          const totalW = B.channels.reduce((s, c) => s + Math.max(0, p.channelMix[c.id] ?? 0), 0) || 1;
          const activeCount = B.channels.filter((c) => (p.channelMix[c.id] ?? 0) > 0).length;
          const budgetPct = mktCap > 0 ? (Math.min(p.marketingPerSec, mktCap) / mktCap) * 100 : 0;
          return (
            <div className="pd-pane">
              {info("🎯", "Smart budget allocation", "Set your total budget, then split it across channels. Cheap channels saturate fast — diversify as you grow.")}
              <div className="pd-card">
                <div className="pd-card-row"><span className="pd-card-label">Total budget</span><span className="pd-card-value">{m$(p.marketingPerSec)} /s</span></div>
                <input className="pd-slider" type="range" min={0} max={mktCap} step={Math.max(1, Math.round(mktCap / 50))}
                  style={fill(budgetPct)} value={Math.min(p.marketingPerSec, mktCap)} onChange={(e) => onSetMarketing(p.id, Number(e.target.value))} aria-label="Marketing budget" />
              </div>
              <div className="pd-section-head">
                <span>Channel split</span>
                <button className="pd-suggest" onClick={() => { const mix = suggestChannelMix(p, t); for (const c of B.channels) onSetChannelMix(p.id, c.id, mix[c.id] ?? 0); }}>✨ Suggest mix</button>
              </div>
              {B.channels.map((c) => {
                const w = Math.max(0, p.channelMix[c.id] ?? 0);
                const pct = Math.round((w / totalW) * 100);
                const meta = CH_META[c.id] ?? { glyph: "📢", tint: "#7c5cff" };
                return (
                  <label className="pd-channel-card" key={c.id}>
                    <div className="pd-channel-top">
                      <span className="pd-channel-ic" style={{ background: `${meta.tint}1f`, color: meta.tint }}>{meta.glyph}</span>
                      <div className="pd-channel-info">
                        <span className="pd-channel-name">{c.name}</span>
                        <span className="pd-channel-desc">{c.desc}</span>
                      </div>
                      <span className="pd-channel-pct">{pct}%</span>
                    </div>
                    <input className="pd-slider" type="range" min={0} max={100} step={5}
                      style={fill(Math.round(w * 100))} value={Math.round(w * 100)} onChange={(e) => onSetChannelMix(p.id, c.id, Number(e.target.value) / 100)} aria-label={`${c.name} weight`} />
                  </label>
                );
              })}
              <div className="pd-total-card">
                <span className="pd-total-ic">📊</span>
                <div className="pd-total-text">
                  <span className="pd-total-label">Total allocation</span>
                  <span className="pd-total-sub">100% of {m$(p.marketingPerSec)}/s</span>
                </div>
                <span className={`pd-total-status ${activeCount >= 2 ? "ok" : "warn"}`}>{activeCount >= 2 ? "✓ Balanced" : "● Concentrated"}</span>
              </div>
            </div>
          );
        })()}

        {tab === "upgrades" && (
          <div className="pd-pane">
            {info("✨", "Permanent upgrades", "One-time Money investments that permanently improve this product.")}
            {productFeatures.map((f) => {
              const owned = p.features.includes(f.id);
              const afford = canBuyFeature(game, p.id, f.id);
              return (
                <div className={`pd-feature ${owned ? "owned" : ""}`} key={f.id}>
                  <div className="pd-feature-info">
                    <span className="pd-feature-name">{owned ? "✓ " : ""}{f.name}</span>
                    <span className="pd-feature-desc">{f.desc}</span>
                    <span className="pd-feature-fx">{featureEffect(f.lane, f.factor)}</span>
                  </div>
                  {owned ? (
                    <span className="pd-feature-owned">Owned</span>
                  ) : (
                    <button className="pd-feature-buy" disabled={!afford} onClick={() => onBuyFeature(p.id, f.id)}>{m$(f.cost)}</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
}
