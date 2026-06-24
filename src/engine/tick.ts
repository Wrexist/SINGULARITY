import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { derive } from "./derive";
import type { Derived, GameState } from "./types";

/**
 * The deterministic heartbeat. Given a state and elapsed time, returns the next
 * state. The engine never reads the wall clock (CLAUDE.md hard rule) — time is
 * passed in, which makes offline progress "just a tick with a big elapsedMs".
 *
 * Returns a new object; never mutates the input (keeps it pure and testable).
 */
export function tick(state: GameState, elapsedMs: number): GameState {
  if (elapsedMs <= 0) return state;
  const seconds = elapsedMs / 1000;

  // Segment the window at the next modifier expiry. Otherwise a large frame
  // (tab-resume) or an offline catch-up would apply an about-to-expire buff to
  // the WHOLE window — e.g. a buff with 5s left doubling 8h of offline output.
  if (state.modifiers.length > 0) {
    let minRem = Infinity;
    for (const m of state.modifiers) if (m.remainingSec < minRem) minRem = m.remainingSec;
    if (minRem < seconds) {
      const firstMs = minRem * 1000;
      return tick(tick(state, firstMs), elapsedMs - firstMs);
    }
  }

  const d = derive(state);

  let compute = state.resources.compute.add(d.computePerSec.mul(seconds));
  let data = state.resources.data.add(d.dataPerSec.mul(seconds));
  let money = state.resources.money.add(d.passiveMoneyPerSec.mul(seconds));
  let lifetimeMoney = state.lifetimeMoney.add(d.passiveMoneyPerSec.mul(seconds));

  let run = { ...state.run };

  // Advance the active run; it may complete (and, with automation, re-loop)
  // multiple times within one big offline tick.
  if (run.active) {
    let remaining = seconds;
    // Guard against pathological loops on huge offline deltas.
    let guard = 0;
    while (run.active && remaining > 0 && guard < 100000) {
      guard++;
      const secsToFinish = (1 - run.progress) * d.runDurationSec;
      if (remaining >= secsToFinish) {
        // Run completes.
        remaining -= secsToFinish;
        run = { active: false, progress: 1, readyToClaim: true };
        if (d.autoClaim) {
          ({ data, money, lifetimeMoney } = claimInto(d, data, money, lifetimeMoney));
          run = { active: false, progress: 0, readyToClaim: false };
          if (d.autoTrain && compute.gte(d.runComputeCost)) {
            compute = compute.sub(d.runComputeCost);
            run = { active: true, progress: 0, readyToClaim: false };
          } else {
            break;
          }
        } else {
          break; // Sits ready-to-claim until the player (or auto-claim) acts.
        }
      } else {
        run.progress += remaining / d.runDurationSec;
        remaining = 0;
      }
    }
  } else if (run.readyToClaim && d.autoClaim) {
    // A run finished last tick before auto-claim existed; claim it now.
    ({ data, money, lifetimeMoney } = claimInto(d, data, money, lifetimeMoney));
    run = { active: false, progress: 0, readyToClaim: false };
  } else if (!run.active && !run.readyToClaim && d.autoTrain && compute.gte(d.runComputeCost)) {
    // Idle + auto-train: kick off a fresh run.
    compute = compute.sub(d.runComputeCost);
    run = { active: true, progress: 0, readyToClaim: false };
  }

  // Regulatory Heat cools passively when you're not buying shady data.
  const heat = Math.max(0, state.heat - balance.heat.coolPerSec * seconds);

  // World-event modifiers tick down; expired ones drop off.
  let modifiers = state.modifiers;
  if (modifiers.length > 0) {
    modifiers = modifiers
      .map((m) => ({ ...m, remainingSec: m.remainingSec - seconds }))
      .filter((m) => m.remainingSec > 0);
  }

  return {
    ...state,
    resources: { compute, data, money },
    lifetimeMoney,
    run,
    heat,
    modifiers,
  };
}

function claimInto(d: Derived, data: Big, money: Big, lifetimeMoney: Big) {
  return {
    data: data.add(d.runDataYield),
    money: money.add(d.runMoneyYield),
    lifetimeMoney: lifetimeMoney.add(d.runMoneyYield),
  };
}
