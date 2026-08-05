import type { GameState } from "../engine/types";
import { automationList, automationUnlocked } from "../engine/automation";
import { iconFor } from "./iconRegistry";
import { LockIcon } from "./Icons";

interface Props {
  game: GameState;
  onToggle: (id: string) => void;
  /** Render WITHOUT the panel card + heading, for use inside a <Collapsible> (which
   *  already supplies both). Otherwise this nests a panel inside a panel and shows
   *  its heading twice. */
  bare?: boolean;
}

/**
 * Automation — mid/late-game "let the AI run the lab" toggles. Each autopilot unlocks by
 * ship count, then flips on/off with a switch. Off by default (the player opts in), and the
 * balance sim never enables one, so the tuned curve is untouched.
 */
export function AutomationPanel({ game, onToggle, bare = false }: Props) {
  const list = automationList();
  const onCount = list.filter((d) => automationUnlocked(game, d.id) && game.automation[d.id]).length;

  const body = (
    <>
      {/* First-run scaffolding — drop it once an autopilot is running (noise sweep). */}
      {onCount === 0 && <p className="automation-intro">Let the lab run itself. Ship more models to unlock each autopilot, then switch it on.</p>}
      <div className="list">
        {list.map((def) => {
          const unlocked = automationUnlocked(game, def.id);
          const on = unlocked && !!game.automation[def.id];
          return (
            <button
              key={def.id}
              className={`automation-row ${on ? "on" : ""} ${unlocked ? "" : "locked"}`}
              disabled={!unlocked}
              onClick={() => onToggle(def.id)}
              aria-pressed={on}
            >
              <span className="automation-ic" aria-hidden="true">{unlocked ? iconFor(def.icon, 21) : <LockIcon size={21} />}</span>
              <div className="automation-text">
                <span className="automation-name">{def.name}</span>
                <span className="automation-desc">{unlocked ? def.desc : `Unlocks at ${def.unlockShips} models shipped`}</span>
              </div>
              <span className={`automation-switch ${on ? "on" : ""}`} aria-hidden="true"><span className="automation-knob" /></span>
            </button>
          );
        })}
      </div>
    </>
  );

  if (bare) return body;
  return (
    <section className="panel automation">
      <div className="automation-head">
        <h2 className="panel-title" style={{ margin: 0 }}>Automation</h2>
        {onCount > 0 && <span className="automation-count">{onCount} on</span>}
      </div>
      {body}
    </section>
  );
}
