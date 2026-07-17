import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { floatText } from "./fx";
import { buildHallModel, buildSkyline, heatCrateCount, POWER_IDS } from "../render/hallModel";
import { drawHallStatic, drawHallDynamic, expansionMarkers, rackHitAreas, pointInPoly, agentSpots, chenSpot, type RackHit, type AgentSpot } from "../render/hallRenderer";
import { currentEra, eraName } from "../engine/eras";
import { hallRooms } from "../engine/hall";
import { regulatorState } from "../engine/regulator";
import { balance } from "../engine/balance/config";
import { products as PRODUCTS_BAL } from "../engine/balance/products";
import { rackInfo } from "../engine/rackInfo";
import { themeFilter } from "./hallThemes";

/** Product launch/viral buzz window (s) — normalises buzzSec to a 0..1 beam-surge factor. */
const BUZZ_WINDOW_SEC = PRODUCTS_BAL.buzzDurationSec;

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
  // IDEAS #2/#7 — live agent/inspector positions (refreshed each frame) and the
  // tapped person. Only one card (rack / agent / Chen) is open at a time.
  const agentSpotsRef = useRef<AgentSpot[]>([]);
  const chenSpotRef = useRef<{ x: number; y: number; s: number } | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [chenOpen, setChenOpen] = useState(false);

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

  // The tapped employee's live card data (fired/re-rostered people close it).
  const agentInfo = useGame((s) => {
    if (selectedAgent === null) return null;
    const e = s.game.employees[selectedAgent];
    if (!e) return null;
    const role = balance.staff.roles.find((r) => r.id === e.roleId);
    const trait = e.trait ? balance.staff.traits.find((t) => t.id === e.trait) : null;
    const product = e.assignedProductId ? s.game.products.active.find((p) => p.id === e.assignedProductId) : null;
    return {
      name: e.name,
      role: role?.name ?? e.roleId,
      level: e.level,
      trait: trait ? `${trait.name} — ${trait.desc}` : null,
      assigned: product?.name ?? null,
    };
  });
  useEffect(() => {
    if (selectedAgent !== null && agentInfo === null) setSelectedAgent(null);
  }, [selectedAgent, agentInfo]);
  // Chen's live standing (for her tap card).
  const chenInfo = useGame((s) => (chenOpen ? regulatorState(s.game) : null));

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
    // IDEAS #3 — a component buy dollies a crate in. Owned-copy total only grows
    // on buy/fuse/trophy-grant (all "hardware arriving"), so a sum-diff is the trigger.
    const partsOwned = (o: Record<string, number>) => {
      let n = 0;
      for (const v of Object.values(o)) n += v;
      return n;
    };
    let prevParts = partsOwned(useGame.getState().game.components.owned);
    let deliveryStart = -1e9;
    const DELIVERY_MS = 1100;
    // The skyline (a market-leaderboard sort + map) drifts slowly and only feeds a
    // 5%-quantised static repaint, so rebuilding it every frame is wasted allocation +
    // GC on mobile. Refresh it a few times a second instead; the quantised signature
    // repaints no more often than that anyway. buildHallModel seeds a fresh one on rebuild.
    let lastSkylineAt = -1e9;
    const SKYLINE_REFRESH_MS = 400;

    // The model only changes when rack counts / run-active / era change — cache
    // it so we don't rebuild ~46 objects every animation frame (mobile GC).
    let modelSig = "";
    let model = buildHallModel(useGame.getState().game);
    // Bare Metal: the model's rig-bay view only changes when the loadout array
    // is replaced (equip / clear / prestige) — track the ref and force a model
    // rebuild instead of scanning the loadout per frame.
    let rigLoadout: unknown = useGame.getState().game.components.loadout;
    // Staff identity: the agents view changes on any roster mutation (hire /
    // train / assign) — the employees array ref tracks all of them.
    let agentRoster: unknown = useGame.getState().game.employees;
    // Rack-tap micro-interaction: which rack was touched, and when (rAF clock).
    let tapFlash: { index: number; start: number } | null = null;
    const TAP_FLASH_MS = 450;
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
      // Incident set: changes on event fire/expiry/work — not on the per-tick decay.
      const incSig = game.modifiers.map((m) => `${m.id}${m.tone === "bad" ? (m.worked ? "w" : "b") : "g"}`).join(",");
      // Software upgrades that manifest in the model (overclock → hotter racks,
      // auto_train → ops bot, data_pipeline → denser motes, batching → faster beam
      // pulses, monetize → golden beam glint) MUST be in the signature, else buying
      // them rebuilds nothing and the lab looks unchanged (2026-07: they were modeled
      // but omitted here, so a common buy like Overclock felt inert).
      const sig = `${u.rack_basic ?? 0}|${u.rack_server ?? 0}|${u.rack_tpu ?? 0}|${u.expand_n ?? 0}|${u.expand_s ?? 0}|${u.expand_e ?? 0}|${u.expand_w ?? 0}|${u.overclock ?? 0}|${u.auto_train ?? 0}|${u.data_pipeline ?? 0}|${u.batching ?? 0}|${u.monetize ?? 0}|${powerSig}|${game.run.active ? 1 : 0}|${game.products.active.length}|${currentEra(game)}|${regulatorState(game).index}|${game.charter ?? ""}|${game.shipLog.length}|${incSig}`;
      if (sig !== modelSig || game.components.loadout !== rigLoadout || game.employees !== agentRoster) {
        modelSig = sig;
        rigLoadout = game.components.loadout;
        agentRoster = game.employees;
        model = buildHallModel(game);
      }
      // Money isn't in the signature (it changes every tick), so refresh the
      // expansion markers' affordability cheaply here so they light up live.
      const money = game.resources.money;
      for (const s of model.sides) s.affordable = !s.maxed && money.gte(s.cost);
      // Heat moves every tick too — refresh the entrance crate pile the same way.
      model.heatCrates = heatCrateCount(game.heat);
      // Product buzz decays every tick — refresh the per-beam surge factor in place so a
      // launch/viral window is felt live (index-aligned to the model's beams).
      model.beamBuzz = game.products.active.map((p) => Math.max(0, Math.min(1, p.buzzSec / BUZZ_WINDOW_SEC)));
      // The horizon race drifts continuously (rival pools scale with the frontier; your
      // MAU grows), but only feeds the coarse static repaint below — so refresh it a few
      // times a second, not every frame, keeping the last-built towers in between.
      if (timeMs - lastSkylineAt >= SKYLINE_REFRESH_MS) {
        model.skyline = buildSkyline(game);
        lastSkylineAt = timeMs;
      }
      // A new part in the inventory → the crate dolly rolls in.
      const parts = partsOwned(game.components.owned);
      if (parts > prevParts) deliveryStart = timeMs;
      prevParts = parts;
      const delivery = timeMs - deliveryStart < DELIVERY_MS ? 1 - (timeMs - deliveryStart) / DELIVERY_MS : 0;

      if (model.total > prevTotal) {
        spawnFrom = prevTotal;
        spawnStart = timeMs;
      }
      prevTotal = model.total;
      const spawnT = Math.min(1, (timeMs - spawnStart) / SPAWN_MS);

      // Repaint the cached static room only when its inputs change. The skyline
      // is quantised to 5% steps so its slow drift repaints rarely, not per tick.
      const skySig = model.skyline.map((t) => `${Math.round(t.h * 20)}${t.dim ? "d" : ""}${t.you ? "y" : ""}`).join(".");
      const ssig = `${model.cols}|${model.rows}|${model.era}|${model.coolingUnits}|${cssW}|${cssH}|${dpr}|${model.charter?.id ?? ""}|${model.wall.map((w) => `${w.era}${w.asc ? "a" : ""}`).join(".")}|${skySig}`;
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
        rackSkin: useSettings.getState().rackSkin,
        delivery,
        ...(tapFlash && timeMs - tapFlash.start < TAP_FLASH_MS
          ? { tapFlash: { index: tapFlash.index, t: 1 - (timeMs - tapFlash.start) / TAP_FLASH_MS } }
          : {}),
      });
      // Debug/test aid (screenshot harness reads marker centroids); harmless.
      markers = expansionMarkers(model, cssW, cssH);
      (window as unknown as { __HALL_MARKERS__?: typeof markers }).__HALL_MARKERS__ = markers;
      // Keep the rack hit-areas current so a tap maps to the rack on screen (R2.1).
      rackHitsRef.current = rackHitAreas(model, cssW, cssH);
      // ...and the people (they move — the hit-test follows this frame's spots).
      const rm = useSettings.getState().reducedMotion;
      agentSpotsRef.current = model.agents.length > 0 ? agentSpots(model, cssW, cssH, timeMs, rm) : [];
      chenSpotRef.current = chenSpot(model, cssW, cssH, timeMs, rm);
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
    // People hit-tests (IDEAS #2/#7): a generous box around the little figure.
    const pointOnFigure = (px: number, py: number, x: number, y: number, s: number): boolean =>
      Math.abs(px - x) <= s * 2.2 && py >= y - s * 4.6 && py <= y + s * 1.2;
    const chenAt = (ev: PointerEvent) => {
      const c = chenSpotRef.current;
      if (!c) return false;
      const rect = canvas.getBoundingClientRect();
      return pointOnFigure(ev.clientX - rect.left, ev.clientY - rect.top, c.x, c.y, c.s);
    };
    const agentAt = (ev: PointerEvent): AgentSpot | undefined => {
      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      const spots = agentSpotsRef.current;
      for (let i = spots.length - 1; i >= 0; i--) {
        const a = spots[i]!;
        if (pointOnFigure(px, py, a.x, a.y - a.bob, a.s)) return a;
      }
      return undefined;
    };
    const closeCards = () => {
      setSelectedTier(null);
      setSelectedAgent(null);
      setChenOpen(false);
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
      // People stand in front of the racks, so they win the tap: the inspector
      // first (she's drawn frontmost), then staff, then the rack under it all.
      if (chenAt(ev)) {
        ev.preventDefault();
        haptics.tap();
        sound.tap();
        closeCards();
        setChenOpen(true);
        return;
      }
      const agent = agentAt(ev);
      if (agent) {
        ev.preventDefault();
        haptics.tap();
        sound.tap();
        closeCards();
        setSelectedAgent(agent.index);
        return;
      }
      // Otherwise: tapping a rack opens its info card; tapping empty floor closes it.
      const rack = rackAt(ev);
      if (rack) {
        ev.preventDefault();
        // IDEAS #5 — a smoking rack is a problem you can WORK: the first tap
        // shaves a bounded slice off the incident instead of opening the card.
        const inc = model.incidents.find((x) => x.rackIndex === rack.index && !x.worked);
        if (inc) {
          haptics.success();
          sound.tap();
          tapFlash = { index: rack.index, start: performance.now() };
          useGame.getState().doWorkProblem(inc.id);
          floatText(ev.clientX, ev.clientY - 12, `on it — −${balance.worldEvents.workShaveSec}s`, "#ff9f0a", 13);
          return;
        }
        haptics.tap();
        sound.tap();
        // The hall answers the touch: that rack's LEDs flicker for a beat.
        tapFlash = { index: rack.index, start: performance.now() };
        closeCards();
        setSelectedTier(rack.tier);
      } else {
        closeCards();
      }
    };
    const onMove = (ev: PointerEvent) => {
      canvas.style.cursor = markerAt(ev) || chenAt(ev) || agentAt(ev) || rackAt(ev) ? "pointer" : "default";
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
      {agentInfo && (
        <div className="rack-card" aria-hidden="true" onClick={() => setSelectedAgent(null)}>
          <div className="rack-card-head">
            <span className="rack-card-name">{agentInfo.name}</span>
            <button className="rack-card-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); setSelectedAgent(null); }}>×</button>
          </div>
          <p className="rack-card-desc">
            {agentInfo.role} · Lv {agentInfo.level}
            {agentInfo.assigned ? ` · on ${agentInfo.assigned}` : ""}
          </p>
          {agentInfo.trait && <div className="rack-card-stats"><span>{agentInfo.trait}</span></div>}
        </div>
      )}
      {chenOpen && chenInfo && (
        <div className="rack-card" aria-hidden="true" onClick={() => setChenOpen(false)}>
          <div className="rack-card-head">
            <span className="rack-card-name">{chenInfo.name}</span>
            <button className="rack-card-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); setChenOpen(false); }}>×</button>
          </div>
          <p className="rack-card-desc">{chenInfo.label} — {chenInfo.blurb}</p>
          <div className="rack-card-stats"><span>Lobbying (Data Market) cools her interest. Shady buys don't.</span></div>
        </div>
      )}
      {!agentInfo && !chenOpen && selected && selected.owned > 0 && (
        // A lightweight popover, not a dialog: the hall is a pointer/touch canvas
        // (aria-hidden), so claiming dialog semantics would promise keyboard/AT
        // access this canvas-only affordance doesn't provide. aria-hidden keeps it
        // out of the AT tree to match — the rack data is also in the Hardware panel.
        <div className="rack-card" aria-hidden="true" onClick={() => setSelectedTier(null)}>
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
