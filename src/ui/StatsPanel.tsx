import { useState } from "react";
import type { Derived, GameState } from "../engine/types";
import { fmt, fmtMoney } from "./format";

interface Props {
  game: GameState;
  derived: Derived;
}

/** Collapsible "Lab Stats" — surfaces the math (legibility is the feature, GDD). */
export function StatsPanel({ game, derived }: Props) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; value: string }[] = [
    { label: "Compute / sec", value: fmt(derived.computePerSec) },
    { label: "Data multiplier", value: `×${fmt(derived.dataMult)}` },
    { label: "$ multiplier", value: `×${fmt(derived.moneyMult)}` },
    { label: "Legacy boost", value: `×${fmt(derived.legacyMult)}` },
    { label: "Run duration", value: `${derived.runDurationSec.toFixed(1)}s` },
    { label: "Run payout", value: `${fmt(derived.runDataYield)} data · ${fmtMoney(derived.runMoneyYield)}` },
    { label: "Passive income", value: `${fmtMoney(derived.passiveMoneyPerSec)}/s` },
    { label: "Lifetime earned", value: fmtMoney(game.lifetimeMoney) },
    { label: "Models shipped", value: String(game.prestige.ships) },
    { label: "Legacy Weights", value: fmt(game.prestige.legacyWeights) },
  ];

  return (
    <section className={`panel stats ${open ? "open" : ""}`}>
      <button className="stats-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-title" style={{ margin: 0 }}>Lab Stats</span>
        <span className="chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="stats-grid">
          {rows.map((r) => (
            <div key={r.label} className="stat-row">
              <span className="stat-label">{r.label}</span>
              <span className="stat-value">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
