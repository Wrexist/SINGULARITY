import { useEffect, useRef } from "react";
import { useGame, claimWallTime } from "./store";
import { loopDelta } from "./clockGuard";
import { balance } from "../engine/balance/config";
import { hadProAt } from "./premium";

/** A tick whose raw gap exceeds this is a real suspend (OS sleep / frozen tab), not a
 *  live frame — only then does the Pro offline rate apply. */
export const RESUME_RATE_MIN_MS = 60_000;

/** The offline rate for one loop delta: Pro ×rate on a real suspend, else ×1. Pure. */
export function resumeRate(rawMs: number, pro: boolean): number {
  return pro && Number.isFinite(rawMs) && rawMs > RESUME_RATE_MIN_MS ? balance.offline.proRate : 1;
}

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
  const lastWall = useRef<number>(Date.now());

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
      // Pro as of the previous tick: on a resume that is when the player left, so a
      // renewal the store has not reported yet still pays the away window as Pro.
      const pro = hadProAt(lastWall.current);
      const capMs = (pro ? balance.offline.premiumMaxHours : balance.offline.maxHours) * 3_600_000;
      // performance.now() is monotonic (immune to clock changes) but on iOS it can
      // stop advancing while the device is asleep, so a suspend with the screen
      // locked was credited as seconds instead of hours. When the wall clock saw
      // clearly more time pass than the monotonic clock, trust it: that gap is
      // exactly the sleep. A backwards clock change falls back to the monotonic
      // delta, and the cap below bounds a forward one (as closing the app would).
      // The wall side is GUARDED (clockGuard.ts): only wall time beyond the latest
      // the app has seen counts, so a clock moved forward, back and forward again
      // while the app is open is not paid twice.
      const w = Date.now();
      const perfRaw = t - last.current;
      const raw = loopDelta(perfRaw, claimWallTime(lastWall.current, w));
      const elapsed = Math.min(raw, capMs);
      last.current = t;
      lastWall.current = w;
      try {
        // Pass the raw (unclamped) window too: when this tick IS a resume from a
        // long suspend, the store turns it into the "while you were away" recap,
        // and the recap needs the real time away to say it was capped.
        // Pro: a real suspend (raw gap > 60s) runs at the offline rate, applied to the
        // CAPPED real window (so the cap still bounds real time). Live frames: ×1.
        advance(elapsed, raw, resumeRate(raw, pro), pro);
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
