import { chartersBalance, charterDef, canSetCharter, chartersUnlocked } from "../engine/charter";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";

/** The conviction ladder (depth batch): consecutive same-charter ships earn
 *  ×1.15 → ×1.25 → ×1.40, capped. Rendered as "+15% → +25% → +40%". */
const LADDER = balance.prestige.charterConvictionLadder.map((m) => `+${Math.round((m - 1) * 100)}%`).join(" → ");

interface Props {
  game: GameState;
  onSet: (id: string | null) => void;
  /** Explicitly lock the current pick for this run (owner UX fix). */
  onLock: () => void;
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
export function CharterPanel({ game, onSet, onLock }: Props) {
  if (!chartersUnlocked(game)) return null;
  const editable = canSetCharter(game);
  const active = charterDef(game.charter);

  // Locked (research started): just show what you chose, compactly.
  if (!editable) {
    return (
      <section className="panel">
        <h2 className="panel-title">Lab Charter</h2>
        <p className="charter-locked">
          {active ? <><b>{active.name}</b> ✓ — {effectChips(active.id)}</> : <>No charter this run.</>}
          <span className="charter-locked-note"> · locked until next ship</span>
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Lab Charter</h2>
      <p className="charter-intro">Tap a charter to adopt this run's focus (tap again to drop it). It locks when you buy research — or lock it in below.{game.lastCharter && <> Re-pick last run's charter for a conviction bonus that <b>escalates with the streak</b> ({LADDER}% Legacy).</>}</p>
      <div className="list">
        {chartersBalance.list.map((c) => {
          const on = game.charter === c.id;
          const conviction = game.lastCharter === c.id;
          const streak = conviction ? Math.max(1, (game.charterStreak ?? 0) + 1) : 0;
          // The bonus THIS ship would earn: rung = streak − 2, capped on the ladder.
          const ladder = balance.prestige.charterConvictionLadder;
          const rung = streak >= 2 ? Math.min(ladder.length - 1, streak - 2) : -1;
          const convPct = rung >= 0 ? Math.round((ladder[rung]! - 1) * 100) : null;
          return (
            <button key={c.id} className={`charter-card ${on ? "on" : ""}`} onClick={() => onSet(on ? null : c.id)}>
              <div className="charter-main">
                <span className="charter-name">{c.name}{on && <span className="charter-pick"> ✓ adopted</span>}{conviction && (
                  <span className="charter-conviction">
                    {" "}↻ +{convPct}%
                    <span className="charter-streak-pips" title={`Conviction streak — rung ${rung + 1} of ${ladder.length}`} aria-hidden="true">
                      {ladder.map((_, i) => <i key={i} className={i <= rung ? "on" : ""} />)}
                    </span>
                  </span>
                )}</span>
                <span className="charter-blurb">{c.blurb}</span>
                <span className="charter-effects">{effectChips(c.id)}</span>
              </div>
            </button>
          );
        })}
      </div>
      {/* The explicit commit (owner: "no way to lock it in?"). Research still
          locks implicitly; this lets a decided player close the decision. */}
      {active && (
        <button className="btn btn-primary charter-lock-btn" onClick={onLock}>
          Lock in {active.name} for this run
        </button>
      )}
    </section>
  );
}
