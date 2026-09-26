import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { App } from "./App";
import { ConfirmSheet } from "./ConfirmSheet";
import { SettingsSheet } from "./SettingsSheet";
import { Portal } from "./Portal";
import { hookHost, findElements } from "./hookHost";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import { nextRunMultiplier, canPrestige } from "../engine/prestige";
import { FIRST_SHIP_WORTH_IT } from "../engine/derive";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The one-time "Your first Ship is ready" explainer is uninvited: it opens the moment
 * the first Ship becomes worth taking, and that moment is often not a tap. The Ship
 * node lands on its own when the player pinned it with "Save for this" (or owns the
 * Research Director), and the next-run boost crosses the line as Money comes in.
 *
 * The era crossing, world events and the resume recap all wait for an open sheet.
 * The explainer did not: it opened on top of Settings or a portalled sheet (the Lab
 * Reputation modal, a Rig Bay picker) — a second backdrop over the first, taking
 * keyboard focus and Escape from the sheet the player was using — and it jumped the
 * Scale-Up era moment, which was politely waiting for the same sheet to close.
 *
 * App's effects run here (the explainer is raised by one), against a bare-bones
 * browser stand-in: every timer and listener is a no-op, and the save loads from a
 * stub localStorage the way a cold launch reads it.
 */
const g = globalThis as Record<string, unknown>;
const noop = () => {};
const disk: Record<string, string> = {};
const prior: Record<string, unknown> = {};
beforeAll(() => {
  for (const k of ["window", "document", "localStorage"]) prior[k] = g[k];
  g.localStorage = {
    getItem: (k: string) => disk[k] ?? null,
    setItem: (k: string, v: string) => { disk[k] = v; },
    removeItem: (k: string) => { delete disk[k]; },
  };
  g.window = {
    setInterval: () => 0, clearInterval: noop, setTimeout: () => 0, clearTimeout: noop,
    addEventListener: noop, removeEventListener: noop, scrollTo: noop, scrollY: 0, innerWidth: 390, innerHeight: 844,
  };
  g.document = {
    hidden: false, visibilityState: "visible", addEventListener: noop, removeEventListener: noop,
    body: { nodeType: 1 }, querySelector: () => null, querySelectorAll: () => [],
    documentElement: { classList: { toggle: noop }, style: { setProperty: noop, removeProperty: noop }, hasAttribute: () => false, toggleAttribute: noop },
  };
});
afterAll(() => {
  for (const [k, v] of Object.entries(prior)) { if (v === undefined) delete g[k]; else g[k] = v; }
});

/** A first-generation lab that owns the Ship node, with a next-run boost still under
 *  the "worth it" line: no explainer yet. */
function shippableButSmall(): GameState {
  const base = createInitialState();
  return { ...base, research: [balance.prestige.capabilityResearch], lifetimeMoney: Big.of(1), stats: { ...base.stats, totalMoney: Big.of(1) } };
}
/** The same lab once Money has carried the boost over the line. */
const worthIt = (s: GameState): GameState => ({ ...s, lifetimeMoney: Big.of(1e15), stats: { ...s.stats, totalMoney: Big.of(1e15) } });

const EXPLAINER = "Your first Ship is ready";
const explainerUp = (tree: ReactElement) =>
  findElements(tree, (el) => el.type === ConfirmSheet && (el.props as { title?: string }).title === EXPLAINER).length > 0;
const settle = (host: ReturnType<typeof hookHost>) => { host.render(App, {}); return host.render(App, {}); };

describe("the first-Ship explainer and an open sheet", () => {
  let host: ReturnType<typeof hookHost>;
  beforeEach(() => {
    const start = shippableButSmall();
    expect(canPrestige(start)).toBe(true);
    expect(nextRunMultiplier(start).toNumber()).toBeLessThan(FIRST_SHIP_WORTH_IT);
    expect(nextRunMultiplier(worthIt(start)).toNumber()).toBeGreaterThanOrEqual(FIRST_SHIP_WORTH_IT);
    for (const k of Object.keys(disk)) delete disk[k];
    disk["singularity.save.v1"] = serialize(start);
    useSettings.setState({ onboarded: true, shipExplained: false });
    useGame.setState({ initialized: false, offline: null, worldEvent: null, event: null, notice: null, savingFor: null });
    host = hookHost({ runEffects: true });
    expect(explainerUp(settle(host))).toBe(false);
    expect(useGame.getState().initialized).toBe(true);
  });
  afterEach(() => host.unmount());

  it("waits for Settings to close", () => {
    let tree = host.render(App, {});
    const gear = findElements(tree, (el) => (el.props as Record<string, unknown>)["aria-label"] === "Settings")[0]!;
    (gear.props as { onClick: () => void }).onClick();
    tree = settle(host);
    expect(findElements(tree, (el) => el.type === SettingsSheet)).toHaveLength(1);

    useGame.setState({ game: worthIt(useGame.getState().game) });
    tree = settle(host);
    expect(explainerUp(tree)).toBe(false);

    const sheet = findElements(tree, (el) => el.type === SettingsSheet)[0]!;
    (sheet.props as { onClose: () => void }).onClose();
    tree = settle(host);
    expect(findElements(tree, (el) => el.type === SettingsSheet)).toHaveLength(0);
    expect(explainerUp(tree)).toBe(true);
  });

  it("waits for a portalled sheet (Lab Reputation, a Rig Bay picker) to close", () => {
    const sheet = hookHost({ runEffects: true });
    sheet.render(Portal, { children: null });
    useGame.setState({ game: worthIt(useGame.getState().game) });
    expect(explainerUp(settle(host))).toBe(false);

    sheet.unmount();
    expect(explainerUp(settle(host))).toBe(true);
  });

  it("stays up once shown (its own sheet is not a reason to hide it)", () => {
    useGame.setState({ game: worthIt(useGame.getState().game) });
    expect(explainerUp(settle(host))).toBe(true);
    // The explainer is itself a portalled sheet; mounting it must not make it wait.
    const own = hookHost({ runEffects: true });
    own.render(Portal, { children: null });
    expect(explainerUp(settle(host))).toBe(true);
    own.unmount();
  });
});
