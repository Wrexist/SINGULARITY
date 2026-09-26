import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { App } from "./App";
import { Celebration } from "./Celebration";
import { ToastStack, type ToastData } from "./Toast";
import { SettingsSheet } from "./SettingsSheet";
import { hookHost, findElements } from "./hookHost";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import { canPrestige } from "../engine/prestige";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The one-time "X unlocked" lines are the only explanation some surfaces ever get:
 * the first Ship opens the Lab Charter ("pick a run focus on the Build tab before you
 * lock into research") and Legacy Investments. Both facts flip in the Ship itself, so
 * both lines fired while the Ship celebration was up. Toasts sit under modal
 * backdrops (styles.css), and a line lives about four seconds: they played out behind
 * the celebration's blur, were spent for the session, and the player never read the
 * one thing telling them to pick a charter before their first research locks it.
 *
 * They now wait for a clear stage (no full-screen moment, no open sheet), then fire.
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

/** A first-generation lab with the Ship node owned and a real boost to bank. */
function readyToShip(): GameState {
  const base = createInitialState();
  return {
    ...base,
    research: [balance.prestige.capabilityResearch],
    lifetimeMoney: Big.of(1e15),
    stats: { ...base.stats, totalMoney: Big.of(1e15) },
  };
}

const toasts = (tree: ReactElement): string[] =>
  findElements(tree, (el) => el.type === ToastStack).flatMap((el) => (el.props as { toasts: ToastData[] }).toasts.map((t) => t.text));
const charterLine = (texts: string[]) => texts.some((t) => t.startsWith("Lab Charter unlocked"));
const legacyLine = (texts: string[]) => texts.some((t) => t.startsWith("Legacy Investments unlocked"));
const settle = (host: ReturnType<typeof hookHost>) => { host.render(App, {}); return host.render(App, {}); };

describe("unlock lines and a full-screen moment", () => {
  let host: ReturnType<typeof hookHost>;
  beforeEach(() => {
    expect(canPrestige(readyToShip())).toBe(true);
    for (const k of Object.keys(disk)) delete disk[k];
    disk["singularity.save.v1"] = serialize(readyToShip());
    // The first-Ship explainer is a separate, already-seen sheet here.
    useSettings.setState({ onboarded: true, shipExplained: true });
    useGame.setState({ initialized: false, offline: null, worldEvent: null, event: null, notice: null, savingFor: null });
    host = hookHost({ runEffects: true });
    settle(host);
    expect(useGame.getState().initialized).toBe(true);
  });
  afterEach(() => host.unmount());

  it("tells the first Ship's unlocks after the celebration, not behind it", () => {
    useGame.getState().doPrestige("deploy");
    let tree = settle(host);
    const party = findElements(tree, (el) => el.type === Celebration);
    expect(party).toHaveLength(1);
    // Behind the celebration's backdrop a toast is unreadable: hold the lines.
    expect(charterLine(toasts(tree))).toBe(false);
    expect(legacyLine(toasts(tree))).toBe(false);

    (party[0]!.props as { onDone: () => void }).onDone();
    tree = settle(host);
    expect(findElements(tree, (el) => el.type === Celebration)).toHaveLength(0);
    expect(charterLine(toasts(tree))).toBe(true);
    expect(legacyLine(toasts(tree))).toBe(true);
  });

  it("holds a line while a sheet is open and tells it once the sheet closes", () => {
    let tree = host.render(App, {});
    const gear = findElements(tree, (el) => (el.props as Record<string, unknown>)["aria-label"] === "Settings")[0]!;
    (gear.props as { onClick: () => void }).onClick();
    settle(host);
    // A fact that flips on its own while Settings is up: Heat crossing the warning line.
    useGame.setState({ game: { ...useGame.getState().game, heat: 40 } });
    tree = settle(host);
    const heatLine = (texts: string[]) => texts.some((t) => t.startsWith("Regulatory Heat is rising"));
    expect(heatLine(toasts(tree))).toBe(false);

    (findElements(tree, (el) => el.type === SettingsSheet)[0]!.props as { onClose: () => void }).onClose();
    tree = settle(host);
    expect(heatLine(toasts(tree))).toBe(true);
  });
});
