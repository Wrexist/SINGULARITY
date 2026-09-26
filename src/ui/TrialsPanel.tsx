import type { GameState } from "../engine/types";
import { trialsBalance, canQueueTrial, trialConditionMet, ladderRung, trialLadders, ladderProgress, trialRewardLabel } from "../engine/trials";

interface Props {
  game: GameState;
  onStart: (id: string) => void;
  onAbandon: () => void;
}

/**
 * Prestige Trials — opt-in "constrained training runs". You commit to a Trial early
 * in a generation (before you can ship), endure its handicap for the whole run, and
 * complete it by shipping — banking a small PERMANENT reward. Makes a generation feel
 * different, not just faster. Curve-safe: the sim never opts in (see engine/trials.ts).
 */
/** Rendered inside a Collapsible (which supplies the panel section + title), so this
 *  returns just the body. */
export function TrialsPanel({ game, onStart, onAbandon }: Props) {
  const active = game.activeTrial ? trialsBalance.list.find((t) => t.id === game.activeTrial) : null;
  const done = new Set(game.trialsDone);

  return (
    <>
      {/* First-run scaffolding — hide once the player has completed a Trial. */}
      {game.trialsDone.length === 0 && (
        <p className="trials-note">
          Constrained runs — queue one, endure its handicap for your whole next run, then bank a permanent edge.
        </p>
      )}

      {active && (() => {
        const condMet = trialConditionMet(game);
        return (
          <div className="trial-card trial-on">
            <div className="trial-main">
              <span className="trial-name">{active.name} — running</span>
              <span className="trial-desc">{active.desc}</span>
              {active.condition === "solo" && (
                <span className="trial-status" style={condMet ? undefined : { color: "var(--ink-3)" }}>
                  Condition: no staff on the roster — {condMet ? "met ✓" : "not met (fire your team to qualify)"}
                </span>
              )}
              <span className="trial-status">
                Ship the Model {active.condition && !condMet ? "with the condition met " : ""}to bank {trialRewardLabel(active)}.
              </span>
            </div>
            <button className="trial-abandon" onClick={onAbandon}>Abandon</button>
          </div>
        );
      })()}

      <div className="list">
        {trialLadders().map((ladder) => {
          // One card per LADDER, showing the rung it is currently offering. A fully
          // banked ladder falls back to its last rung so the ✓ stays on the wall.
          const rungs = trialsBalance.list.filter((d) => d.ladder === ladder);
          const current = ladderRung(game, ladder);
          // The current rung running is shown above; this card then offers the rung
          // after it, which can be queued now and starts at the Ship that banks this
          // one (a ladder's last rung has nothing after it, so no card).
          const t = current && game.activeTrial === current.id
            ? rungs.find((d) => d.requires === current.id)
            : current ?? rungs[rungs.length - 1]!;
          if (!t || game.activeTrial === t.id) return null;
          const prog = ladderProgress(game, ladder);
          const isDone = done.has(t.id);
          const locked = game.prestige.ships < t.unlockShips;
          // A Trial is endured from a run's first second, so it is always QUEUED for
          // the next run; the Ship starts it on the fresh lab.
          const queued = game.queuedTrial === t.id;
          const canQueue = canQueueTrial(game, t.id);
          return (
            <div key={ladder} className={`trial-card meta-item ${isDone ? "trial-done" : queued ? "affordable" : locked ? "locked" : ""}`}>
              <div className="trial-main">
                <span className="trial-name">
                  {t.name}{isDone ? " ✓" : ""}
                  {prog.total > 1 && <span className="trial-rungs">{prog.done}/{prog.total}</span>}
                </span>
                <span className="trial-desc">{t.desc}</span>
                {locked && <span className="trial-req">Unlocks at {t.unlockShips} ships</span>}
                {queued && <span className="trial-req">Starts with your next run.</span>}
              </div>
              {isDone ? (
                <span className="trial-owned">banked</span>
              ) : (
                <button
                  className={`trial-attempt ${queued ? "queued" : "next"}`}
                  disabled={!canQueue && !queued}
                  aria-pressed={queued}
                  // Every card ends in this same pill, so its name says WHICH Trial it
                  // queues (the text alone read "Next run" once per ladder). Steady
                  // across states; aria-pressed carries queued / not queued.
                  aria-label={`Queue ${t.name} for your next run`}
                  onClick={() => onStart(t.id)}
                >
                  {queued ? "Queued ✓" : "Next run"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Trials completed / total — for the Collapsible badge. Counts RUNGS, not ladders:
 *  the badge tracks how much of the whole constrained-run chase is banked, and a
 *  ladder half-climbed is genuinely half-banked. */
export function trialsDoneCount(game: GameState): number {
  return trialsBalance.list.filter((t) => game.trialsDone.includes(t.id)).length;
}
export const trialsTotal = trialsBalance.list.length;
