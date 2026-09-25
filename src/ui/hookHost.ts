import React, { type ReactElement } from "react";

/**
 * TEST-ONLY: a minimal hooks host for driving real components from vitest, which
 * runs in node with no DOM and no renderer. `render` calls the component function
 * the way React does on a re-render, with hook slots kept between calls, and
 * returns the element tree it produced (children components stay unexpanded, so a
 * test can see WHICH overlays a parent renders and call their props directly).
 *
 * useState is live: a setter writes the slot, and the next `render` reads it.
 * Effects are skipped unless `runEffects` is set, in which case each effect whose
 * deps changed runs right after the render (cleanups run on `unmount`) — enough
 * for small components like Portal, not for App (whose effects need a browser).
 */
type Dispatcher = Record<string, unknown>;
const internals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: Dispatcher | null } };
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

interface EffectSlot { deps?: readonly unknown[] | undefined; cleanup?: (() => void) | undefined }

export function hookHost({ runEffects = false }: { runEffects?: boolean } = {}) {
  const slots: unknown[] = [];
  let i = 0;
  let queued: { slot: EffectSlot; fn: () => void | (() => void) }[] = [];
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
  const effect = (fn: () => void | (() => void), deps?: readonly unknown[]) => {
    const k = i++;
    const prev = slots[k] as EffectSlot | undefined;
    if (!runEffects) return;
    if (prev && !changed(prev.deps, deps)) return;
    const slot: EffectSlot = { deps, cleanup: prev?.cleanup };
    slots[k] = slot;
    queued.push({ slot, fn });
  };
  const dispatcher: Dispatcher = {
    useState: (init: unknown) => {
      const cell = once(() => ({ v: typeof init === "function" ? (init as () => unknown)() : init }));
      const set = (next: unknown) => {
        cell.v = typeof next === "function" ? (next as (p: unknown) => unknown)(cell.v) : next;
      };
      return [cell.v, set];
    },
    useReducer: (_r: unknown, arg: unknown, init?: (a: unknown) => unknown) => once(() => [init ? init(arg) : arg, () => {}]),
    useRef: (v: unknown) => once(() => ({ current: v })),
    useMemo: memo,
    useCallback: (fn: unknown, deps?: readonly unknown[]) => memo(() => fn, deps),
    useEffect: effect,
    useLayoutEffect: effect,
    useInsertionEffect: () => { i++; },
    useSyncExternalStore: (_sub: unknown, get: () => unknown) => { i++; return get(); },
    useDebugValue: () => {},
    useContext: (ctx: { _currentValue: unknown }) => ctx._currentValue,
    useId: () => `h${i++}`,
  };
  return {
    render<P>(component: (p: P) => unknown, props: P): ReactElement {
      i = 0;
      queued = [];
      const prev = internals.ReactCurrentDispatcher.current;
      internals.ReactCurrentDispatcher.current = dispatcher;
      let out: ReactElement;
      try {
        out = component(props) as ReactElement;
      } finally {
        internals.ReactCurrentDispatcher.current = prev;
      }
      for (const { slot, fn } of queued) {
        slot.cleanup?.();
        const c = fn();
        slot.cleanup = typeof c === "function" ? c : undefined;
      }
      return out;
    },
    unmount(): void {
      for (const s of slots) {
        const slot = s as EffectSlot | undefined;
        if (slot && typeof slot === "object" && "cleanup" in slot) { slot.cleanup?.(); slot.cleanup = undefined; }
      }
    },
  };
}

/** Every element in a rendered tree matching `pred`, outermost first. */
export function findElements(node: unknown, pred: (el: ReactElement) => boolean): ReactElement[] {
  const out: ReactElement[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { for (const c of n) walk(c); return; }
    if (!n || typeof n !== "object" || !("props" in n)) return;
    const el = n as ReactElement;
    if (pred(el)) out.push(el);
    walk((el.props as { children?: unknown }).children);
  };
  walk(node);
  return out;
}
