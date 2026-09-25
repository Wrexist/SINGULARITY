import { chartersBalance, charterDef, canSetCharter, chartersUnlocked, charterHand } from "../engine/charter";
import { doctrineUnlocked, stanceOpen, committedSide, schismRevealed, type Stance } from "../engine/doctrine";
import { alignmentProductionMods, alignmentHeatMult } from "../engine/alignment";
import { balance } from "../engine/balance/config";
import { charterConvictionMult } from "../engine/prestige";
import { autoResearchEnabled } from "../engine/reputation";
import type { GameState } from "../engine/types";
import { ShieldIcon, ScalesIcon, RocketIcon } from "./Icons";
import { fmtSignedPct } from "./format";

interface Props {
  game: GameState;
  onSet: (id: string | null) => void;
  /** Explicitly lock the current pick for this run (owner UX fix). */
  onLock: () => void;
  /** Declare this run's stance (from the Doctrine reveal on). */
  onStance: (stance: Stance) => void;
}

const pct = (x: number | undefined) => (x ? fmtSignedPct(x) : null);

/** "×2.5" for a rule multiplier, "½" for a half. */
const times = (x: number) => (x === 0.5 ? "½" : `×${x}`);

/** A rule charter's rules as chips ("½ research compute", "×2.5 product revenue", …);
 *  empty for a lane charter. Shared with Lab Stats so both name the same effects. */
export function charterRuleChips(id: string | null): string[] {
  const r = charterDef(id)?.rule ?? {};
  return [
    r.researchCompute !== undefined && `${times(r.researchCompute)} research compute`,
    r.researchData !== undefined && `${times(r.researchData)} research data`,
    r.productArpu !== undefined && `${times(r.productArpu)} product revenue`,
    r.factionShift !== undefined && `${times(r.factionShift)} faction shifts`,
  ].filter((x): x is string => !!x);
}

function effectChips(id: string) {
  const def = charterDef(id);
  if (!def) return null;
  const parts = [
    ...charterRuleChips(id),
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

/** "+6% $ · −4% compute · −20% heat" — the tilt the lab's alignment applies right now,
 *  read from the same engine helpers derive uses, so the line can never disagree with
 *  the effect. It reads the LIVE alignment, not the declared point: Chen's Lobby / Defy
 *  and faction choices keep moving it after a declaration (a Defy leaves an undeclared
 *  lab at +0.2, which is a real tilt, not "No tilt"). */
function stanceEffects(game: GameState): string {
  if (game.alignment === 0) return "No tilt";
  const m = alignmentProductionMods(game);
  const heat = alignmentHeatMult(game);
  const lanes = [pct(m.moneyMult - 1) && `${pct(m.moneyMult - 1)} $`, pct(m.computeMult - 1) && `${pct(m.computeMult - 1)} compute`];
  if (game.alignment > 0) lanes.reverse(); // lead with the side's upside
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
        {game.alignment !== 0 && <span className="stance-locked-fx"> · {stanceEffects(game)}</span>}
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
          // Center is the lab's position only at exactly 0: a lean inside the band is
          // uncommitted but not centred, so nothing reads as chosen and Center stays a
          // live tap that really re-centres (declareStance sets 0).
          const on = id === null ? game.alignment === 0 : side === id;
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
        {stanceEffects(game)}
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
        <p className="charter-intro">Tap a charter to adopt this run's focus (tap again to drop it). {
          // A Research Director owner's window is time-boxed (its purchases don't lock it).
          autoResearchEnabled(game)
            ? `It locks ${chartersBalance.directorGraceSec} seconds into the run`
            : "It locks when you buy research"
        } — or lock it in below.</p>
      )}
      <div className="list">
        {/* This run's dealt hand (the Charter Draft), plus a charter already adopted
            from outside it (a save made before the draft) so it can still be seen and
            dropped. */}
        {chartersBalance.list.filter((c) => charterHand(game).includes(c.id) || c.id === game.charter).map((c) => {
          const on = game.charter === c.id;
          const conviction = game.lastCharter === c.id;
          // The bonus THIS ship would earn if it flew this charter — read from the
          // engine's own helper, so the card can't disagree with what the ship pays
          // (it used to read "+%" on saves migrated with a streak of 0).
          const ladder = balance.prestige.charterConvictionLadder;
          const mult = conviction ? charterConvictionMult({ ...game, charter: c.id }) : 1;
          const rung = mult > 1 ? ladder.indexOf(mult) : -1;
          const convPct = mult > 1 ? Math.round((mult - 1) * 100) : null;
          return (
            <button key={c.id} className={`charter-card ${on ? "on" : ""} ${c.rule ? "wild" : ""}`} onClick={() => onSet(on ? null : c.id)}>
              <div className="charter-main">
                <span className="charter-name">{c.name}{on && <span className="charter-pick"> ✓ adopted</span>}{conviction && convPct !== null && (
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
