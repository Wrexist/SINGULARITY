import type { GameState } from "../engine/types";
import { objectivesUnlocked, claimableObjectives } from "../engine/objectives";
import { contractBoard, sponsorView } from "../engine/contracts";
import { challengesUnlocked, visibleChallenges, pendingForkChallenge } from "../engine/challenges";
import { doctrineUnlocked, doctrinePerks, canClaimDoctrine } from "../engine/doctrine";
import { achievementDefs } from "../engine/achievements";
import { productMilestones } from "../engine/balance/products";

/**
 * The numbers behind every GOALS badge, from one scan.
 *
 * The 2026-08 audit's finding was that seven goal systems in four places gave the
 * player no single honest answer to "is anything waiting on me?" — and that badges
 * which are true too often teach players to ignore badges everywhere. So this
 * counts only things that are genuinely CLAIMABLE NOW: an objective you can bank,
 * a contract or sponsor that is met, a Grand Challenge waiting on your reward
 * choice, a Doctrine perk you have earned the right to take.
 *
 * Deliberately NOT counted: anything merely affordable or fundable (Grand
 * Challenge pours and Trials are open-ended sinks, so counting them would light
 * the badge permanently — the exact failure the audit recorded for the old
 * Reputation/Endowment advisor items), and anything auto-awarded (milestones and
 * achievements land on their own; the collection tallies below are for display).
 *
 * Pure and engine-only, so it can be tested without rendering the destination.
 */
export function goalsCounts(game: GameState) {
  const objectives = objectivesUnlocked(game) ? claimableObjectives(game) : 0;
  // The sponsor card renders whenever one is rolled (see ContractsPanel: alone once
  // the ladder is clear, on top of it from the first Ship on), so count it whenever
  // it is ready — a badge must never promise a row the player cannot find, and
  // rollSponsor only rolls one where the board shows it.
  const board = contractBoard(game);
  const sponsorReady = !!sponsorView(game)?.ready;
  const contracts = board.filter((c) => c.ready).length + (sponsorReady ? 1 : 0);

  const seen = challengesUnlocked(game) ? visibleChallenges(game) : [];
  const forkPending = seen.some((c) => pendingForkChallenge(game, c.id));
  const doctrine = doctrineUnlocked(game) ? doctrinePerks().filter((p) => canClaimDoctrine(game, p.id)).length : 0;

  const now = objectives + contracts;
  const long = doctrine + (forkPending ? 1 : 0);
  return {
    objectives,
    contracts,
    /** Claimables on the "Now" horizon. */
    now,
    /** Claimables on the "Long game" horizon. */
    long,
    /** The nav badge: everything waiting on the player, across all seven systems. */
    claimable: now + long,
    challengesDone: seen.filter((c) => game.challenges.completed.includes(c.id)).length,
    challengesSeen: seen.length,
    forkPending,
    doctrineClaimable: doctrine,
    ach: { earned: new Set(game.achievements).size, total: achievementDefs.length },
    ms: { earned: game.products.milestones.length, total: productMilestones.length },
  };
}

/**
 * Whether GOALS renders the Contracts board. It opens with the first payout (the
 * same wave that reveals Research) and then stays open for good: the ladder lives
 * across Ships, while a Ship resets Data and research to zero — so keying on those
 * alone hid the board at the very moment "Ship It" became claimable. It also always
 * shows while anything on it is ready, because the nav badge and the advisor chip
 * count those rows, and a badge must never promise a row the player cannot find.
 */
export function contractsShown(game: GameState, readyContracts: number = goalsCounts(game).contracts): boolean {
  return readyContracts > 0 || game.prestige.ships > 0 || game.resources.data.gt(0) || game.research.length > 0;
}

/** Everything waiting on the player right now — the GOALS nav badge. */
export function goalsClaimable(game: GameState): number {
  return goalsCounts(game).claimable;
}
