import { chartersBalance, charterDef, canSetCharter, chartersUnlocked } from "../engine/charter";
import { doctrineBalance, doctrineUnlocked, stanceOpen, committedSide, schismRevealed, type Stance } from "../engine/doctrine";
import { alignmentProductionMods, alignmentHeatMult } from "../engine/alignment";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";
import { ShieldIcon, ScalesIcon, RocketIcon } from "./Icons";

interface Props {
  game: GameState;
  onSet: (id: string | null) => void;
  /** Explicitly lock the current pick for this run (owner UX fix). */
  onLock: () => void;
  /** Declare this run's stance (from the Doctrine reveal on). */
  onStance: (stance: Stance) => void;
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

const STANCES: { id: Stance; label: string; Icon: typeof ShieldIcon }[] = [
  { id: "doomer", label: "Safety", Icon: ShieldIcon },
  { id: null, label: "Center", Icon: ScalesIcon },
  { id: "accel", label: "Acceleration", Icon: RocketIcon },
];

/** "+6% $ · −4% compute · −20% heat" for a stance, read from the same engine
 *  helpers derive uses — so the line can never disagree with the effect. */
function stanceEffects(game: GameState, stance: Stance): string {
  if (stance === null) return "No tilt";
  const a = stance === "doomer" ? -doctrineBalance.threshold : doctrineBalance.threshold;
  const probe = { ...game, alignment: a };
  const m = alignmentProductionMods(probe);
  const heat = alignmentHeatMult(probe);
  const lanes = [pct(m.moneyMult - 1) && `${pct(m.moneyMult - 1)} $`, pct(m.computeMult - 1) && `${pct(m.computeMult - 1)} compute`];
  if (stance === "accel") lanes.reverse(); // lead with the side's upside
  return [...lanes, pct(heat - 1) && `${pct(heat - 1)} heat`].filter(Boolean).join(" · ");
}

/**
 * Declare a Stance (2026-09) — where the lab stands this run. Opens the matching
 * Doctrine perks; locks with the charter. Rendered only once Doctrine is revealed.
 */
function StanceRow({ game, onStance }: { game: GameState; onStance: (s: Stance) => void }) {
  const open = stanceOpen(game);
  const side = committedSide(game);
  const current = STANCES.find((s) => s.id === side) ?? STANCES[1]!;
  if (!open) {
    const { Icon } = current;
    return (
      <p className="stance-locked">
        <span className={`stance-chip ${current.id ?? "center"}`}><Icon size={14} /> {current.label}</span>
        {current.id !== null && <span className="stance-locked-fx"> · {stanceEffects(game, current.id)}</span>}
      </p>
    );
  }
  const hint =
    side === "doomer" ? "Opens the Safety doctrine." :
    side === "accel" ? "Opens the Acceleration doctrine." :
    schismRevealed(game) ? "The Schism is claimed from here." : null;
  return (
    <div className="stance">
      <div className="stance-head">Stance</div>
      <div className="stance-opts" role="radiogroup" aria-label="Stance this run">
        {STANCES.map(({ id, label, Icon }) => {
          const on = side === id;
          return (
            <button
              key={label}
              role="radio"
              aria-checked={on}
              className={`stance-opt ${id ?? "center"} ${on ? "on" : ""}`}
              onClick={() => { if (!on) onStance(id); }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <p className="stance-fx">
        {stanceEffects(game, side)}
        {hint && <span className="stance-hint"> · {hint}</span>}
      </p>
    </div>
  );
}

/**
 * Lab Charter picker (R6.1). At the start of a fresh run (post-first-ship) you
 * pick a charter that tilts this run's triangle — so generations play differently.
 * Once you commit to a research path it locks in (just shows the active charter).
 */
export function CharterPanel({ game, onSet, onLock, onStance }: Props) {
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
        {doctrineUnlocked(game) && <StanceRow game={game} onStance={onStance} />}
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Lab Charter</h2>
      {/* First-encounter scaffolding only (calm-down audit 2026-08): once the player
          has run a charter, the cards + conviction pips carry the system wordlessly. */}
      {game.lastCharter == null && (
        <p className="charter-intro">Tap a charter to adopt this run's focus (tap again to drop it). It locks when you buy research — or lock it in below.</p>
      )}
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
      {doctrineUnlocked(game) && <StanceRow game={game} onStance={onStance} />}
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
