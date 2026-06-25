import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { derive } from "./derive";
import { simulateProducts } from "./products";
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
    // Drop already-expired (or malformed) modifiers first. Otherwise minRem
    // could be <= 0, making firstMs <= 0 and the recursive split spin without
    // ever making progress.
    const active = state.modifiers.filter((m) => Number.isFinite(m.remainingSec) && m.remainingSec > 0);
    if (active.length !== state.modifiers.length) {
      return tick({ ...state, modifiers: active }, elapsedMs);
    }
    let minRem = Infinity;
    for (const m of active) if (m.remainingSec < minRem) minRem = m.remainingSec;
    if (minRem > 0 && minRem < seconds) {
      const firstMs = minRem * 1000;
      return tick(tick(state, firstMs), elapsedMs - firstMs);
    }
  }

  const d = derive(state);

  // Compute-focus gate (Phase 2): auto-train only fires once Compute reaches
  // runCost / focus, so lowering focus lets the bank float up toward expensive
  // research instead of being drained every run. focus = 0 holds training
  // entirely. Manual runs (startRun) ignore this — the player can always run.
  const autoTrainReady = (c: Big): boolean =>
    d.autoTrain && state.computeFocus > 0 && c.gte(d.runComputeCost.div(state.computeFocus));

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
          if (autoTrainReady(compute)) {
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
  } else if (!run.active && !run.readyToClaim && autoTrainReady(compute)) {
    // Idle + auto-train (and focus allows): kick off a fresh run.
    compute = compute.sub(d.runComputeCost);
    run = { active: true, progress: 0, readyToClaim: false };
  }

  // Staff payroll (Phase 2): an ongoing Money drain, floored at zero so it never
  // goes negative. Only Money is touched — lifetimeMoney tracks earnings, not net.
  if (d.payrollPerSec.gt(0)) {
    money = money.sub(d.payrollPerSec.mul(seconds)).max(Big.ZERO);
  }

  // Regulatory Heat cools passively when you're not buying shady data.
  let heat = Math.max(0, state.heat - balance.heat.coolPerSec * seconds);

  // Phase 3 — released products earn Money (subs − serving − marketing) and may
  // add Heat. Money-based, so they keep running across a prestige reset.
  let products = state.products;
  if (products.active.length > 0) {
    const sim = simulateProducts(products, seconds);
    products = sim.products;
    money = money.add(sim.moneyDelta).max(Big.ZERO);
    if (sim.moneyDelta > 0) lifetimeMoney = lifetimeMoney.add(sim.moneyDelta);
    heat = Math.max(0, Math.min(balance.heat.max, heat + sim.heatDelta));
  }

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
    products,
  };
}

function claimInto(d: Derived, data: Big, money: Big, lifetimeMoney: Big) {
  return {
    data: data.add(d.runDataYield),
    money: money.add(d.runMoneyYield),
    lifetimeMoney: lifetimeMoney.add(d.runMoneyYield),
  };
}
