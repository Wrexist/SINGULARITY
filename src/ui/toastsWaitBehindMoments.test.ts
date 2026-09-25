import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { App } from "./App";
import * as ToastModule from "./Toast";
import { ToastStack, type ToastData } from "./Toast";
import { ProductsPanel } from "./ProductsPanel";
import { ProductLaunch } from "./ProductLaunch";
import { hookHost, findElements } from "./hookHost";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { createInitialState } from "../engine/state";
import { serialize } from "../engine/save";
import type { GameState } from "../engine/types";

/**
 * Toasts sit under every modal and sheet backdrop (styles.css), and a good one lives
 * 4.2s. The first product launch — the step right after the first Ship — pays the
 * "Hello, World" and "Market Leader" milestones on the next tick, and their one
 * notice ("2 milestones — … (+$125,000)") is the only word of that Money. It fired
 * while the launch card was up and, for a player who read the card for a few
 * seconds, timed out behind it: seen in the built app as a toast under the "Ship it"
 * card, gone by the time the card was dismissed. A toast now keeps its whole life
 * until nothing covers it.
 */
const g = globalThis as Record<string, unknown>;
const noop = () => {};
const disk: Record<string, string> = {};
const prior: Record<string, unknown> = {};
let timers: { ms: number; fn: () => void }[] = [];
beforeAll(() => {
  for (const k of ["window", "document", "localStorage"]) prior[k] = g[k];
  g.localStorage = {
    getItem: (k: string) => disk[k] ?? null,
    setItem: (k: string, v: string) => { disk[k] = v; },
    removeItem: (k: string) => { delete disk[k]; },
  };
  g.window = {
    setInterval: () => 0, clearInterval: noop,
    setTimeout: (fn: () => void, ms: number) => { timers.push({ ms, fn }); return timers.length; },
    clearTimeout: (id: number) => { const t = timers[id - 1]; if (t) t.fn = noop; },
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

describe("a toast behind a full-screen moment", () => {
  const Toast = (ToastModule as Record<string, unknown>).Toast as ((p: { toast: ToastData; onDone: (id: number) => void; paused?: boolean }) => unknown) | undefined;
  const toast: ToastData = { id: 7, text: "2 milestones — Hello, World, Market Leader (+$125,000)", tone: "good" };

  it("does not start its countdown while covered, and gets its whole life after", () => {
    expect(Toast).toBeTypeOf("function");
    timers = [];
    const host = hookHost({ runEffects: true });
    host.render(Toast!, { toast, onDone: noop, paused: true });
    expect(timers.filter((t) => t.ms === 4200 && t.fn !== noop)).toHaveLength(0);
    host.render(Toast!, { toast, onDone: noop, paused: false });
    expect(timers.filter((t) => t.ms === 4200 && t.fn !== noop)).toHaveLength(1);
    host.unmount();
  });
});

describe("the first launch's milestone notice", () => {
  let host: ReturnType<typeof hookHost>;
  const shipped = (): GameState => {
    const base = createInitialState();
    return { ...base, prestige: { ...base.prestige, ships: 1 }, products: { ...base.products, drafts: [{ id: "draft-1", quality: 1, ships: 1 }] } };
  };
  const stack = (tree: ReactElement) => findElements(tree, (el) => el.type === ToastStack)[0]!.props as { toasts: ToastData[]; paused?: boolean };
  const settle = () => { host.render(App, {}); return host.render(App, {}); };

  beforeEach(() => {
    for (const k of Object.keys(disk)) delete disk[k];
    disk["singularity.save.v1"] = serialize(shipped());
    useSettings.setState({ onboarded: true, shipExplained: true });
    useGame.setState({ initialized: false, offline: null, worldEvent: null, event: null, notice: null, savingFor: null });
    host = hookHost({ runEffects: true });
    settle();
  });
  afterEach(() => host.unmount());

  it("holds the toast's life while the launch card is up", () => {
    let tree = host.render(App, {});
    const nav = findElements(tree, (el) => el.type === "button" && String((el.props as { className?: string }).className).includes("botnav-item"));
    const products = nav.find((b) => findElements(b, (el) => (el.props as { className?: string }).className === "botnav-lbl" && (el.props as { children?: unknown }).children === "Products").length > 0)!;
    (products.props as { onClick: () => void }).onClick();
    tree = settle();
    const panel = findElements(tree, (el) => el.type === ProductsPanel)[0]!;
    (panel.props as { onLaunchDraft: (d: string, t: string, n: string) => void }).onLaunchDraft("draft-1", "general", "Atlas");
    tree = settle();
    const card = findElements(tree, (el) => el.type === ProductLaunch);
    expect(card).toHaveLength(1);

    // The milestone lands on the next tick, while the card is up.
    useGame.setState({ notice: { key: 9001, message: "2 milestones — Hello, World, Market Leader (+$125,000)", tone: "good", kind: "milestone" } });
    tree = settle();
    expect(stack(tree).toasts.map((t) => t.text)).toContain("2 milestones — Hello, World, Market Leader (+$125,000)");
    expect(stack(tree).paused).toBe(true);

    (card[0]!.props as { onDone: () => void }).onDone();
    tree = settle();
    expect(findElements(tree, (el) => el.type === ProductLaunch)).toHaveLength(0);
    expect(stack(tree).paused).toBe(false);
    expect(stack(tree).toasts.map((t) => t.text)).toContain("2 milestones — Hello, World, Market Leader (+$125,000)");
  });
});
