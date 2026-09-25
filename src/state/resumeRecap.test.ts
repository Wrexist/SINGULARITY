import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { tick } from "../engine/tick";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";

/**
 * The resume path, at the seam that actually ships it (2026-08 audit §1.5).
 *
 * `applyOffline` is reachable only from `init()`, which runs once per mount — but
 * on iOS the app is suspended and resumed far more often than it is killed, and on
 * that path the game LOOP hands `advance()` one big cap-clamped window instead. The
 * engine-level tests pin that summarizing such a window is pure; these pin that the
 * store actually raises the recap there, and never pays the window twice doing it.
 */
const producingLab = () => {
  const s = createInitialState();
  s.resources.compute = Big.of(1e6);
  s.upgrades = { rack_basic: 20 };
  return s;
};

describe("resume recap — store wiring", () => {
  beforeEach(() => {
    useGame.setState({ game: producingLab(), offline: null, notice: null, event: null });
  });

  it("raises the welcome-back recap when the loop resumes from a long suspend", () => {
    const away = 45 * 60 * 1000;
    useGame.getState().advance(away, away);
    const { offline } = useGame.getState();
    expect(offline).not.toBeNull();
    expect(offline!.appliedMs).toBe(away);
    expect(offline!.gained.compute.gt(0)).toBe(true);
    expect(offline!.capped).toBe(false);
  });

  it("credits the window EXACTLY once — the recap is a diff, not a second tick", () => {
    const away = 45 * 60 * 1000;
    const expected = tick(producingLab(), away);
    useGame.getState().advance(away, away);
    const { game, offline } = useGame.getState();
    expect(game.resources.compute.toNumber()).toBeCloseTo(expected.resources.compute.toNumber(), 6);
    expect(game.resources.data.toNumber()).toBeCloseTo(expected.resources.data.toNumber(), 6);
    // And the recap reports precisely what that one tick produced.
    expect(offline!.gained.compute.toNumber()).toBeCloseTo(
      expected.resources.compute.sub(producingLab().resources.compute).toNumber(),
      6,
    );
  });

  it("reports the real time away when the loop clamped the window to the cap", () => {
    const applied = balance.offline.maxHours * 3600 * 1000;
    const real = 30 * 3600 * 1000;
    useGame.getState().advance(applied, real);
    const { offline } = useGame.getState();
    expect(offline!.capped).toBe(true);
    expect(offline!.elapsedMs).toBe(real);
    expect(offline!.appliedMs).toBe(applied);
  });

  it("stays out of the way on ordinary 10Hz ticks", () => {
    for (let i = 0; i < 50; i++) useGame.getState().advance(100, 100);
    expect(useGame.getState().offline).toBeNull();
  });

  it("does not interrupt for a glance at another app", () => {
    const brief = balance.offline.recapMinMs - 1000;
    useGame.getState().advance(brief, brief);
    expect(useGame.getState().offline).toBeNull();
  });

  // Interrupt size follows window size. A phone switches apps many times an hour,
  // and on resume the player was mid-session — so the bar for taking the screen is
  // much higher than on cold launch, where the recap interrupts nothing at all.
  it("holds its peace for a short mid-session absence that WOULD open a cold launch", () => {
    const shortAway = balance.offline.recapMinMs + 60_000; // past the cold-launch bar
    expect(shortAway).toBeLessThan(balance.offline.resumeRecapMinMs);
    useGame.getState().advance(shortAway, shortAway);
    expect(useGame.getState().offline).toBeNull();
  });

  it("credits a below-the-bar window in full even though it stays silent", () => {
    const shortAway = balance.offline.recapMinMs + 60_000;
    const expected = tick(producingLab(), shortAway);
    useGame.getState().advance(shortAway, shortAway);
    const { game, offline } = useGame.getState();
    expect(offline).toBeNull(); // no interruption...
    expect(game.resources.compute.toNumber()).toBeCloseTo(expected.resources.compute.toNumber(), 6); // ...but paid
  });

  // The player reads the recap, locks the phone without collecting, and comes back
  // hours later. The second window is credited either way; the recap still on
  // screen must tell that story too, not keep showing only the first window while
  // the second one's money (and its notices, queued behind the modal) vanish.
  it("folds a second away-window into the recap still on screen", () => {
    const first = 45 * 60 * 1000;
    const second = 6 * 3600 * 1000;
    const start = useGame.getState().game;
    useGame.getState().advance(first, first);
    const opened = useGame.getState().offline!;
    expect(opened.appliedMs).toBe(first);
    const mid = useGame.getState().game;
    useGame.getState().advance(second, second);
    const { offline, game, notice } = useGame.getState();

    expect(offline!.appliedMs).toBe(first + second);
    expect(offline!.elapsedMs).toBe(first + second);
    // Nothing spends during the catch-up, so the two diffs add up to the whole away.
    expect(offline!.gained.compute.toNumber()).toBeCloseTo(game.resources.compute.sub(start.resources.compute).toNumber(), 6);
    expect(offline!.gained.compute.gt(opened.gained.compute)).toBe(true);
    // The second window's unlocks are lines in the recap, not toasts behind it.
    const newAch = game.achievements.filter((id) => !mid.achievements.includes(id));
    expect(newAch.length).toBeGreaterThan(0);
    for (const id of [...opened.achievementsUnlocked, ...newAch]) expect(offline!.achievementsUnlocked).toContain(id);
    expect(new Set(offline!.achievementsUnlocked).size).toBe(offline!.achievementsUnlocked.length);
    expect(notice).toBeNull();
    // The story spans both windows: where the lab stood before the first, and after the second.
    expect(offline!.story.eraBefore).toBe(opened.story.eraBefore);
    expect(offline!.story.rankBefore).toBe(opened.story.rankBefore);
  });

  it("leaves a recap on screen alone on ordinary ticks", () => {
    const away = 45 * 60 * 1000;
    useGame.getState().advance(away, away);
    const first = useGame.getState().offline;
    for (let i = 0; i < 20; i++) useGame.getState().advance(100, 100);
    expect(useGame.getState().offline).toBe(first);
  });

  it("tells the story once: a fired recap suppresses the toast backlog", () => {
    // The same catch-up that fills the recap also unlocks achievements, finishes
    // versions and levels people up — all of which are already lines in the recap.
    const away = 6 * 3600 * 1000;
    useGame.getState().advance(away, away);
    const { offline, notice } = useGame.getState();
    expect(offline).not.toBeNull();
    expect(offline!.achievementsUnlocked.length).toBeGreaterThan(0);
    expect(notice).toBeNull();
  });
});
