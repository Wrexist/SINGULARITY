import { Capacitor, registerPlugin } from "@capacitor/core";
import type { GameState } from "../engine/types";

/**
 * Game Center bridge (IMPROVEMENTS #18) — leaderboards for ships/ascensions and
 * an achievement mirror. The app side is COMPLETE and self-guarding: everything
 * routes through a plugin named "GameConnect" (the de-facto community API:
 * signIn / submitScore / unlockAchievement / showLeaderboard) and every call is
 * a silent no-op until such a plugin is actually installed in the native shell.
 *
 * THE PLUGIN: no maintained npm plugin supports Capacitor 7 (this app's), so a
 * small GameKit wrapper lives in-repo at native/game-connect. It is installed by one
 * package.json line once a Mac/TestFlight build has verified it (Swift can't be
 * compiled where it was written). Owner steps live in GAME_CENTER_SETUP.md; no code
 * changes are needed here when it lands.
 *
 * Privacy: Game Center is Apple's own service, invoked only through the OS —
 * the app still sends nothing anywhere itself ("Data Not Collected" holds for
 * the app; Apple's Game Center terms cover the rest).
 */

/** App Store Connect identifiers (create these EXACT ids — see the setup doc). */
export const GC_IDS = {
  leaderboardShips: "grp.singularity.ships",
  leaderboardAscensions: "grp.singularity.ascensions",
  /** Game Center achievement id for an in-game achievement id. */
  achievement: (id: string) => `grp.singularity.ach.${id}`,
};

interface GameConnectPlugin {
  signIn(): Promise<{ player_name?: string }>;
  submitScore(opts: { leaderboardID: string; totalScoreAmount: number }): Promise<void>;
  unlockAchievement(opts: { achievementID: string }): Promise<void>;
  showLeaderboard(opts: { leaderboardID: string }): Promise<void>;
}

const plugin = registerPlugin<GameConnectPlugin>("GameConnect");

let signedIn = false;
let declined = false;
let signInFlight: Promise<boolean> | null = null;

/** True only in a native shell that actually carries the plugin. */
export function gameCenterAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("GameConnect");
}

/** Sign in once per session; safe to call opportunistically. Concurrent calls
 *  share one in-flight attempt (a prestige fires score submits + achievement
 *  mirrors back-to-back — the player must never see two GC prompts), and a
 *  decline is remembered for the session so we don't nag. */
export function gameCenterSignIn(): Promise<boolean> {
  if (!gameCenterAvailable() || declined) return Promise.resolve(false);
  if (signedIn) return Promise.resolve(true);
  if (!signInFlight) {
    signInFlight = plugin
      .signIn()
      .then(() => { signedIn = true; return true; })
      .catch(() => { declined = true; return false; }) // declined / parental controls — stay silent
      .finally(() => { signInFlight = null; });
  }
  return signInFlight;
}

/** Push the two career scores. Call after a ship/ascension; no-op otherwise. */
export async function gameCenterSubmitScores(game: GameState): Promise<void> {
  if (!(await gameCenterSignIn())) return;
  try {
    await plugin.submitScore({ leaderboardID: GC_IDS.leaderboardShips, totalScoreAmount: game.prestige.ships });
    if (game.stats.ascensions > 0) {
      await plugin.submitScore({ leaderboardID: GC_IDS.leaderboardAscensions, totalScoreAmount: game.stats.ascensions });
    }
  } catch {
    /* transient GC failure — next ship resubmits the (monotonic) totals */
  }
}

/** Mirror an in-game achievement unlock to Game Center. */
export async function gameCenterUnlock(achievementId: string): Promise<void> {
  if (!(await gameCenterSignIn())) return;
  try {
    await plugin.unlockAchievement({ achievementID: GC_IDS.achievement(achievementId) });
  } catch {
    /* unmapped id or offline — harmless, GC achievements are best-effort */
  }
}

/** Open the native leaderboard sheet (Settings entry point). */
export async function gameCenterShowLeaderboards(): Promise<void> {
  if (!(await gameCenterSignIn())) return;
  try {
    await plugin.showLeaderboard({ leaderboardID: GC_IDS.leaderboardShips });
  } catch {
    /* sheet failed to open — nothing to clean up */
  }
}
