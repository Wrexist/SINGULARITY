import { chartersBalance, charterDef, canSetCharter, chartersUnlocked } from "../engine/charter";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";

const CONVICTION_PCT = Math.round((balance.prestige.charterConvictionBonus - 1) * 100);

interface Props {
  game: GameState;
  onSet: (id: string | null) => void;
}

const pct = (x: number | undefined) => (x ? `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%` : null);

function effectChips(id: string) {
  const def = charterDef(id);
  if (!def) return null;
  const parts = [
    pct(def.computeMult) && `${pct(def.computeMult)} compute`,
    pct(def.dataMult) && `${pct(def.dataMult)} data`,
    pct(def.moneyMult) && `${pct(def.moneyMult)} $`,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Lab Charter picker (R6.1). At the start of a fresh run (post-first-ship) you
 * pick a charter that tilts this run's triangle — so generations play differently.
 * Once you commit to a research path it locks in (just shows the active charter).
 */
export function CharterPanel({ game, onSet }: Props) {
  if (!chartersUnlocked(game)) return null;
  const editable = canSetCharter(game);
  const active = charterDef(game.charter);

  // Locked (research started): just show what you chose, compactly.
  if (!editable) {
    return (
      <section className="panel">
        <h2 className="panel-title">Lab Charter</h2>
        <p className="charter-locked">
          {active ? <><b>{active.name}</b> — {effectChips(active.id)}</> : <>No charter this run.</>}
          <span className="charter-locked-note"> · locked until next ship</span>
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Lab Charter</h2>
      <p className="charter-intro">Pick this run's focus — it tilts your economy. Locks once you research.{game.lastCharter && <> Re-pick last run's charter for a <b>+{CONVICTION_PCT}% Legacy</b> conviction bonus.</>}</p>
      <div className="list">
        {chartersBalance.list.map((c) => {
          const on = game.charter === c.id;
          const conviction = game.lastCharter === c.id;
          return (
            <button key={c.id} className={`charter-card ${on ? "on" : ""}`} onClick={() => onSet(on ? null : c.id)}>
              <div className="charter-main">
                <span className="charter-name">{c.name}{on && <span className="charter-pick"> ✓</span>}{conviction && <span className="charter-conviction"> ↻ +{CONVICTION_PCT}%</span>}</span>
                <span className="charter-blurb">{c.blurb}</span>
                <span className="charter-effects">{effectChips(c.id)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
