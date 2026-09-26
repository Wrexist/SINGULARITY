import { balance } from "./balance/config";
import type { GameState } from "./types";

/**
 * Which Lab surfaces are open — the progressive-disclosure gates, in one place so
 * the tabs the App draws and the tabs the advisor points at can never disagree.
 *
 * A first-generation lab reveals in waves (GDD): Research with the first payout
 * (you need Data to research), then the Ship panel, the Data Market and the Team
 * with the first research node.
 *
 * Once the lab has shipped, everything stays open. A Ship zeroes Data and research,
 * so gates keyed on those alone closed again at the start of every generation: HQ
 * and Research until the first payout, and the Ship panel (Lab Reputation, the
 * Endowment, Legacy Investments) and the Team until the first research node. That
 * is exactly when the weights and Reputation the Ship just banked are spent, and
 * when the staff it kept (unassigned by the reset) need placing again.
 */
export interface LabReveal {
  /** The Research section — and with it the Build / Research / HQ switcher. */
  research: boolean;
  /** The Ship panel on HQ: Lab Reputation, the Endowment, Legacy Investments. */
  prestige: boolean;
  /** The Data Market on Research. */
  market: boolean;
  /** The Team tab. */
  staff: boolean;
}

export function labReveal(state: GameState): LabReveal {
  const shipped = state.prestige.ships > 0;
  const researched = shipped || state.research.length > 0;
  return {
    research: researched || state.resources.data.gt(0),
    prestige: researched,
    market: researched,
    staff: balance.staff.enabled && (shipped || state.research.length >= balance.staff.revealAtResearch),
  };
}
