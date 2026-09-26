import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { applyOffline } from "./offline";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * A long window (an offline catch-up, a resume from suspend) must pay the training runs
 * the same wall-clock would have paid with the app open. It did not once runs were
 * COMPUTE-bound (a run finishes before the bank refills its cost — the usual mid-game
 * state at full intensity). Then the run is idle between runs, and an idle window's
 * auto-train fired a run that sat at 0% for the rest of that window: a 5-minute catch-up
 * step, or a whole 4-minute resume, paid no run at all. Closing the app for 10 minutes
 * paid half the runs leaving it open did.
 */

/** A mid-game lab whose auto-trained runs are compute-bound at the given intensity. */
function computeBoundLab(focus: number): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 20, rack_server: 10, auto_claim: 1, auto_train: 1, batching: 12 };
  s.research = ["caching", "distillation"];
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  s.computeFocus = focus;
  return s;
}

/** The app left open: 10Hz live ticks. */
function live(s: GameState, ms: number): GameState {
  for (let t = 0; t < ms; t += 100) s = tick(s, 100);
  return s;
}

/** Warm the lab into its steady run cycle, then zero the pools so gains read directly. */
function steady(focus: number, warmMs = 60_000): GameState {
  const s = live(computeBoundLab(focus), warmMs);
  return { ...s, resources: { ...s.resources, data: Big.ZERO, money: Big.ZERO } };
}

const ratio = (a: GameState, b: GameState) => a.resources.money.div(b.resources.money.max(1)).toNumber();

describe("run income over a long window matches the app left open", () => {
  it("a 10-minute offline catch-up pays the runs 10 minutes open would", () => {
    for (const focus of [1, 0.75]) {
      const s = steady(focus);
      const off = applyOffline(s, 10 * 60_000).state;
      const on = live(s, 10 * 60_000);
      expect(ratio(off, on)).toBeGreaterThan(0.95);
      expect(ratio(off, on)).toBeLessThan(1.05);
    }
  });

  it("a resume window that starts between runs still trains through it", () => {
    // Land on an instant where the last run has finished and the bank is still refilling.
    let s = steady(1);
    for (let i = 0; i < 40 && s.run.active; i++) s = tick(s, 100);
    expect(s.run.active).toBe(false);
    const window = 4 * 60_000; // one tick of the loop after a 4-minute suspend
    const resumed = tick(s, window);
    const on = live(s, window);
    expect(ratio(resumed, on)).toBeGreaterThan(0.95);
    expect(ratio(resumed, on)).toBeLessThan(1.05);
  });

  it("a live-sized tick is untouched (the tuned curve steps in small ticks)", () => {
    // Between runs, the tick that crosses the firing level starts the next run at 0%,
    // exactly as before — only a long window lands the start on its real moment.
    let s = steady(1);
    for (let i = 0; i < 40 && s.run.active; i++) s = tick(s, 100);
    let fired: GameState | null = null;
    for (let i = 0; i < 40 && !fired; i++) {
      const next = tick(s, 250);
      if (next.run.active) fired = next;
      else s = next;
    }
    expect(fired).not.toBeNull();
    expect(fired!.run.progress).toBe(0);
  });
});
