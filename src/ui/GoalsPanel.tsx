import { useEffect, useMemo } from "react";
import type { GameState } from "../engine/types";
import { Collapsible } from "./Collapsible";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { ContractsPanel } from "./ContractsPanel";
import { GrandChallengesPanel } from "./GrandChallengesPanel";
import { TrialsPanel, trialsDoneCount, trialsTotal } from "./TrialsPanel";
import { DoctrinePanel, doctrineDoneCount, doctrineTotal } from "./DoctrinePanel";
import { AchievementsBoard } from "./AchievementsBoard";
import { MilestonesBoard } from "./MilestonesBoard";
import { EmptyState } from "./EmptyState";
import { objectivesUnlocked } from "../engine/objectives";
import { challengesUnlocked } from "../engine/challenges";
import { trialsUnlocked } from "../engine/trials";
import { doctrineUnlocked } from "../engine/doctrine";
import { productsUnlocked } from "../engine/products";
import { goalsCounts } from "./goalsCount";
import { TargetIcon } from "./Icons";

export type GoalsSection = "now" | "long" | "collection";

interface Props {
  game: GameState;
  section: GoalsSection;
  onSection: (s: GoalsSection) => void;
  /** Contracts appear on the same gate the Lab used before the move. */
  showContracts: boolean;
  onClaimObjective: (id: string, target?: "computeMult" | "dataMult" | "moneyMult", at?: { x: number; y: number }) => void;
  onClaimContract: (id: string, rep: number, title: string) => void;
  onClaimSponsor: () => void;
  onFundChallenge: (id: string, at?: { x: number; y: number }) => void;
  onChooseFork: (id: string, forkId: string) => void;
  onFundMegaproject: (at?: { x: number; y: number }) => void;
  onPickMandate: (id: string) => void;
  onStartTrial: (id: string) => void;
  onAbandonTrial: () => void;
  onClaimDoctrine: (id: string) => void;
  /** Fired when the Collection horizon is actually on screen — that, and not
   *  opening GOALS at all, is the moment new achievements have been seen. */
  onCollectionSeen: () => void;
}

/**
 * GOALS — the single destination for "what should I do next?".
 *
 * Seven goal/reward systems used to live in four places with four visual
 * languages: Objectives on Build, Contracts / Grand Challenges / Trials / Doctrine
 * folded into HQ, Product Milestones folded into Products, and Achievements behind
 * a nav modal. Answering that one question meant checking all seven. They are all
 * here now, grouped by HORIZON rather than by which system happens to own them:
 *
 *   Now        — things waiting on you today, and claimable.
 *   Long game  — the chases that span generations.
 *   Collection — what you have already earned.
 *
 * Each board keeps its own interaction logic untouched; what changes is that there
 * is one door instead of seven.
 */
export function GoalsPanel({
  game, section, onSection, showContracts,
  onClaimObjective, onClaimContract, onClaimSponsor,
  onFundChallenge, onChooseFork, onFundMegaproject, onPickMandate,
  onStartTrial, onAbandonTrial, onClaimDoctrine, onCollectionSeen,
}: Props) {
  const counts = useMemo(() => goalsCounts(game), [game]);

  const hasLong = challengesUnlocked(game) || trialsUnlocked(game) || doctrineUnlocked(game);
  const showMilestones = productsUnlocked(game);
  // Before anything but Achievements exists there is nothing to switch between,
  // so the switcher stays hidden and the destination is simply the collection
  // (reveal depth in waves — the same rule the Lab's sections follow).
  const sectioned = objectivesUnlocked(game) || showContracts || hasLong;
  const active: GoalsSection = sectioned ? section : "collection";

  // Clearing the "new achievements" badge on the nav tap marked them seen for a
  // player who came for a contract and never opened Collection — the badge lied
  // about what they had looked at. Covers the early-game case too, where
  // Collection is the only section there is.
  const achCount = game.achievements.length;
  useEffect(() => {
    if (active === "collection") onCollectionSeen();
  }, [active, achCount, onCollectionSeen]);

  return (
    <>
      {sectioned && (
        <nav className="labnav" aria-label="Goal horizons">
          <button className={`tab ${active === "now" ? "on" : ""}`} aria-current={active === "now" ? "true" : undefined} onClick={() => onSection("now")}>
            Now{counts.now > 0 && <span className="tab-dot">{counts.now}</span>}
          </button>
          <button className={`tab ${active === "long" ? "on" : ""}`} aria-current={active === "long" ? "true" : undefined} onClick={() => onSection("long")}>
            Long game{counts.long > 0 && <span className="tab-dot">{counts.long}</span>}
          </button>
          <button className={`tab ${active === "collection" ? "on" : ""}`} aria-current={active === "collection" ? "true" : undefined} onClick={() => onSection("collection")}>
            Collection
          </button>
        </nav>
      )}

      {active === "now" && (
        <>
          {counts.now === 0 && (
            <section className="panel">
              <EmptyState
                icon={<TargetIcon size={20} />}
                text="Nothing waiting on you."
                hint="Objectives and contracts fill in as the lab runs — check the long game while these tick over."
              />
            </section>
          )}
          {objectivesUnlocked(game) && <ObjectivesPanel game={game} onClaim={onClaimObjective} />}
          {showContracts && (
            <Collapsible title="Contracts" defaultOpen={counts.contracts > 0} badge={counts.contracts > 0 ? `${counts.contracts} ready` : undefined}>
              <ContractsPanel bare game={game} onClaim={onClaimContract} onClaimSponsor={onClaimSponsor} />
            </Collapsible>
          )}
        </>
      )}

      {active === "long" && (
        <>
          {!hasLong && (
            <section className="panel">
              <EmptyState
                icon={<TargetIcon size={20} />}
                text="The long game opens later."
                hint="Grand Challenges, Trials and Doctrine unlock as your lab ships and grows."
              />
            </section>
          )}
          {challengesUnlocked(game) && (
            <Collapsible title="Grand Challenges" defaultOpen={counts.forkPending} badge={counts.forkPending ? "decision" : `${counts.challengesDone}/${counts.challengesSeen}`}>
              <GrandChallengesPanel bare game={game} onFund={onFundChallenge} onChooseFork={onChooseFork} onFundMegaproject={onFundMegaproject} onPickMandate={onPickMandate} />
            </Collapsible>
          )}
          {trialsUnlocked(game) && (
            <Collapsible title="Trials" defaultOpen={!!game.activeTrial} badge={game.activeTrial ? "running" : `${trialsDoneCount(game)}/${trialsTotal}`}>
              <TrialsPanel game={game} onStart={onStartTrial} onAbandon={onAbandonTrial} />
            </Collapsible>
          )}
          {doctrineUnlocked(game) && (
            <Collapsible title="Doctrine" defaultOpen={counts.doctrineClaimable > 0} badge={counts.doctrineClaimable > 0 ? `${counts.doctrineClaimable} to claim` : `${doctrineDoneCount(game)}/${doctrineTotal(game)}`}>
              <DoctrinePanel game={game} onClaim={onClaimDoctrine} />
            </Collapsible>
          )}
        </>
      )}

      {active === "collection" && (
        <>
          {/* Milestones lead: the achievements wall runs to 50+ rows, so a fold
              placed under it is a fold nobody ever finds. One line here, then the
              wall. */}
          {showMilestones && (
            <Collapsible title="Product Milestones" badge={`${counts.ms.earned}/${counts.ms.total}`}>
              <MilestonesBoard game={game} />
            </Collapsible>
          )}
          <section className="panel">
            <div className="goals-head">
              <h2 className="panel-title" style={{ margin: 0 }}>Achievements</h2>
              <span className="collapsible-badge">{counts.ach.earned}/{counts.ach.total}</span>
            </div>
            <AchievementsBoard game={game} />
          </section>
        </>
      )}
    </>
  );
}
