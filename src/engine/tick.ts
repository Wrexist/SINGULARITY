import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { derive, runYieldAt, runsPerSec } from "./derive";
import { simulateProducts, advanceUpgrades, applyMilestones, productMetrics, settledMrr } from "./products";
import { advanceTraining, payrollPaid } from "./employees";
import { accrueStats } from "./stats";
import { applyAchievements } from "./achievements";
import { grantEarnedComponents } from "./components";
import { applyAutoResearch } from "./actions";
import { rivalsBeaten } from "./market";
import type { Derived, GameState } from "./types";

/** Remaining time below this is float dust from the expiry split, not a live buff. */
const MODIFIER_EPSILON_SEC = 1e-9;
/** Hard ceiling on simultaneously-active modifiers processed in a tick. The window-split
 *  recursion below descends once per distinct expiry, so this bounds its depth against a
 *  crafted/pathological buff stack. Sits far above any reachable legit stack. The save
 *  loader applies the SAME cap (capActiveModifiers), so a reload never drops a buff the
 *  running game was still honouring. */
export const MAX_ACTIVE_MODIFIERS = 48;

/** Keep at most MAX_ACTIVE_MODIFIERS, preferring the soonest-expiring ones. Returns the
 *  input unchanged when it is already within the cap. Shared by tick() and the loader. */
export function capActiveModifiers<T extends { remainingSec: number }>(mods: T[]): T[] {
  if (mods.length <= MAX_ACTIVE_MODIFIERS) return mods;
  return [...mods].sort((a, b) => a.remainingSec - b.remainingSec).slice(0, MAX_ACTIVE_MODIFIERS);
}

/**
 * Largest window applied in a single simulation step.
 *
 * Most of the sim is dt-invariant, so "offline is just a tick with a big elapsedMs"
 * held for the lab loop. The PRODUCT business is not: `simulateProducts` advances the
 * competitive frontier to its end-of-window value before pricing the window, and
 * integrates MAU with a single forward-Euler step. Applied as one 8h tick those
 * compound badly — measured, an 8h window paid a marketing-funded portfolio ~10% of
 * the users and NEGATIVE money (the marketing budget was charged for the whole window
 * while the revenue it bought was not earned). A player who closed the app came back
 * poorer than one who left it open.
 *
 * Sub-stepping the window fixes it for every large-dt path at once — offline catch-up,
 * an OS suspend/resume, and a frozen background tab — because they all funnel through
 * tick(). 5 minutes converges to ~98% of a 1s-step reference for ~15ms of work on an
 * 8h window (~45ms on a premium 24h one), paid once on resume.
 *
 * This does NOT move the tuned curve: the balance sim drives the engine in small live
 * steps and never uses the offline path, so this brings reality INTO line with the
 * curve the sim tunes against rather than shifting it. See offlineParity.test.ts.
 */
const MAX_STEP_MS = 300_000;

/**
 * A window longer than this starts an auto-trained run at the moment the bank reached
 * its firing level and trains it through the rest of the window. Shorter ones (a live
 * 10Hz frame, the balance sim's 250ms step) start it at 0% at the end, as always: the
 * lag is under one frame there, and the tuned curve was built on it.
 */
const RUN_START_SPLIT_MS = 500;

/**
 * The deterministic heartbeat. Given a state and elapsed time, returns the next
 * state. The engine never reads the wall clock (CLAUDE.md hard rule) — time is
 * passed in, which makes offline progress "just a tick with a big elapsedMs".
 *
 * Returns a new object; never mutates the input (keeps it pure and testable).
 */
export function tick(state: GameState, elapsedMs: number): GameState {
  // Reject any non-positive OR non-finite dt: ≤0 is a no-op, NaN would turn every
  // resource into NaN, and Infinity would make `seconds` infinite and push the whole
  // simulation non-finite before the later delta guards run. The engine owns this
  // invariant now, so no caller can corrupt state with a bad dt.
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;

  // Sub-step a large catch-up window (see MAX_STEP_MS). Iterative rather than
  // recursive so a premium 24h window can't approach the call-stack limit. Every
  // inner call gets <= MAX_STEP_MS, so this can't re-enter itself.
  if (elapsedMs > MAX_STEP_MS) {
    let s = state;
    let remaining = elapsedMs;
    while (remaining > 0) {
      const step = Math.min(MAX_STEP_MS, remaining);
      s = tick(s, step);
      remaining -= step;
    }
    return s;
  }

  const seconds = elapsedMs / 1000;

  // Segment the window at the next modifier expiry. Otherwise a large frame
  // (tab-resume) or an offline catch-up would apply an about-to-expire buff to
  // the WHOLE window — e.g. a buff with 5s left doubling 8h of offline output.
  if (state.modifiers.length > 0) {
    // Drop already-expired (or malformed) modifiers first. Otherwise minRem
    // could be <= 0, making firstMs <= 0 and the recursive split spin without
    // ever making progress.
    let active = state.modifiers.filter((m) => Number.isFinite(m.remainingSec) && m.remainingSec > 0);
    // Defense-in-depth: the window-split below descends once per distinct expiry, so an
    // extreme stack of simultaneous buffs could approach the call-stack limit on a large
    // offline/tab-resume tick. Keep the soonest-expiring MAX_ACTIVE_MODIFIERS so the split
    // depth is always bounded — a generous ceiling above any reachable legit stack, below
    // the danger zone. The load sanitizer applies the same cap, so the two always agree.
    active = capActiveModifiers(active);
    if (active.length !== state.modifiers.length) {
      return tick({ ...state, modifiers: active }, elapsedMs);
    }
    let minRem = Infinity;
    for (const m of active) if (m.remainingSec < minRem) minRem = m.remainingSec;
    // Compare in the SAME unit as the recursive argument. Comparing seconds let the
    // inner call re-split forever: for ~2% of doubles, (r*1000)/1000 rounds one ulp
    // above r, so `minRem < seconds` held again with the same firstMs and the stack
    // overflowed — every frame, and on the offline catch-up (2026-09 bug hunt).
    const firstMs = minRem * 1000;
    if (minRem > 0 && firstMs < elapsedMs) {
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

  // Seconds of this window the run trains for: all of it for a run already in flight.
  let runSecs = run.active ? seconds : 0;
  if (!run.active && run.readyToClaim && d.autoClaim) {
    // A run finished last tick before auto-claim existed; claim it now.
    ({ data, money, lifetimeMoney } = claimInto(runYieldAt(state, d, run.focus), data, money, lifetimeMoney));
    run = { active: false, progress: 0, readyToClaim: false };
  } else if (!run.active && !run.readyToClaim && autoTrainReady(compute)) {
    // Idle + auto-train (and focus allows): kick off a fresh run.
    compute = compute.sub(d.runComputeCost);
    run = { active: true, progress: 0, readyToClaim: false, focus: state.computeFocus };
    // In a long window (a resume, an offline catch-up step) the run starts when the bank
    // reached its firing level, not at the end: it trains through the rest of the window.
    // It used to sit at 0% for all of it, so a window that began between two
    // compute-bound runs paid no run at all. A live-sized tick keeps the old behaviour
    // (the lag is under one frame, and the balance sim's curve was tuned on it).
    if (elapsedMs > RUN_START_SPLIT_MS) {
      const short = d.runComputeCost.div(state.computeFocus).sub(state.resources.compute);
      const startedAt = short.gt(0) ? short.div(d.computePerSec).toNumber() : 0;
      runSecs = seconds - Math.min(seconds, Math.max(0, startedAt));
    }
  }

  // Advance the active run; it may complete (and, with automation, re-loop)
  // multiple times within one big offline tick.
  if (run.active && runSecs > 0) {
    let remaining = runSecs;
    // Guard against pathological loops on huge offline deltas. Sized to the window:
    // the most runs that can legitimately complete is (elapsed / shortest run), so a
    // premium 24h catch-up at the run-duration floor (86400/0.5 = 172800 runs) no
    // longer trips a fixed cap and under-report the offline haul. Still capped as a
    // hard backstop against a zero-length run, and the divisor is floored so it can't
    // divide by zero.
    let guard = 0;
    const guardLimit = Math.min(
      5_000_000,
      Math.ceil(seconds / Math.max(0.05, balance.run.minDurationSec)) + 100,
    );
    while (run.active && remaining > 0 && guard < guardLimit) {
      guard++;
      const secsToFinish = (1 - run.progress) * d.runDurationSec;
      if (remaining >= secsToFinish) {
        // Run completes. It keeps the intensity it was started at: that is what its
        // Compute was charged at, so that is what it pays (see runYieldAt).
        remaining -= secsToFinish;
        run = { ...run, active: false, progress: 1, readyToClaim: true };
        if (d.autoClaim) {
          ({ data, money, lifetimeMoney } = claimInto(runYieldAt(state, d, run.focus), data, money, lifetimeMoney));
          run = { active: false, progress: 0, readyToClaim: false };
          if (autoTrainReady(compute)) {
            compute = compute.sub(d.runComputeCost);
            run = { active: true, progress: 0, readyToClaim: false, focus: state.computeFocus };
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
  }

  // Regulatory Heat cools passively when you're not buying shady data.
  const cooled = state.heat - balance.heat.coolPerSec * seconds;
  let heat = Math.max(0, cooled);

  // Phase 3 — released products earn Money (subs − serving − marketing) and may
  // add Heat. Money-based, so they keep running across a prestige reset. We run
  // the simulator unconditionally: with no active products it still drifts the
  // frontier, so a future launch lands against an up-to-date competitive bar.
  const sim = simulateProducts(state.products, seconds, d.productModsById);
  let products = sim.products;
  if (state.products.active.length > 0) {
    // Defense-in-depth: a pathological product (e.g. a quality/price combo that
    // overflows arpu → Infinity, then Infinity−Infinity = NaN) must NEVER reach the
    // Money Big, where .max(ZERO) does not sanitize NaN and would brick the save.
    const moneyDelta = Number.isFinite(sim.moneyDelta) ? sim.moneyDelta : 0;
    const heatDelta = Number.isFinite(sim.heatDelta) ? sim.heatDelta : 0;
    money = money.add(moneyDelta).max(Big.ZERO);
    if (moneyDelta > 0) lifetimeMoney = lifetimeMoney.add(moneyDelta);
    // Products heat the lab WHILE it cools, so the two net out over the window before
    // the zero floor applies. Flooring the cooling first threw it away against zero and
    // left a long window (a resume, each offline step) at heatPerSec × window: a Domain
    // portfolio that live play keeps at 0 came back from 3 minutes away at ~11 Heat,
    // and the resume's audit roll fined it at up to 50% odds.
    heat = Math.max(0, Math.min(balance.heat.max, (heatDelta > 0 ? cooled : heat) + heatDelta));
  }

  // Staff payroll (Phase 2): an ongoing Money drain, paid out of this tick's EARNINGS
  // and capped at a share of them (balance.staff.payrollMaxShareOfIncome), so a big
  // roster can squeeze a run but never pin a fresh, income-less lab at $0. Earnings =
  // what lifetimeMoney gained this tick (passive + auto-claimed runs + product profit).
  // Only Money is touched — lifetimeMoney tracks earnings, not net.
  //
  // The cap is set by the larger of this tick's receipts and the lab's income RATE ×
  // the tick. Auto-claimed runs pay out in lumps every few seconds, and a cap on
  // receipts alone forgave every frame between lumps: live 10Hz play paid 2–5% of the
  // wage bill while a resume or offline window paid all of it, so closing the app cost
  // money (r3 bug hunt). With the rate in the basis, a frame, a resume and an offline
  // step all charge min(bill, share × income) per second.
  if (d.payrollPerSec.gt(0)) {
    const earned = lifetimeMoney.sub(state.lifetimeMoney).max(Big.ZERO);
    const smooth = incomeRatePerSec(state, d).mul(seconds);
    const paid = payrollPaid(d.payrollPerSec.mul(seconds), earned.max(smooth));
    money = money.sub(paid).max(Big.ZERO);
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
      // A sliver left by float rounding (the split above lands a hair short) is spent.
      .filter((m) => m.remainingSec > MODIFIER_EPSILON_SEC);
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
    lifetimeMoney.sub(state.lifetimeMoney), seconds, rivalsNow, d.productModsById,
  );

  // Generation-scoped peaks (reset by prestige) for the Generation Report: this run's
  // high-water Compute/sec and total product revenue/sec, NOT the all-time career peaks.
  let curMrr = 0;
  for (const p of products.active) curMrr += settledMrr(p, products.frontier, d.productModsById[p.id]);
  const runPeakCompute = state.runPeakCompute.max(d.computePerSec);
  const runPeakMrr = Math.max(state.runPeakMrr, curMrr);

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
    runPeakCompute,
    runPeakMrr,
  }, d.productModsById); // the same buffed revenue peakMrr and the cards read
  // Milestone rewards land in lifetimeMoney AFTER accrueStats already took its
  // delta for this tick (and next tick's baseline includes them), so without this
  // they'd never reach totalMoney — all-time earnings would quietly under-report,
  // making totalMoney-gated achievements/contracts/cosmetics harder than tuned.
  let msState = ms.state;
  const milestoneGain = msState.lifetimeMoney.sub(lifetimeMoney);
  if (milestoneGain.gt(0)) {
    msState = { ...msState, stats: { ...msState.stats, totalMoney: msState.stats.totalMoney.add(milestoneGain) } };
  }
  // Award any newly-unlocked achievements (reads the fresh stats above). Pure +
  // idempotent; the store diffs achievements to surface a toast.
  const awarded = applyAchievements(msState).state;

  // Rig Bay trophies (C2): grant any earned part whose milestone just completed.
  // Idempotent same-ref no-op almost every tick; sources persist across prestige.
  const granted = grantEarnedComponents(awarded);

  // Research Director (R5.3): if owned, auto-buy affordable research from the
  // freshly-updated pools. No-op (same reference) until the perk is bought, so
  // the tuned curve / sim are untouched. Runs here so it works offline too.
  return applyAutoResearch(granted);
}

function claimInto(y: { data: Big; money: Big }, data: Big, money: Big, lifetimeMoney: Big) {
  return {
    data: data.add(y.data),
    money: money.add(y.money),
    lifetimeMoney: lifetimeMoney.add(y.money),
  };
}

/**
 * The lab's steady Money income per second, for settling payroll: passive money, runs
 * at the cadence auto-train really fires them (only while auto-claim banks them — a
 * run left sitting ready pays nothing), and the product portfolio's profit when it
 * nets positive. Pure. Mirrors the rate the top bar quotes (netMoneyRate).
 */
export function incomeRatePerSec(state: GameState, d: Derived): Big {
  let rate = d.passiveMoneyPerSec;
  if (d.autoTrain && d.autoClaim) {
    rate = rate.add(runYieldAt(state, d, state.computeFocus).money.mul(runsPerSec(d, state.computeFocus)));
  }
  let margin = 0;
  for (const p of state.products.active) margin += productMetrics(p, state.products.frontier, d.productModsById[p.id]).margin;
  if (Number.isFinite(margin) && margin > 0) rate = rate.add(Big.of(margin));
  return rate.max(Big.ZERO);
}
