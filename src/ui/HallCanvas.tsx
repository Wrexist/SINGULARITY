import { useEffect, useRef } from "react";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { buildHallModel } from "../render/hallModel";
import { drawHall } from "../render/hallRenderer";

const ERA_NAMES = ["Garage Closet", "Startup", "Scale-Up"];

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
  const era = useGame((s) =>
    s.game.prestige.ships > 0 || s.game.research.includes("inference_api")
      ? 2
      : s.game.research.length >= 2
        ? 1
        : 0,
  );

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let cssW = 1, cssH = 1, dpr = 1;
    let prevTotal = 0;
    let spawnFrom = 0;
    let spawnStart = -1e9;
    const SPAWN_MS = 440;

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
      const model = buildHallModel(useGame.getState().game);
      const reducedMotion = useSettings.getState().reducedMotion;

      if (model.total > prevTotal) {
        spawnFrom = prevTotal;
        spawnStart = timeMs;
      }
      prevTotal = model.total;
      const spawnT = Math.min(1, (timeMs - spawnStart) / SPAWN_MS);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHall(ctx, model, { width: cssW, height: cssH, timeMs, reducedMotion, spawnFrom, spawnT, dpr });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Pause the loop when the tab is hidden (battery on mobile).
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      } else if (!raf) {
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className="hall" ref={wrapRef}>
      <canvas ref={canvasRef} className="hall-canvas" aria-hidden="true" />
      <div className="hall-tag">
        <span className="hall-era">{ERA_NAMES[era]}</span>
        <span className="hall-count">{rackCount} {rackCount === 1 ? "rack" : "racks"}</span>
      </div>
    </div>
  );
}
