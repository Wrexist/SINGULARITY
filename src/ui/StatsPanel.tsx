import { useState } from "react";
import { ChevronIcon } from "./Icons";
import type { Derived, GameState } from "../engine/types";
import { fmt, fmtMoney, m$, numOf, fmtDur } from "./format";
import { achievementDefs } from "../engine/achievements";
import { reputationAvailable, endowmentMult } from "../engine/reputation";
import { preprintMult } from "../engine/preprints";
import { alignmentProductionMods, alignmentHeatMult, alignmentProductMods } from "../engine/alignment";
import { regulatorState } from "../engine/regulator";
import { charterDef, charterMods } from "../engine/charter";
import { balance } from "../engine/balance/config";
import { ascensionMultiplier } from "../engine/prestige";
import { totalMorale } from "../engine/derive";
import { history } from "./history";
import { Sparkline } from "./Sparkline";

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

type Row = { label: string; value: string; tone?: "compute" | "data" | "money" | "good"; spark?: number[] };

/** Collapsible "Lab Stats" — surfaces the math (legibility is the feature, GDD).
 *  Two groups: NOW (current per-second rates + multipliers) and ALL-TIME (the
 *  lifetime career: peaks, totals, and meta-progression earned across every run). */
/** Compact "+9% cmp · −6% $ · +30% heat" summary of the active stance, or null
 *  at neutral. Makes the (now real) faction tilt legible instead of invisible. */
const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

function stanceEffects(game: GameState): string | null {
  if (game.alignment === 0) return null;
  const mods = alignmentProductionMods(game);
  const heat = alignmentHeatMult(game);
  return `${pct(mods.computeMult - 1)} cmp · ${pct(mods.moneyMult - 1)} $ · ${pct(heat - 1)} heat`;
}

/** Active per-run Lab Charter as "Name · +X% cmp · −Y% $", or null when none is
 *  chosen. Surfaces the run's build choice so the tilt isn't invisible. */
function charterRow(game: GameState): Row | null {
  const def = charterDef(game.charter);
  if (!def) return null;
  const m = charterMods(game);
  const parts = [
    m.computeMult !== 1 ? `${pct(m.computeMult - 1)} cmp` : null,
    m.dataMult !== 1 ? `${pct(m.dataMult - 1)} data` : null,
    m.moneyMult !== 1 ? `${pct(m.moneyMult - 1)} $` : null,
  ].filter(Boolean);
  return { label: "Charter", value: `${def.name} · ${parts.join(" · ")}` };
}

/** R5.5 cross-system effects, surfaced only when active (else they'd clutter the
 *  common case). Keeps the new depth legible — "legibility is the feature". */
function crossSystemRows(game: GameState): Row[] {
  const rows: Row[] = [];
  if (game.alignment !== 0) {
    const ap = alignmentProductMods(game);
    const parts: string[] = [];
    if (ap.acq !== 1) parts.push(`${pct(ap.acq - 1)} acquisition`);
    if (ap.heat !== 1) parts.push(`${pct(ap.heat - 1)} product heat`);
    if (parts.length) rows.push({ label: "Faction → products", value: parts.join(" · ") });
  }
  if (game.heat > 0) {
    const churn = (game.heat / balance.heat.max) * balance.heat.productChurnAtMax;
    if (churn > 0.001) rows.push({ label: "Regulatory drag", value: `${pct(churn)} product churn` });
  }
  return rows;
}

export function StatsPanel({ game, derived }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (
    <button className="stats-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      <span className="panel-title" style={{ margin: 0 }}>Lab Stats</span>
      <span className="chevron"><ChevronIcon size={13} dir={open ? "up" : "down"} /></span>
    </button>
  );
  // Collapsed = a header only. Bail before building the row tables — this panel
  // re-renders on every 10Hz tick, and the ~30 formatted rows are pure waste
  // while nothing is shown.
  if (!open) return <section className="panel stats">{toggle}</section>;

  const s = game.stats;
  const stance = stanceEffects(game);
  const charter = charterRow(game);

  // NOTE: Compute/sec, Data/sec and Passive income are NOT repeated here — the
  // ResourceBar carries all three permanently at the top of every screen, so a
  // second copy in the reference panel was pure duplication (2026-08 noise sweep).
  // The multipliers below are the value this panel adds: they exist nowhere else.
  const now: Row[] = [
    // These rate rows were dropped by the 2026-08 noise sweep as duplicating the
    // ResourceBar — the sparklines resurrect them as TREND rows: the ~3-minute
    // trace is information the bar doesn't carry.
    { label: "Compute / sec", value: fmt(derived.computePerSec), tone: "compute" as const, spark: history.compute },
    { label: "Data / sec", value: fmt(derived.dataPerSec), tone: "data" as const, spark: history.data },
    { label: "Compute multiplier", value: `×${fmt(derived.computeMult)}` },
    { label: "Data multiplier", value: `×${fmt(derived.dataMult)}` },
    { label: "$ multiplier", value: `×${fmt(derived.moneyMult)}` },
    { label: "Legacy boost", value: `×${fmt(derived.legacyMult)}`, tone: "good" as const },
    // Endgame boosts that were previously invisible — surface them the moment they're
    // non-identity so the "small compounding boosts" actually read as working.
    ...(game.preprints > 0 ? [{ label: "Preprints", value: `×${preprintMult(game).toNumber().toFixed(2)} · ${game.preprints} paper${game.preprints === 1 ? "" : "s"}` }] : []),
    ...(game.repEndowment > 0 ? [{ label: "Endowment", value: `+${Math.round((endowmentMult(game) - 1) * 100)}% · L${game.repEndowment}` }] : []),
    { label: "Run duration", value: `${derived.runDurationSec.toFixed(1)}s` },
    { label: "Run payout", value: `${fmt(derived.runDataYield)} data · ${fmtMoney(derived.runMoneyYield)}` },
    { label: "Passive income", value: `${fmtMoney(derived.passiveMoneyPerSec)}/s`, tone: "money" as const, spark: history.money },
    // (The "Faction stance" text row was dropped — the align-bar below already carries
    // the stance name; keep only the numeric tilt. 2026-07 noise sweep.)
    ...(stance ? [{ label: "Stance effects", value: stance }] : []),
    ...(game.suspicion > 0 ? [{ label: "Regulator", value: `${regulatorState(game).name} · ${regulatorState(game).label}` }] : []),
    ...(game.employees.length > 0 ? [{ label: "Team morale", value: `×${totalMorale(game).toFixed(2)}` }] : []),
    ...(charter ? [charter] : []),
    ...crossSystemRows(game),
  ];

  const allTime: Row[] = [
    { label: "Total earned", value: fmtMoney(s.totalMoney), tone: "money" as const },
    { label: "Peak Compute / sec", value: fmt(s.peakComputePerSec) },
    { label: "Peak revenue / sec", value: m$(s.peakMrr), tone: "money" as const },
    { label: "Peak users", value: numOf(s.peakMau) },
    { label: "Models shipped", value: String(s.totalShips) },
    { label: "Legacy Weights", value: fmt(game.prestige.legacyWeights) },
    ...(s.ascensions > 0 ? [{ label: "AGI ascensions", value: `${s.ascensions} (×${ascensionMultiplier(game).toFixed(2)})` }] : []),
    ...(s.openSourceShips > 0 ? [{ label: "Models open-sourced", value: String(s.openSourceShips) }] : []),
    { label: "Products launched", value: String(s.productsLaunched) },
    ...(game.products.sold > 0 ? [{ label: "Products sold", value: String(game.products.sold) }] : []),
    { label: "Employees hired", value: String(s.employeesHired) },
    { label: "World events", value: String(s.worldEventsResolved) },
    { label: "Achievements", value: `${game.achievements.length} / ${achievementDefs.length}` },
    { label: "Lab Reputation", value: `${reputationAvailable(game)} pts · ${game.reputation.perks.length} perks` },
    { label: "Time played", value: fmtDur(s.playtimeSec) },
  ];

  return (
    <section className="panel stats open">
      {toggle}
      {game.alignment !== 0 && (
        <div className="align-bar" title={`Alignment ${game.alignment.toFixed(2)}`}>
          <div className="align-track">
            <div className="align-center" />
            <div className="align-marker" style={{ left: `${((game.alignment + 1) / 2) * 100}%` }} />
          </div>
          {(() => {
            // At a pole the stance label IS the pole label — highlight the end
            // instead of printing "Doomer … Doomer" twice (red-team pass).
            const label = alignmentLabel(game.alignment);
            const atDoomer = label === "Doomer";
            const atAccel = label === "Accelerationist";
            return (
              <div className="align-ends">
                <span className={atDoomer ? "align-now" : undefined}>Doomer</span>
                <span className="align-now">{atDoomer || atAccel ? "" : label}</span>
                <span className={atAccel ? "align-now" : undefined}>Accel</span>
              </div>
            );
          })()}
        </div>
      )}
      <div className="stats-subhead">Now</div>
      <div className="stats-grid">
        {now.map((r) => (
          <div key={r.label} className="stat-row">
            <span className="stat-label">{r.label}</span>
            {r.spark && r.spark.length > 1 && (
              <span className={`stat-spark${r.tone ? ` t-${r.tone}` : ""}`}><Sparkline values={r.spark} /></span>
            )}
            <span className={`stat-value${r.tone ? ` t-${r.tone}` : ""}`}>{r.value}</span>
          </div>
        ))}
      </div>
      <div className="stats-subhead">All-time career</div>
      <div className="stats-grid">
        {allTime.map((r) => (
          <div key={r.label} className="stat-row">
            <span className="stat-label">{r.label}</span>
            <span className={`stat-value${r.tone ? ` t-${r.tone}` : ""}`}>{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
