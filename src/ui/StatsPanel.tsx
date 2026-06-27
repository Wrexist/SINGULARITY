import { useState } from "react";
import type { Derived, GameState } from "../engine/types";
import { fmt, fmtMoney, m$, numOf, fmtDur } from "./format";
import { achievementDefs } from "../engine/achievements";
import { reputationAvailable } from "../engine/reputation";
import { alignmentProductionMods, alignmentHeatMult } from "../engine/alignment";
import { ascensionMultiplier } from "../engine/prestige";

interface Props {
  game: GameState;
  derived: Derived;
}

/** Faction stance label from the alignment scalar (−1 doomer … +1 accel). */
function alignmentLabel(a: number): string {
  if (a <= -0.6) return "Doomer";
  if (a < -0.15) return "Leaning doomer";
  if (a <= 0.15) return "Neutral";
  if (a < 0.6) return "Leaning accelerationist";
  return "Accelerationist";
}

type Row = { label: string; value: string };

/** Collapsible "Lab Stats" — surfaces the math (legibility is the feature, GDD).
 *  Two groups: NOW (current per-second rates + multipliers) and ALL-TIME (the
 *  lifetime career: peaks, totals, and meta-progression earned across every run). */
/** Compact "+9% cmp · −6% $ · +30% heat" summary of the active stance, or null
 *  at neutral. Makes the (now real) faction tilt legible instead of invisible. */
function stanceEffects(game: GameState): string | null {
  if (game.alignment === 0) return null;
  const mods = alignmentProductionMods(game);
  const heat = alignmentHeatMult(game);
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
  return `${pct(mods.computeMult - 1)} cmp · ${pct(mods.moneyMult - 1)} $ · ${pct(heat - 1)} heat`;
}

export function StatsPanel({ game, derived }: Props) {
  const [open, setOpen] = useState(false);
  const s = game.stats;
  const stance = stanceEffects(game);

  const now: Row[] = [
    { label: "Compute / sec", value: fmt(derived.computePerSec) },
    { label: "Data / sec", value: fmt(derived.dataPerSec) },
    { label: "Data multiplier", value: `×${fmt(derived.dataMult)}` },
    { label: "$ multiplier", value: `×${fmt(derived.moneyMult)}` },
    { label: "Legacy boost", value: `×${fmt(derived.legacyMult)}` },
    { label: "Run duration", value: `${derived.runDurationSec.toFixed(1)}s` },
    { label: "Run payout", value: `${fmt(derived.runDataYield)} data · ${fmtMoney(derived.runMoneyYield)}` },
    { label: "Passive income", value: `${fmtMoney(derived.passiveMoneyPerSec)}/s` },
    { label: "Faction stance", value: alignmentLabel(game.alignment) },
    ...(stance ? [{ label: "Stance effects", value: stance }] : []),
  ];

  const allTime: Row[] = [
    { label: "Total earned", value: fmtMoney(s.totalMoney) },
    { label: "Peak Compute / sec", value: fmt(s.peakComputePerSec) },
    { label: "Peak revenue / sec", value: m$(s.peakMrr) },
    { label: "Peak users", value: numOf(s.peakMau) },
    { label: "Models shipped", value: String(s.totalShips) },
    { label: "Legacy Weights", value: fmt(game.prestige.legacyWeights) },
    ...(s.ascensions > 0 ? [{ label: "AGI ascensions", value: `${s.ascensions} (×${ascensionMultiplier(game).toFixed(2)})` }] : []),
    { label: "Products launched", value: String(s.productsLaunched) },
    { label: "Employees hired", value: String(s.employeesHired) },
    { label: "World events", value: String(s.worldEventsResolved) },
    { label: "Achievements", value: `${game.achievements.length} / ${achievementDefs.length}` },
    { label: "Lab Reputation", value: `${reputationAvailable(game)} pts · ${game.reputation.perks.length} perks` },
    { label: "Time played", value: fmtDur(s.playtimeSec) },
  ];

  return (
    <section className={`panel stats ${open ? "open" : ""}`}>
      <button className="stats-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-title" style={{ margin: 0 }}>Lab Stats</span>
        <span className="chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          <div className="stats-subhead">Now</div>
          <div className="stats-grid">
            {now.map((r) => (
              <div key={r.label} className="stat-row">
                <span className="stat-label">{r.label}</span>
                <span className="stat-value">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="stats-subhead">All-time career</div>
          <div className="stats-grid">
            {allTime.map((r) => (
              <div key={r.label} className="stat-row">
                <span className="stat-label">{r.label}</span>
                <span className="stat-value">{r.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
