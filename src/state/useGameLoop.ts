import { useEffect, useRef } from "react";
import { useGame } from "./store";

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
    const loop = window.setInterval(() => {
      const t = performance.now();
      const elapsed = t - last.current;
      last.current = t;
      advance(elapsed);
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
