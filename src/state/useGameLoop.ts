import { useEffect, useRef } from "react";
import { useGame } from "./store";
import { balance } from "../engine/balance/config";
import { isPremium } from "./premium";

/**
 * Drives the simulation in real time. Reads the wall clock here (the UI layer),
 * computes elapsed ms, and feeds it to the engine via advance(). Also autosaves
 * on an interval and on tab-hide so offline progress has an accurate anchor.
 */
export function useGameLoop(tickHz = 10, saveEverySec = 5) {
  const advance = useGame((s) => s.advance);
  const save = useGame((s) => s.save);
  const init = useGame((s) => s.init);
  const last = useRef<number>(performance.now());

  useEffect(() => {
    init();

    const tickMs = 1000 / tickHz;
    // Error containment: an exception thrown inside a setInterval callback is NOT
    // a render error, so the root ErrorBoundary never sees it — without this guard
    // the loop would die silently (numbers freeze) while spamming console errors
    // at 10Hz on a live build. Log once per session and keep ticking: if the throw
    // was transient (a bad intermediate state), the next tick self-heals.
    let tickErrorLogged = false;
    const loop = window.setInterval(() => {
      const t = performance.now();
      // Clamp a single live-tick delta to the offline cap. If the machine sleeps (or
      // the tab is frozen by the OS) with the app open, one interval can fire with
      // hours of real time in it — without this clamp that becomes an UNCAPPED
      // single-tick windfall that bypasses the very cap the offline (tab-closed) path
      // enforces. A normal tick is ~100ms, so this only ever bites a long suspend, and
      // it's never more generous than simply closing the tab would have been.
      const capMs = (isPremium() ? balance.offline.premiumMaxHours : balance.offline.maxHours) * 3_600_000;
      const elapsed = Math.min(t - last.current, capMs);
      last.current = t;
      try {
        advance(elapsed);
      } catch (e) {
        if (!tickErrorLogged) {
          console.error("Game tick failed — containing so the loop survives:", e);
          tickErrorLogged = true;
        }
      }
    }, tickMs);

    const saver = window.setInterval(save, saveEverySec * 1000);

    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", save);

    return () => {
      window.clearInterval(loop);
      window.clearInterval(saver);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", save);
      save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
