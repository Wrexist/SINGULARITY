import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { buildHallModel, POWER_IDS } from "../render/hallModel";
import { drawHallStatic, drawHallDynamic, expansionMarkers, rackHitAreas, pointInPoly, type RackHit } from "../render/hallRenderer";
import { currentEra, eraName } from "../engine/eras";
import { hallRooms } from "../engine/hall";
import { rackInfo } from "../engine/rackInfo";
import { themeFilter } from "./hallThemes";

/**
 * The 2.5D hall (Phase 1 pillar). A self-driving canvas: an rAF loop reads game
 * state straight from the store each frame (no React re-render churn) and paints
 * the room. Buying a rack manifests it here — the load-bearing dopamine (GDD §5).
 * DPR-aware, pauses when the tab is hidden, and honors reduced-motion.
 */
export function HallCanvas({ onExpand }: { onExpand: (id: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest callback reachable from the (mount-only) pointer handler.
  const onExpandRef = useRef(onExpand);
  onExpandRef.current = onExpand;
  // Live rack hit-areas (refreshed each frame) + the tapped rack's tier (R2.1).
  const rackHitsRef = useRef<RackHit[]>([]);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  // Lightweight label state (re-renders only when these change, not per frame).
  const rackCount = useGame(
    (s) =>
      (s.game.upgrades.rack_basic ?? 0) +
      (s.game.upgrades.rack_server ?? 0) +
      (s.game.upgrades.rack_tpu ?? 0),
  );
  const era = useGame((s) => currentEra(s.game));
  const rooms = useGame((s) => hallRooms(s.game));
  const hallTheme = useSettings((s) => s.hallTheme);
  // Live info for the tapped rack tier (re-subscribes on the count so the card
  // updates if you buy more while it's open). Null tier → no card.
  const selected = useGame((s) =>
    selectedTier === null ? null : rackInfo(s.game, selectedTier),
  );
  // A tier the player has zero of can't really be "on screen"; close stale cards.
  useEffect(() => {
    if (selectedTier !== null && (selected === null || selected.owned === 0)) setSelectedTier(null);
  }, [selectedTier, selected]);

  // Cosmetic theme = a CSS filter on the canvas (purely visual; no render change).
  useEffect(() => {
    if (canvasRef.current) canvasRef.current.style.filter = themeFilter(hallTheme);
  }, [hallTheme]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Offscreen buffer holding the static room (sky + walls + floor). Repainted
    // only when the room size/era changes; blitted every frame. This is the big
    // perf win — the floor grid + a dozen gradients no longer rebuild per frame.
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    let staticSig = "";

    let raf = 0;
    let running = false;
    let cssW = 1, cssH = 1, dpr = 1;
    // Cap the paint rate (~30fps). The animation reads from the clock, so motion
    // stays smooth-looking while we roughly halve canvas work + battery draw.
    const FRAME_MS = 1000 / 30;
    let lastDraw = -1e9;
    let prevTotal = 0;
    let spawnFrom = 0;
    let spawnStart = -1e9;
    const SPAWN_MS = 440;
    let prevClaim = useGame.getState().claimBurst;
    let burstStart = -1e9;
    const BURST_MS = 950;

    // The model only changes when rack counts / run-active / era change — cache
    // it so we don't rebuild ~46 objects every animation frame (mobile GC).
    let modelSig = "";
    let model = buildHallModel(useGame.getState().game);
    let markers = expansionMarkers(model, 1, 1); // current frame's side markers
    // Seed from the hydrated hall so a saved lab doesn't replay the whole
    // spawn animation as if every owned rack were brand-new on first open.
    prevTotal = model.total;

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
      if (timeMs - lastDraw < FRAME_MS) { raf = requestAnimationFrame(frame); return; }
      lastDraw = timeMs;
      const st = useGame.getState();
      const game = st.game;
      if (st.claimBurst !== prevClaim) { prevClaim = st.claimBurst; burstStart = timeMs; }
      const burst = timeMs - burstStart < BURST_MS ? 1 - (timeMs - burstStart) / BURST_MS : 0;
      // Cheap signature of render-affecting fields (run.progress is excluded —
      // the renderer animates from the clock, not from progress).
      const u = game.upgrades;
      // Power ids come from the same source buildHallModel uses, so adding a new
      // powerCapacity upgrade automatically invalidates this cache too.
      const powerSig = POWER_IDS.map((id) => u[id] ?? 0).join(",");
      const sig = `${u.rack_basic ?? 0}|${u.rack_server ?? 0}|${u.rack_tpu ?? 0}|${u.expand_n ?? 0}|${u.expand_s ?? 0}|${u.expand_e ?? 0}|${u.expand_w ?? 0}|${powerSig}|${game.run.active ? 1 : 0}|${game.products.active.length > 0 ? 1 : 0}|${currentEra(game)}`;
      if (sig !== modelSig) {
        modelSig = sig;
        model = buildHallModel(game);
      }
      // Money isn't in the signature (it changes every tick), so refresh the
      // expansion markers' affordability cheaply here so they light up live.
      const money = game.resources.money;
      for (const s of model.sides) s.affordable = !s.maxed && money.gte(s.cost);

      if (model.total > prevTotal) {
        spawnFrom = prevTotal;
        spawnStart = timeMs;
      }
      prevTotal = model.total;
      const spawnT = Math.min(1, (timeMs - spawnStart) / SPAWN_MS);

      // Repaint the cached static room only when its inputs change.
      const ssig = `${model.cols}|${model.rows}|${model.era}|${model.coolingUnits}|${cssW}|${cssH}|${dpr}`;
      if (ssig !== staticSig) {
        staticSig = ssig;
        off.width = canvas.width;
        off.height = canvas.height;
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawHallStatic(offCtx, model, cssW, cssH);
      }

      // Blit the opaque room (fully overwrites the previous frame), then paint
      // the animated layer (racks/motes/markers/burst) on top.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(off, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHallDynamic(ctx, model, {
        width: cssW, height: cssH, timeMs,
        reducedMotion: useSettings.getState().reducedMotion,
        spawnFrom, spawnT, burst, dpr,
      });
      // Debug/test aid (screenshot harness reads marker centroids); harmless.
      markers = expansionMarkers(model, cssW, cssH);
      (window as unknown as { __HALL_MARKERS__?: typeof markers }).__HALL_MARKERS__ = markers;
      // Keep the rack hit-areas current so a tap maps to the rack on screen (R2.1).
      rackHitsRef.current = rackHitAreas(model, cssW, cssH);
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

    // Tap a side marker to buy that expansion (the in-hall affordance).
    const markerAt = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      return markers.find((mk) => !mk.maxed && pointInPoly(px, py, mk.quad));
    };
    // Hit-test the racks front-to-back (last drawn = frontmost wins the tap).
    const rackAt = (ev: PointerEvent): RackHit | undefined => {
      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      const hits = rackHitsRef.current;
      for (let i = hits.length - 1; i >= 0; i--) {
        if (pointInPoly(px, py, hits[i]!.quad)) return hits[i];
      }
      return undefined;
    };
    const onDown = (ev: PointerEvent) => {
      const hit = markerAt(ev);
      if (hit) {
        ev.preventDefault();
        // Don't buy on tap — ask for confirmation first (App shows the popup).
        haptics.tap();
        sound.tap();
        onExpandRef.current(hit.id);
        return;
      }
      // Otherwise: tapping a rack opens its info card; tapping empty floor closes it.
      const rack = rackAt(ev);
      if (rack) {
        ev.preventDefault();
        haptics.tap();
        sound.tap();
        setSelectedTier(rack.tier);
      } else {
        setSelectedTier(null);
      }
    };
    const onMove = (ev: PointerEvent) => {
      canvas.style.cursor = markerAt(ev) || rackAt(ev) ? "pointer" : "default";
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className="hall" ref={wrapRef}>
      <canvas ref={canvasRef} className="hall-canvas" aria-hidden="true" />
      <div className="hall-tag">
        <span className="hall-era">{eraName(era)}</span>
        <span className="hall-count">
          {rackCount} {rackCount === 1 ? "rack" : "racks"}
          {rooms > 1 && ` · ${rooms} rooms`}
        </span>
      </div>
      {selected && selected.owned > 0 && (
        <div className="rack-card" role="dialog" aria-label={`${selected.name} info`} onClick={() => setSelectedTier(null)}>
          <div className="rack-card-head">
            <span className={`rack-swatch tier-${selected.tier}`} aria-hidden="true" />
            <span className="rack-card-name">{selected.name}</span>
            <button className="rack-card-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); setSelectedTier(null); }}>×</button>
          </div>
          <p className="rack-card-desc">{selected.desc}</p>
          <div className="rack-card-stats">
            <span><b>{selected.owned}</b> owned</span>
            <span><b>+{selected.computeEach}</b> compute/s each</span>
            <span><b>+{selected.computeTotal.toLocaleString()}</b> compute/s total</span>
          </div>
        </div>
      )}
    </div>
  );
}
