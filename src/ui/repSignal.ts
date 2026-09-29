import type { GameState } from "../engine/types";
import { directivePicksAvailable } from "../engine/reputation";

/**
 * An earned Endowment Directive pick is waiting on the player's choice. Drives the
 * small, wordless dot on the path to it (Lab nav → HQ segment → Reputation strip),
 * which clears the moment the pick is made. Pure, so it can be tested unrendered.
 */
export function directivePickWaiting(game: GameState): boolean {
  return directivePicksAvailable(game) > 0;
}
