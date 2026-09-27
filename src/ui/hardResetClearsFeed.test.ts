import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { App } from "./App";
import { ToastStack, type ToastData } from "./Toast";
import { EventLog } from "./EventLog";
import { hookHost, findElements } from "./hookHost";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";

/**
 * A Hard Reset swaps the save under the running app (no reload). The App's own feed —
 * the toasts on screen, the "Recent activity" log and the newswire's breaking line —
 * kept the old lab's entries, so a brand-new lab opened on "Hello, World (+$120,000)", hires and
 * milestone payouts it never had (reported in an earlier bug hunt; fixed r6). The feed
 * belongs to the save, like the diff baselines the epoch effect already resets.
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
    setInterval: () => 0, clearInterval: noop,
    setTimeout: () => 0, clearTimeout: noop,
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

describe("a Hard Reset clears the old lab's feed", () => {
  let host: ReturnType<typeof hookHost>;
  const settle = () => { host.render(App, {}); return host.render(App, {}); };
  const toasts = (tree: ReactElement) => (findElements(tree, (el) => el.type === ToastStack)[0]!.props as { toasts: ToastData[] }).toasts;
  const logs = (tree: ReactElement) => findElements(tree, (el) => el.type === EventLog).map((el) => (el.props as { log: unknown[] }).log);

  beforeEach(() => {
    for (const k of Object.keys(disk)) delete disk[k];
    disk["singularity.save.v1"] = serialize(createInitialState());
    useSettings.setState({ onboarded: true, shipExplained: true });
    useGame.setState({ initialized: false, offline: null, worldEvent: null, event: null, notice: null, savingFor: null });
    host = hookHost({ runEffects: true });
    settle();
  });
  afterEach(() => host.unmount());

  it("drops the toasts and the activity log", () => {
    useGame.setState({ notice: { key: 9101, message: "Hello, World — launch your first product (+$120,000)", tone: "good", kind: "milestone" } });
    let tree = settle();
    expect(toasts(tree).map((t) => t.text)).toContain("Hello, World — launch your first product (+$120,000)");
    expect(logs(tree).some((l) => l.length > 0)).toBe(true);

    useGame.getState().hardReset();
    tree = settle();
    expect(toasts(tree)).toEqual([]);
    for (const l of logs(tree)) expect(l).toEqual([]);
  });
});
