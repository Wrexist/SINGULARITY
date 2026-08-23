import { useSyncExternalStore } from "react";
import { useSettings, motionReduced, osReduceMotionNow, onOsReduceMotionChange } from "./settings";

/** Reduced-motion accessors for the UI layer.
 *
 *  The single source of truth lives in settings.ts (`motionReduced` — the
 *  in-app toggle OR'd with a LIVE `prefers-reduced-motion` listener). This
 *  module adds the React-reactive form; both read the same OS listener, so
 *  there is exactly one matchMedia subscription in the app.
 */

/** Imperative check for rAF loops and fire-and-forget fx (fx.ts, HallCanvas). */
export const reduceMotionNow = motionReduced;

/** Reactive check: in-app setting OR live OS preference. */
export function useReducedMotion(): boolean {
  const setting = useSettings((s) => s.reducedMotion);
  const os = useSyncExternalStore(
    (onChange) => onOsReduceMotionChange(() => onChange()),
    osReduceMotionNow,
    () => false,
  );
  return setting || os;
}
