import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { resumeRate, RESUME_RATE_MIN_MS } from "./useGameLoop";
import { createInitialState } from "../engine/state";
import { tick } from "../engine/tick";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import { PRO_UNTIL_KEY } from "./premium";

/**
 * Pro ×2 offline on the RESUME path. The loop hands advance() a rate only for a real
 * suspend (raw gap > 60s) and only with Pro; live 10Hz frames always run ×1. The
 * store simulates `elapsed × rate` but the recap keeps reporting real time. The
 * autopilots in advance() get Pro as a flag too.
 */

const producingLab = () => {
  const s = createInitialState();
  s.resources.compute = Big.of(1e6);
  s.upgrades = { rack_basic: 20 };
  return s;
};

let store: Record<string, string>;
let prev: unknown;
beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.99); // no world/product events
  store = {};
  prev = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  useGame.setState({ game: producingLab(), savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as { localStorage?: unknown }).localStorage = prev;
});

describe("resumeRate", () => {
  it("is ×rate only for Pro on a real suspend", () => {
    expect(resumeRate(RESUME_RATE_MIN_MS + 1, true)).toBe(balance.offline.proRate);
    expect(resumeRate(RESUME_RATE_MIN_MS, true)).toBe(1);
    expect(resumeRate(100, true)).toBe(1); // a live frame
    expect(resumeRate(5 * 3_600_000, false)).toBe(1); // no Pro
    expect(resumeRate(NaN, true)).toBe(1);
  });
});

describe("advance with a Pro resume rate", () => {
  it("simulates the window at ×2 and reports real time in the recap", () => {
    const away = 45 * 60 * 1000;
    const expected = tick(producingLab(), away * 2);
    useGame.getState().advance(away, away, 2);
    const { game, offline } = useGame.getState();
    expect(game.resources.compute.toNumber()).toBeCloseTo(expected.resources.compute.toNumber(), 6);
    expect(offline!.appliedMs).toBe(away);
    expect(offline!.elapsedMs).toBe(away);
    expect(offline!.rate).toBe(2);
  });

  it("without a rate the window is paid exactly once at ×1 (unchanged)", () => {
    const away = 45 * 60 * 1000;
    const expected = tick(producingLab(), away);
    useGame.getState().advance(away, away);
    const { game, offline } = useGame.getState();
    expect(game.resources.compute.toNumber()).toBeCloseTo(expected.resources.compute.toNumber(), 6);
    expect(offline!.rate).toBeUndefined();
  });

  it("runs a Pro-only autopilot while Pro is active, and stops when it lapses", () => {
    const lab = { ...createInitialState(), automation: { auto_objectives: true } };
    lab.prestige.ships = 1; // auto_objectives: 2 Ships, or 1 with Pro
    lab.lifetimeMoney = Big.of(1000);
    useGame.setState({ game: lab });
    useGame.getState().advance(100, 100);
    expect(useGame.getState().game.objectives.completed.length).toBe(0); // no Pro

    store[PRO_UNTIL_KEY] = String(Date.now() + 86_400_000);
    useGame.getState().advance(100, 100);
    expect(useGame.getState().game.objectives.completed.length).toBeGreaterThan(0);
  });

  it("toggling a Pro-only autopilot needs Pro", () => {
    const lab = createInitialState();
    lab.prestige.ships = 1;
    useGame.setState({ game: lab });
    useGame.getState().doToggleAutomation("auto_objectives");
    expect(useGame.getState().game.automation.auto_objectives).toBeFalsy();
    store[PRO_UNTIL_KEY] = String(Date.now() + 86_400_000);
    useGame.getState().doToggleAutomation("auto_objectives");
    expect(useGame.getState().game.automation.auto_objectives).toBe(true);
  });
});
