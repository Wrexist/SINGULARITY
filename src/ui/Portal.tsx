import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// How many portalled overlays are mounted right now. Sheets opened from INSIDE a
// component (product detail, Reputation, the Rig Bay picker, staff modals) are
// invisible to App's own state, so this count is how the moment queue knows a
// sheet is up and holds uninvited moments (world events, era crossings) until it
// closes, instead of stacking a second backdrop on top of it.
let openCount = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True while any <Portal> overlay is mounted. */
export function usePortalOpen(): boolean {
  return useSyncExternalStore(subscribe, () => openCount > 0, () => false);
}

/** Renders children into <body>, so a fixed-position overlay always covers the
 *  true viewport — never trapped/clipped by an ancestor that establishes a
 *  containing block (transform, filter, backdrop-filter, contain, will-change).
 *  Use this for every full-screen modal/backdrop. */
export function Portal({ children }: { children: ReactNode }) {
  useEffect(() => {
    openCount += 1;
    emit();
    return () => { openCount -= 1; emit(); };
  }, []);
  return createPortal(children, document.body);
}
