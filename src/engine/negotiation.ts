import { balance } from "./balance/config";
import { Big } from "./math/Big";
import { clampSuspicion } from "./regulator";
import { shiftAlignment } from "./alignment";
import type { WorldEventResult } from "./actions";
import type { ActiveModifier, GameState } from "./types";

/**
 * The Regulator Negotiation (IMPROVEMENTS #9) — pure and fully DETERMINISTIC
 * (no RNG anywhere): when suspicion reaches the "Under investigation" line,
 * Supervisor Chen offers a sit-down with three branches — settle (pay, clean
 * slate), lobby (cheaper, shadier, doomer tilt) or defy (keep the money, rally
 * the lab, make an enemy). A clean lab never crosses the line, so the balance
 * sim and honest players are untouched by construction.
 *
 * One-time-ness is structural, not a flag: settle/lobby drop suspicion below
 * the trigger, and every branch leaves a timed factor-1 "truce" marker in the
 * modifier bar — Chen returns only if suspicion is STILL high when it expires.
 */

const R = balance.regulator;
const N = R.negotiation;

export const NEGOTIATION_ID = "regulator_negotiation";
const TRUCE_ID = "regulator_truce";

/** Chen is at the door: suspicion over the line and no truce paperwork pending. */
export function negotiationDue(state: GameState): boolean {
  return state.suspicion >= N.at && !state.modifiers.some((m) => m.id === TRUCE_ID || m.id === NEGOTIATION_ID);
}

/** The card content (WorldEventCard-compatible; branch order = apply order). */
export function negotiationOffer(state: GameState): WorldEventResult {
  const settlePct = Math.round(-N.settle.moneyPct * 100);
  const lobbyPct = Math.round(-N.lobby.moneyPct * 100);
  return {
    id: NEGOTIATION_ID,
    headline: `${R.name} Requests a Meeting`,
    body:
      state.suspicion >= (R.tiers[3]?.at ?? 80)
        ? "No aides, no lawyers, one folder. It has your name on it and it is thicker than last time. 'Let's resolve this like adults,' Chen says, not meaning it."
        : "A formal case is open. Chen slides three options across the table and watches which one your hand moves toward.",
    tone: "bad",
    summary: "",
    choices: [
      { label: `Settle — pay the fine (−${settlePct}% cash)`, summary: "Suspicion drops sharply" },
      { label: `Lobby quietly (−${lobbyPct}% cash)`, summary: "Some suspicion + heat relief" },
      { label: "Defy — see you in court", summary: `Compute ×${N.defy.buffFactor} · ${N.defy.buffSec}s, but Chen escalates` },
    ],
  };
}

/** A factor-1 (identity) marker so the bar shows the truce and gates a re-fire. It is
 *  a status, not an incident (see actions.ts isIncident): nothing to work, no fire. */
function truceMarker(label: string, remainingSec: number = N.truceSec): ActiveModifier {
  return { id: TRUCE_ID, target: "moneyMult", factor: 1, remainingSec, label, tone: "bad" };
}

/**
 * The truce as it crosses a ship. prestige() starts the fresh run's modifiers from
 * scratch, but suspicion — the regulator's long memory — carries over, so dropping
 * the truce put Chen back at the door on the first tick of the new run, where
 * "Settle: −20% cash" cost 20% of ~$0. The pending paperwork carries with the
 * memory: the same time left, floored at `shipTruceFloorSec` so the fresh lab has
 * something in the till when he arrives. [] when no truce is pending and Chen is not
 * due (a clean lab, and the sim, ship exactly as before).
 */
export function truceAcrossShip(state: GameState): ActiveModifier[] {
  const truce = state.modifiers.find((m) => m.id === TRUCE_ID && m.remainingSec > 0);
  // Shipping with Chen AT THE DOOR (his meeting pending, no paperwork yet) gets the same
  // floor: the fresh lab used to meet him on its first tick, where Settle cost 20% of ~$0.
  if (!truce) return negotiationDue(state) ? [truceMarker(`${R.name} reschedules the meeting`, N.shipTruceFloorSec)] : [];
  return [{
    id: TRUCE_ID,
    target: truce.target,
    factor: 1,
    remainingSec: Math.max(truce.remainingSec, N.shipTruceFloorSec),
    label: truce.label,
    tone: truce.tone,
  }];
}

/** Apply the chosen branch. Same-ref no-op on an unknown index. */
export function applyNegotiationChoice(state: GameState, choiceIndex: number): GameState {
  const mods = (extra: ActiveModifier[], label: string) => [
    ...state.modifiers.filter((m) => m.id !== TRUCE_ID && m.id !== NEGOTIATION_ID),
    ...extra,
    truceMarker(label),
  ];
  if (choiceIndex === 0) {
    // Settle: money down, suspicion way down. The clean-hands ending.
    return {
      ...state,
      resources: { ...state.resources, money: state.resources.money.mul(Math.max(0, 1 + N.settle.moneyPct)).max(Big.ZERO) },
      suspicion: clampSuspicion(state.suspicion + N.settle.suspicion),
      modifiers: mods([], `${R.name}: case settled`),
      stats: { ...state.stats, worldEventsResolved: state.stats.worldEventsResolved + 1 },
    };
  }
  if (choiceIndex === 1) {
    // Lobby: cheaper, partial relief, heat eases, doomer tilt.
    return {
      ...state,
      resources: { ...state.resources, money: state.resources.money.mul(Math.max(0, 1 + N.lobby.moneyPct)).max(Big.ZERO) },
      suspicion: clampSuspicion(state.suspicion + N.lobby.suspicion),
      heat: Math.max(0, Math.min(100, state.heat + N.lobby.heat)),
      alignment: shiftAlignment(state.alignment, N.lobby.alignment),
      modifiers: mods([], `${R.name}: quietly appeased`),
      stats: { ...state.stats, worldEventsResolved: state.stats.worldEventsResolved + 1 },
    };
  }
  if (choiceIndex === 2) {
    // Defy: the lab rallies behind you — briefly — and the file gets thicker.
    const buff: ActiveModifier = {
      id: `${NEGOTIATION_ID}_rally`,
      target: "computeMult",
      factor: N.defy.buffFactor,
      remainingSec: N.defy.buffSec,
      label: `Defiance ×${N.defy.buffFactor}`,
      tone: "good",
    };
    return {
      ...state,
      suspicion: clampSuspicion(state.suspicion + N.defy.suspicion),
      heat: Math.max(0, Math.min(100, state.heat + N.defy.heat)),
      alignment: shiftAlignment(state.alignment, N.defy.alignment),
      modifiers: mods([buff], `${R.name} prepares the paperwork`),
      stats: { ...state.stats, worldEventsResolved: state.stats.worldEventsResolved + 1 },
    };
  }
  return state;
}
