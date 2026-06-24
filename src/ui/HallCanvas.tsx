import { useEffect, useRef } from "react";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { buildHallModel } from "../render/hallModel";
import { drawHall } from "../render/hallRenderer";
import { currentEra, eraName } from "../engine/eras";

/**
 * The 2.5D hall (Phase 1 pillar). A self-driving canvas: an rAF loop reads game
 * state straight from the store each frame (no React re-render churn) and paints
 * the room. Buying a rack manifests it here — the load-bearing dopamine (GDD §5).
 * DPR-aware, pauses when the tab is hidden, and honors reduced-motion.
 */
export function HallCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Lightweight label state (re-renders only when these change, not per frame).
  const rackCount = useGame(
    (s) =>
      (s.game.upgrades.rack_basic ?? 0) +
      (s.game.upgrades.rack_server ?? 0) +
      (s.game.upgrades.rack_tpu ?? 0),
  );
  const era = useGame((s) => currentEra(s.game));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = false;
    let cssW = 1, cssH = 1, dpr = 1;
    let prevTotal = 0;
    let spawnFrom = 0;
    let spawnStart = -1e9;
    const SPAWN_MS = 440;

    // The model only changes when rack counts / run-active / era change — cache
    // it so we don't rebuild ~46 objects every animation frame (mobile GC).
    let modelSig = "";
    let model = buildHallModel(useGame.getState().game);

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (timeMs: number) => {
      if (!running) return; // a stray queued callback after stop() is a no-op
      const game = useGame.getState().game;
      // Cheap signature of render-affecting fields (run.progress is excluded —
      // the renderer animates from the clock, not from progress).
      const u = game.upgrades;
      const sig = `${u.rack_basic ?? 0}|${u.rack_server ?? 0}|${u.rack_tpu ?? 0}|${game.run.active ? 1 : 0}|${currentEra(game)}`;
      if (sig !== modelSig) {
        modelSig = sig;
        model = buildHallModel(game);
      }

      if (model.total > prevTotal) {
        spawnFrom = prevTotal;
        spawnStart = timeMs;
      }
      prevTotal = model.total;
      const spawnT = Math.min(1, (timeMs - spawnStart) / SPAWN_MS);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHall(ctx, model, {
        width: cssW, height: cssH, timeMs,
        reducedMotion: useSettings.getState().reducedMotion,
        spawnFrom, spawnT, dpr,
      });
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running) return; // idempotent — never spawn a second loop
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    start();

    // Pause the loop when the tab is hidden (battery on mobile).
    const onVis = () => (document.visibilityState === "hidden" ? stop() : start());
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="hall" ref={wrapRef}>
      <canvas ref={canvasRef} className="hall-canvas" aria-hidden="true" />
      <div className="hall-tag">
        <span className="hall-era">{eraName(era)}</span>
        <span className="hall-count">{rackCount} {rackCount === 1 ? "rack" : "racks"}</span>
      </div>
    </div>
  );
}
