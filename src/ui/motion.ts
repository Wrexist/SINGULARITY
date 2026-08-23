import { useSyncExternalStore } from "react";
import { useSettings } from "./settings";

/** One live source of truth for "should motion be reduced?".
 *
 *  The in-app toggle is seeded from the OS preference on first run, but a saved
 *  choice wins from then on — so a player who enables OS reduce-motion LATER
 *  used to get frozen CSS (the media query) while every JS animator (particles,
 *  confetti, hall agents, news ticker) kept moving. This module ORs the
 *  persisted setting with a LIVE matchMedia listener so both worlds agree.
 */

let osReduced = false;
const listeners = new Set<() => void>();
try {
  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    osReduced = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      osReduced = e.matches;
      listeners.forEach((fn) => fn());
    };
    // Older WebKit shipped addListener only; feature-detect rather than crash.
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
    else if (typeof mq.addListener === "function") mq.addListener(onChange);
  }
} catch {
  /* matchMedia unavailable (tests/SSR) — motion stays on */
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Imperative check for rAF loops and fire-and-forget fx (fx.ts, HallCanvas). */
export function reduceMotionNow(): boolean {
  return osReduced || useSettings.getState().reducedMotion;
}

/** Reactive check: in-app setting OR live OS preference. */
export function useReducedMotion(): boolean {
  const setting = useSettings((s) => s.reducedMotion);
  const os = useSyncExternalStore(subscribe, () => osReduced, () => false);
  return setting || os;
}
