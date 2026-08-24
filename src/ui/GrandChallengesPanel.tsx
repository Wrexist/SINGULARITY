import type { GameState } from "../engine/types";
import { visibleChallenges, challengeView, canFundChallenge, pendingForkChallenge, megaprojectUnlocked, megaprojectView, canFundMegaproject, mandateDefs, mandatePicksAvailable, mandateMods } from "../engine/challenges";
import { challenges as C } from "../engine/balance/challenges";
import { fmt } from "./format";
import { ComputeIcon, DataIcon, MoneyIcon, GiftIcon } from "./Icons";
import { iconFor } from "./iconRegistry";

interface Props {
  game: GameState;
  onFund: (id: string, at?: { x: number; y: number }) => void;
  onChooseFork: (id: string, forkId: string) => void;
  onFundMegaproject: (at?: { x: number; y: number }) => void;
  /** Take one Megaproject Mandate (the permanent pick a completed cycle mints). */
  onPickMandate: (id: string) => void;
  /** Render WITHOUT the panel card + heading, for use inside a <Collapsible> (which
   *  already supplies both). Otherwise this nests a panel inside a panel and shows
   *  its heading twice. */
  bare?: boolean;
}

const RES_ICON = { compute: <ComputeIcon size={12} />, data: <DataIcon size={12} />, money: <MoneyIcon size={12} /> };

/**
 * Grand Challenges — late-game moonshots you fund over long horizons for a permanent
 * reward. Each card is a filling progress bar + three resource pledges + one Fund button;
 * completing one fires the tentpole "Challenge complete" moment (handled in App). Purely a
 * grind target: the whole board is hidden until the deep endgame, and the sim never funds.
 */
export function GrandChallengesPanel({ game, onFund, onChooseFork, onFundMegaproject, onPickMandate, bare = false }: Props) {
  const list = visibleChallenges(game);
  if (list.length === 0) return null;
  const doneCount = game.challenges.completed.length;
  const megaOpen = megaprojectUnlocked(game);
  const mega = megaOpen ? megaprojectView(game) : null;
  const canMega = megaOpen && canFundMegaproject(game);
  // Mandates: unspent picks, and a compact readout of what the held ones add up to.
  const picks = mandatePicksAvailable(game);
  const mandateHeld = game.megaprojects.mandates.length;
  const mm = mandateMods(game);
  const asPct = (b: { toNumber: () => number }) => Math.round((b.toNumber() - 1) * 100);
  const mandateSummary = `+${asPct(mm.compute)}% C · +${asPct(mm.data)}% D · +${asPct(mm.money)}% $`;

  const body = (
    <>
      {/* First-run scaffolding — drop it once a challenge is complete (noise sweep). */}
      {doneCount === 0 && <p className="challenges-intro">Moonshots that reshape the lab forever. Pour your output in — the reward is permanent.</p>}
      <div className="list">
        {list.map((def) => {
          const v = challengeView(game, def.id)!;
          const canFund = canFundChallenge(game, def.id);
          const pct = Math.round(v.progress * 100);
          const chosenForkId = game.challenges.forks[def.id];
          const chosenFork = def.forks?.find((f) => f.id === chosenForkId);
          const forkPending = pendingForkChallenge(game, def.id);
          // The reward line: for a forked challenge it's a choice (pre-completion) or the
          // chosen arm (post-choice); otherwise the fixed reward.
          const rewardDesc = def.forks
            ? (chosenFork ? chosenFork.reward.desc : "Your choice on completion")
            : def.reward.desc;
          const res = [
            { key: "compute" as const, funded: v.funded.compute, cost: v.cost.compute, done: v.done.compute },
            { key: "data" as const, funded: v.funded.data, cost: v.cost.data, done: v.done.data },
            { key: "money" as const, funded: v.funded.money, cost: v.cost.money, done: v.done.money },
          ];
          return (
            <div key={def.id} className={`challenge-card ${v.complete ? "complete" : ""}`}>
              <div className="challenge-top">
                <span className="challenge-icon" aria-hidden="true">{iconFor(def.icon, 22)}</span>
                <div className="challenge-titles">
                  <span className="challenge-name">{def.name}</span>
                  <span className="challenge-blurb">{def.blurb}</span>
                </div>
              </div>

              <div className="challenge-bar">
                <div className="challenge-fill" style={{ width: `${v.complete ? 100 : pct}%` }} />
                <span className="challenge-bar-label">{v.complete ? "Complete ✓" : `${pct}%`}</span>
              </div>

              <div className="challenge-res">
                {res.map((r) => (
                  <span key={r.key} className={`challenge-pledge ${r.done ? "done" : ""}`}>
                    <span className="challenge-pledge-ic">{RES_ICON[r.key]}</span>
                    {r.key === "money" ? "$" : ""}{fmt(r.funded)}<span className="challenge-pledge-sep">/</span>{r.key === "money" ? "$" : ""}{fmt(r.cost)}
                    {r.done && <span className="challenge-pledge-check">✓</span>}
                  </span>
                ))}
              </div>

              <div className="challenge-foot">
                <span className="challenge-reward"><GiftIcon size={13} /> {rewardDesc}</span>
                {v.complete ? (
                  forkPending ? <span className="challenge-choose">Choose reward ↓</span> : <span className="challenge-active">Active</span>
                ) : (
                  <button
                    className="btn challenge-fund"
                    disabled={!canFund}
                    onClick={(e) => onFund(def.id, { x: e.clientX, y: e.clientY })}
                  >
                    {canFund ? "Fund" : "Need output"}
                  </button>
                )}
              </div>

              {/* Fork picker — a completed moonshot's either/or reward. Once chosen it's
                  final; the panel then shows the banked arm as the reward line above. */}
              {forkPending && def.forks && (
                <div className="challenge-fork" role="group" aria-label="Choose this challenge's permanent reward">
                  {def.forks.map((f) => (
                    <button key={f.id} className="challenge-fork-arm" onClick={() => onChooseFork(def.id, f.id)}>
                      <span className="challenge-fork-label">{f.label}</span>
                      <span className="challenge-fork-reward">{f.reward.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Megaprojects II — the repeatable loop, once every challenge is done. Escalating
          cost, a bounded diminishing all-lane bonus, so the endgame never runs dry. */}
      {mega && (
        <div className="challenge-card mega-card">
          <div className="challenge-top">
            <span className="challenge-icon" aria-hidden="true">{iconFor(C.megaproject.icon, 22)}</span>
            <div className="challenge-titles">
              <span className="challenge-name">{C.megaproject.name} <span className="mega-level">· cycle {mega.level + 1}</span></span>
              <span className="challenge-blurb">{C.megaproject.blurb}</span>
            </div>
          </div>
          <div className="challenge-bar">
            <div className="challenge-fill" style={{ width: `${Math.round(mega.progress * 100)}%` }} />
            <span className="challenge-bar-label">{Math.round(mega.progress * 100)}%</span>
          </div>
          <div className="challenge-res">
            {([["compute", mega.funded.compute, mega.cost.compute, mega.done.compute] as const,
               ["data", mega.funded.data, mega.cost.data, mega.done.data] as const,
               ["money", mega.funded.money, mega.cost.money, mega.done.money] as const]).map(([key, funded, cost, done]) => (
              <span key={key} className={`challenge-pledge ${done ? "done" : ""}`}>
                <span className="challenge-pledge-ic">{RES_ICON[key]}</span>
                {key === "money" ? "$" : ""}{fmt(funded)}<span className="challenge-pledge-sep">/</span>{key === "money" ? "$" : ""}{fmt(cost)}
                {done && <span className="challenge-pledge-check">✓</span>}
              </span>
            ))}
          </div>
          <div className="challenge-foot">
            <span className="challenge-reward"><GiftIcon size={13} /> +{mega.bonusPct.toFixed(1)}% to ALL output {mega.level > 0 ? "(held)" : "on first cycle"}</span>
            <button className="btn challenge-fund" disabled={!canMega} onClick={(e) => onFundMegaproject({ x: e.clientX, y: e.clientY })}>
              {canMega ? "Fund" : "Need output"}
            </button>
          </div>

          {/* MANDATES — what makes cycle 30 worth as much as cycle 5. The bounded
              bonus above converges to +33%, so on its own the loop was asking for
              exponentially more output in exchange for the fourth decimal place.
              Each completed cycle mints one permanent pick; picks stack. */}
          {mandateHeld > 0 && picks === 0 && (
            <div className="mandate-held">
              <span className="mandate-held-label">Mandates held</span>
              <span className="mandate-held-mult">{mandateSummary}</span>
            </div>
          )}
          {picks > 0 && (
            <div className="mandate-pick">
              <div className="mandate-pick-head">
                {picks === 1 ? "A mandate is yours to write" : `${picks} mandates are yours to write`}
                <span className="mandate-pick-sub">Permanent. Pick the same one twice to stack it.</span>
              </div>
              <div className="mandate-arms" role="group" aria-label="Choose a permanent mandate">
                {mandateDefs().map((d) => (
                  <button key={d.id} className="mandate-arm" onClick={() => onPickMandate(d.id)}>
                    <span className="mandate-arm-name">{d.name}</span>
                    <span className="mandate-arm-desc">{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (bare) return body;
  return (
    <section className="panel challenges">
      <div className="challenges-head">
        <h2 className="panel-title" style={{ margin: 0 }}>Grand Challenges</h2>
        <span className="challenges-count">{doneCount}/{C.list.length}</span>
      </div>
      {body}
    </section>
  );
}
