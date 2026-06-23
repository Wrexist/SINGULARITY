import { balance } from "../engine/balance/config";
import { canBuyDataOffer, canBuyUpgrade, upgradeCost } from "../engine/actions";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";
import { fmt } from "./format";

interface Props {
  game: GameState;
  onBuyData: (id: string) => void;
  onBuyTool: (id: string) => void;
}

/** Money → Data marketplace: clean licensed vendors vs. the risky dark web. */
export function DataMarketPanel({ game, onBuyData, onBuyTool }: Props) {
  const legit = balance.dataMarket.filter((o) => !o.shady);
  const shady = balance.dataMarket.filter((o) => o.shady);
  const tools = balance.upgrades.filter((u) => u.market === "darkweb");

  return (
    <section className="panel market">
      <h2 className="panel-title">Data Market</h2>

      <div className="market-group">
        <h3 className="market-head">Licensed Data Partners</h3>
        {legit.map((o) => {
          const affordable = canBuyDataOffer(game, o.id);
          return (
            <button
              key={o.id}
              className={`card ${affordable ? "affordable" : ""}`}
              disabled={!affordable}
              onClick={() => onBuyData(o.id)}
            >
              <div className="card-main">
                <span className="card-name">
                  {o.name}
                  <span className="vendor-tag">{o.vendor}</span>
                </span>
                <span className="card-desc">{o.desc}</span>
              </div>
              <div className="card-cost">
                <span style={{ color: "var(--data)" }}>+{fmt(Big.of(o.data))} data</span>
                <span className="cost-sub">${fmt(Big.of(o.cost))}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="market-group shady">
        <h3 className="market-head">
          The Data Bazaar <span className="shady-badge">dark web</span>
        </h3>
        <p className="market-warn">Cheaper data. Caveat emptor — batches can be poisoned, or raided.</p>
        {shady.map((o) => {
          const affordable = canBuyDataOffer(game, o.id);
          const risk = o.risk!;
          return (
            <button
              key={o.id}
              className={`card shady-card ${affordable ? "affordable" : ""}`}
              disabled={!affordable}
              onClick={() => onBuyData(o.id)}
            >
              <div className="card-main">
                <span className="card-name">
                  {o.name}
                  <span className="vendor-tag shady">{o.vendor}</span>
                </span>
                <span className="card-desc">{o.desc}</span>
                <span className="risk-line">
                  ☠️ {Math.round(risk.poisonChance * 100)}% poison · 🚨 {Math.round(risk.raidChance * 100)}% raid
                </span>
              </div>
              <div className="card-cost">
                <span style={{ color: "var(--data)" }}>~+{fmt(Big.of(o.data))} data</span>
                <span className="cost-sub">${fmt(Big.of(o.cost))}</span>
              </div>
            </button>
          );
        })}

        <h3 className="market-head tools-head">Tools &amp; Toys</h3>
        {tools.map((def) => {
          const owned = game.upgrades[def.id] ?? 0;
          const affordable = canBuyUpgrade(game, def.id);
          const cost = upgradeCost(def, owned);
          return (
            <button
              key={def.id}
              className={`card shady-card ${affordable ? "affordable" : ""}`}
              disabled={!affordable}
              onClick={() => onBuyTool(def.id)}
            >
              <div className="card-main">
                <span className="card-name">
                  {def.name}
                  {owned > 0 && <span className="card-owned">×{owned}</span>}
                </span>
                <span className="card-desc">{def.desc}</span>
              </div>
              <div className="card-cost">
                <span style={{ color: "var(--money)" }}>${fmt(cost)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
