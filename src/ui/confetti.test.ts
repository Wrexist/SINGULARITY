import { describe, it, expect } from "vitest";
import React, { type ReactElement } from "react";
import { Celebration } from "./Celebration";
import { EraTransition } from "./EraTransition";
import { Big } from "../engine/math/Big";

/**
 * App re-renders at ~10Hz (it subscribes to the whole game state) and the moment
 * components are not memoized, so anything random computed in render is re-rolled
 * ten times a second. For the confetti that meant every piece teleported to a new
 * column and restarted with a new delay each tick instead of falling.
 *
 * vitest runs in node with no DOM, so this drives the real components through a
 * minimal hooks host: each `render` calls the component function the way React
 * does on a re-render, with hook state kept between calls.
 */
type Dispatcher = Record<string, unknown>;
const internals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: Dispatcher | null } };
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

function hookHost() {
  const slots: unknown[] = [];
  let i = 0;
  const changed = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !a || !b || a.length !== b.length || a.some((v, k) => !Object.is(v, b[k]));
  const memo = <T,>(fn: () => T, deps?: readonly unknown[]): T => {
    const k = i++;
    const prev = slots[k] as { v: T; deps?: readonly unknown[] } | undefined;
    if (prev && !changed(prev.deps, deps)) return prev.v;
    const v = fn();
    slots[k] = { v, deps };
    return v;
  };
  const once = <T,>(make: () => T): T => {
    const k = i++;
    if (!(k in slots)) slots[k] = make();
    return slots[k] as T;
  };
  const dispatcher: Dispatcher = {
    useState: (init: unknown) => once(() => [typeof init === "function" ? (init as () => unknown)() : init, () => {}]),
    useReducer: (_r: unknown, arg: unknown, init?: (a: unknown) => unknown) => once(() => [init ? init(arg) : arg, () => {}]),
    useRef: (v: unknown) => once(() => ({ current: v })),
    useMemo: memo,
    useCallback: (fn: unknown, deps?: readonly unknown[]) => memo(() => fn, deps),
    useEffect: () => { i++; },
    useLayoutEffect: () => { i++; },
    useInsertionEffect: () => { i++; },
    useSyncExternalStore: (_sub: unknown, get: () => unknown) => { i++; return get(); },
    useDebugValue: () => {},
    useContext: (ctx: { _currentValue: unknown }) => ctx._currentValue,
    useId: () => `h${i++}`,
  };
  return {
    render<P>(component: (p: P) => unknown, props: P): ReactElement {
      i = 0;
      const prev = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try {
        return component(props) as ReactElement;
      } finally {
        internals.ReactCurrentDispatcher.current = prev;
      }
    },
  };
}

/** The inline styles of every piece inside the `.confetti` layer. */
function confettiStyles(node: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: unknown, inConfetti: boolean) => {
    if (Array.isArray(n)) { for (const c of n) walk(c, inConfetti); return; }
    if (!n || typeof n !== "object" || !("props" in n)) return;
    const props = (n as ReactElement).props as { className?: string; style?: Record<string, unknown>; children?: unknown };
    const here = typeof props.className === "string" && props.className.split(" ").includes("confetti");
    if (inConfetti && props.style) out.push(props.style);
    walk(props.children, inConfetti || here);
  };
  walk(node, false);
  return out;
}

const shipProps = (ascended: boolean) => ({
  weightsGained: Big.of(12),
  totalWeights: Big.of(40),
  ascended,
  onDone: () => {},
});

describe("confetti", () => {
  it("keeps each Ship-celebration piece's flight across re-renders", () => {
    const host = hookHost();
    const first = confettiStyles(host.render(Celebration, shipProps(false)));
    expect(first.length).toBe(26);
    for (let tick = 0; tick < 5; tick++) {
      expect(confettiStyles(host.render(Celebration, shipProps(false)))).toEqual(first);
    }
  });

  it("keeps the ascension burst stable too", () => {
    const host = hookHost();
    const first = confettiStyles(host.render(Celebration, shipProps(true)));
    expect(first.length).toBe(48);
    expect(confettiStyles(host.render(Celebration, shipProps(true)))).toEqual(first);
  });

  it("keeps each era-transition piece's flight across re-renders", () => {
    const host = hookHost();
    const props = { era: 2, blurbSeed: 1, onDone: () => {} };
    const first = confettiStyles(host.render(EraTransition, props));
    expect(first.length).toBe(22);
    expect(confettiStyles(host.render(EraTransition, props))).toEqual(first);
  });

  it("still varies from one burst to the next", () => {
    const a = confettiStyles(hookHost().render(Celebration, shipProps(false)));
    const b = confettiStyles(hookHost().render(Celebration, shipProps(false)));
    expect(a.map((s) => s.left)).not.toEqual(b.map((s) => s.left));
  });

  it("rolls every piece inside the layer's bounds", () => {
    for (const s of confettiStyles(hookHost().render(Celebration, shipProps(true)))) {
      const left = parseInt(String(s.left), 10);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThan(100);
      expect(Math.abs(Number(s["--x"]))).toBeLessThanOrEqual(1);
      expect(parseFloat(String(s["--d"]))).toBeLessThanOrEqual(0.5);
    }
  });
});
