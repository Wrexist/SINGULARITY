import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { derive } from "./derive";
import { simulateProducts, advanceUpgrades, applyMilestones } from "./products";
import { advanceTraining } from "./employees";
import { accrueStats } from "./stats";
import { applyAchievements } from "./achievements";
import { applyAutoResearch } from "./actions";
import { rivalsBeaten } from "./market";
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
  // add Heat. Money-based, so they keep running across a prestige reset. We run
  // the simulator unconditionally: with no active products it still drifts the
  // frontier, so a future launch lands against an up-to-date competitive bar.
  const sim = simulateProducts(state.products, seconds, d.productModsById);
  let products = sim.products;
  if (state.products.active.length > 0) {
    money = money.add(sim.moneyDelta).max(Big.ZERO);
    if (sim.moneyDelta > 0) lifetimeMoney = lifetimeMoney.add(sim.moneyDelta);
    heat = Math.max(0, Math.min(balance.heat.max, heat + sim.heatDelta));
  }

  // Timed version upgrades drain Compute+Data over their research window. Run after
  // the economy sim (so completions catch up to the freshly-drifted frontier) and
  // pass the live pools so an unaffordable tick just stalls that upgrade.
  if (products.active.some((p) => p.upgrade)) {
    const upg = advanceUpgrades(products, compute.toNumber(), data.toNumber(), seconds, d.productModsById);
    products = upg.products;
    if (upg.computeSpent > 0) compute = compute.sub(upg.computeSpent).max(Big.ZERO);
    if (upg.dataSpent > 0) data = data.sub(upg.dataSpent).max(Big.ZERO);
  }

  // World-event modifiers tick down; expired ones drop off.
  let modifiers = state.modifiers;
  if (modifiers.length > 0) {
    modifiers = modifiers
      .map((m) => ({ ...m, remainingSec: m.remainingSec - seconds }))
      .filter((m) => m.remainingSec > 0);
  }

  // Employee training advances on the wall clock (completions level them up).
  const trained = advanceTraining(state.employees, seconds);

  // Accrue lifetime stats (peaks/totals/playtime) from this tick's finished numbers.
  // earnedThisTick = the run-money added to lifetimeMoney this tick (already ≥ 0).
  // rivalsBeaten reads only .products, so evaluate it against THIS tick's updated
  // products (best-so-far is tracked monotonically inside accrueStats).
  const rivalsNow = rivalsBeaten({ ...state, products });
  const stats = accrueStats(
    state.stats, products, state.research.length, d.computePerSec,
    lifetimeMoney.sub(state.lifetimeMoney), seconds, rivalsNow,
  );

  // Award any newly-reached product milestones (one-time Money rewards). Folded in
  // last so it sees this tick's fresh user/MRR/version totals.
  const ms = applyMilestones({
    ...state,
    resources: { compute, data, money },
    lifetimeMoney,
    run,
    heat,
    modifiers,
    products,
    employees: trained.employees,
    stats,
  });
  // Award any newly-unlocked achievements (reads the fresh stats above). Pure +
  // idempotent; the store diffs achievements to surface a toast.
  const awarded = applyAchievements(ms.state).state;

  // Research Director (R5.3): if owned, auto-buy affordable research from the
  // freshly-updated pools. No-op (same reference) until the perk is bought, so
  // the tuned curve / sim are untouched. Runs here so it works offline too.
  return applyAutoResearch(awarded);
}

function claimInto(d: Derived, data: Big, money: Big, lifetimeMoney: Big) {
  return {
    data: data.add(d.runDataYield),
    money: money.add(d.runMoneyYield),
    lifetimeMoney: lifetimeMoney.add(d.runMoneyYield),
  };
}
