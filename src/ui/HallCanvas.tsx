import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { reduceMotionNow } from "./motion";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { floatText } from "./fx";
import { wingAtX } from "./wingSlop";
import { buildHallModel, buildSkyline, heatCrateCount, hallModelSig } from "../render/hallModel";
import { drawHallStatic, drawHallDynamic, expansionMarkers, rackHitAreas, rackAtPoint, spawnFromOnChange, pointInPoly, agentSpots, chenSpot, dayPhase, type RackHit, type AgentSpot } from "../render/hallRenderer";
import { currentEra, eraName } from "../engine/eras";
import { hallRooms, hallWings, wingCapacity } from "../engine/hall";
import { regulatorState } from "../engine/regulator";
import { balance } from "../engine/balance/config";
import { products as PRODUCTS_BAL } from "../engine/balance/products";
import { rackInfo } from "../engine/rackInfo";
import { derive } from "../engine/derive";
import { productMetrics } from "../engine/products";
import { fmtDur, m$, numOf } from "./format";
import { bigRedBalance, bigRedCooldown, bigRedOpen } from "../engine/bigRed";
import type { BigRedOutcome } from "../engine/balance/bigRed";
import { themeFilter } from "./hallThemes";
import { hall3dEnabled } from "../render3d/flag";
import type { Pick3D } from "../render3d/hallScene3d";
import { HallStage3D } from "./HallStage3D";
import { Portal } from "./Portal";
import { ExpandIcon } from "./Icons";
import { useDialog } from "./useDialog";
import { ExploreHud, ExploreHint, TrainingCallout } from "./Hall3DHud";

/** Wings are named, not numbered: "Wing B" reads like a place in a building, where
 *  "Wing 2" reads like an index. Past Z it falls back to a number, which no real save
 *  will ever reach (maxWings is 24). */
const WING_NAME = (i: number) => (i < 26 ? `Wing ${String.fromCharCode(65 + i)}` : `Wing ${i + 1}`);

/** Product launch/viral buzz window (s) — normalises buzzSec to a 0..1 beam-surge factor. */
const BUZZ_WINDOW_SEC = PRODUCTS_BAL.buzzDurationSec;

/**
 * The 2.5D hall (Phase 1 pillar). A self-driving canvas: an rAF loop reads game
 * state straight from the store each frame (no React re-render churn) and paints
 * the room. Buying a rack manifests it here — the load-bearing dopamine (GDD §5).
 * DPR-aware, pauses when the tab is hidden, and honors reduced-motion.
 */
function HallCanvasImpl({ onExpand }: { onExpand: (id: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep the latest callback reachable from the (mount-only) pointer handler.
  const onExpandRef = useRef(onExpand);
  onExpandRef.current = onExpand;
  // Renderer: the shipped 2D canvas, or the opt-in 3D Lab (Settings → 3D Lab (beta),
  // or the ?hall3d=1 dev flag; WORLD_3D_PLAN.md). Any 3D failure (no WebGL, a lost
  // context, a renderer error) drops back to 2D for the rest of the session.
  const lab3d = useSettings((s) => s.lab3d);
  const [devFlag] = useState(hall3dEnabled);
  const [failed3d, setFailed3d] = useState(false);
  const mode: "2d" | "3d" = (lab3d || devFlag) && !failed3d ? "3d" : "2d";
  const [explore, setExplore] = useState(false);
  // Live rack hit-areas (refreshed each frame) + the tapped rack's tier (R2.1).
  const rackHitsRef = useRef<RackHit[]>([]);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  // IDEAS #2/#7 — live agent/inspector positions (refreshed each frame) and the
  // tapped person. Only one card (rack / agent / Chen) is open at a time.
  const agentSpotsRef = useRef<AgentSpot[]>([]);
  const chenSpotRef = useRef<{ x: number; y: number; s: number } | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [chenOpen, setChenOpen] = useState(false);
  // 3D-only tap targets: a product's revenue beam, the ops bot, the crowd at the lip.
  const [selectedBeam, setSelectedBeam] = useState<number | null>(null);
  const [botOpen, setBotOpen] = useState(false);
  const [crowdOpen, setCrowdOpen] = useState(false);
  // The Big Red Button (R3.3): whole seconds until it's ready (-1 = not unlocked), and
  // what the last press rolled (its card).
  const bigRedLeft = useGame((s) => (bigRedOpen(s.game) ? Math.ceil(bigRedCooldown(s.game)) : -1));
  const [bigRedResult, setBigRedResult] = useState<BigRedOutcome | null>(null);

  // Lightweight label state (re-renders only when these change, not per frame).
  const rackCount = useGame(
    (s) =>
      (s.game.upgrades.rack_basic ?? 0) +
      (s.game.upgrades.rack_server ?? 0) +
      (s.game.upgrades.rack_tpu ?? 0),
  );
  const era = useGame((s) => currentEra(s.game));
  const rooms = useGame((s) => hallRooms(s.game));
  // Facility Wings: which floor is on screen. Deliberately UI state, not game state —
  // where you are standing is not part of the save.
  const wings = useGame((s) => hallWings(s.game));
  const perWing = useGame((s) => wingCapacity(s.game));
  const [wing, setWing] = useState(0);
  // A wing can vanish under you only via a sanitized load; snap back rather than
  // render an index the model would have to clamp every frame.
  useEffect(() => {
    if (wing > wings - 1) setWing(0);
  }, [wing, wings]);
  // The rAF loop reads the store directly and never re-renders, so the viewed wing
  // has to reach it through a ref.
  const wingRef = useRef(0);
  wingRef.current = Math.min(wing, wings - 1);
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
  // The tapped beam's product, live (beams are index-aligned with the live products;
  // one retired under the card closes it). Mods-aware, like the Products panel.
  const beamInfo = useGame((s) => {
    if (selectedBeam === null) return null;
    const p = s.game.products.active[selectedBeam];
    if (!p) return null;
    const me = productMetrics(p, s.game.products.frontier, derive(s.game).productModsById[p.id]);
    return { name: p.name, version: p.version, users: numOf(p.mau), paid: numOf(p.paid), revenue: m$(me.mrr), trending: p.buzzSec > 0 };
  });
  useEffect(() => {
    if (selectedBeam !== null && beamInfo === null) setSelectedBeam(null);
  }, [selectedBeam, beamInfo]);
  // Why there's a crowd: the good events running now (joined into one stable string so
  // the card re-renders only when a line changes).
  const crowdLines = useGame((s) =>
    crowdOpen
      ? s.game.modifiers
          .filter((m) => m.tone === "good" && m.remainingSec > 0)
          .map((m) => `${m.label} · +${Math.round((m.factor - 1) * 100)}% ${m.target === "computeMult" ? "compute" : m.target === "dataMult" ? "data" : "money"} · ${fmtDur(m.remainingSec)} left`)
          .join("\n")
      : "",
  );
  useEffect(() => {
    if (crowdOpen && !crowdLines) setCrowdOpen(false);
  }, [crowdOpen, crowdLines]);

  // Cosmetic theme = a CSS filter on the canvas (purely visual; no render change).
  useEffect(() => {
    if (canvasRef.current) canvasRef.current.style.filter = themeFilter(hallTheme);
  }, [hallTheme, mode]);

  // The 3D stage's taps land here so both renderers share one set of cards/actions.
  const closeAllCards = useCallback(() => {
    setSelectedTier(null);
    setSelectedAgent(null);
    setChenOpen(false);
    setSelectedBeam(null);
    setBotOpen(false);
    setCrowdOpen(false);
    setBigRedResult(null);
  }, []);
  const onPressBigRed = useCallback(() => {
    const o = useGame.getState().doPressBigRed();
    if (!o) return;
    const bad = o.factor < 1;
    if (bad) { haptics.warn(); sound.alert(); } else { haptics.celebrate(); sound.success(); }
    closeAllCards();
    setBigRedResult(o);
  }, [closeAllCards]);
  const onPick3D = useCallback((p: Pick3D | null, clientX: number, clientY: number) => {
    if (!p) { closeAllCards(); return; }
    sound.tap();
    if (p.kind === "rack" && p.incident) {
      // IDEAS #5 — a smoking rack is a problem you can WORK (same as the 2D tap).
      haptics.success();
      useGame.getState().doWorkProblem(p.incident);
      floatText(clientX, clientY - 12, `on it — −${balance.worldEvents.workShaveSec}s`, "#ff9f0a", 13);
      return;
    }
    haptics.tap();
    if (p.kind === "plot") { onExpandRef.current(p.id); return; }
    closeAllCards();
    if (p.kind === "chen") setChenOpen(true);
    else if (p.kind === "agent") setSelectedAgent(p.index);
    else if (p.kind === "beam") setSelectedBeam(p.index);
    else if (p.kind === "bot") setBotOpen(true);
    else if (p.kind === "crowd") setCrowdOpen(true);
    else setSelectedTier(p.tier);
  }, [closeAllCards]);
  const fallBack2D = useCallback(() => { setExplore(false); setFailed3d(true); }, []);
  // Turning the 3D Lab off closes an open explore view with it.
  useEffect(() => { if (mode === "2d") setExplore(false); }, [mode]);

  useEffect(() => {
    if (mode !== "2d") return;
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
    let prevWing = 0;
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
    let model = buildHallModel(useGame.getState().game, wingRef.current);
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
    prevWing = model.wing;

    const resize = () => {
      // Layout size, not getBoundingClientRect: the stage's entry animation has the
      // hall mid-scale (0.985) on a cold boot, and a transform never fires the
      // ResizeObserver — so the shrunken size used to stick, leaving a light strip
      // down the right and bottom edges. clientWidth also excludes the 1px border.
      cssW = Math.max(1, wrap.clientWidth);
      cssH = Math.max(1, wrap.clientHeight);
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
      // Cheap signature of render-affecting fields (shared with the 3D stage).
      const sig = hallModelSig(game, wingRef.current);
      if (sig !== modelSig || game.components.loadout !== rigLoadout || game.employees !== agentRoster) {
        modelSig = sig;
        rigLoadout = game.components.loadout;
        agentRoster = game.employees;
        model = buildHallModel(game, wingRef.current);
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

      const from = spawnFromOnChange({ total: prevTotal, wing: prevWing }, { total: model.total, wing: model.wing });
      if (from !== null) {
        spawnFrom = from;
        spawnStart = timeMs;
      }
      prevTotal = model.total;
      prevWing = model.wing;
      const spawnT = Math.min(1, (timeMs - spawnStart) / SPAWN_MS);

      // Repaint the cached static room only when its inputs change. The skyline
      // is quantised to 5% steps so its slow drift repaints rarely, not per tick.
      // The day/night cycle joins it as a coarse bucket (48/day ≈ one repaint
      // every ~5s worst-case); reduced motion freezes the sky at late morning.
      const rmNow = reduceMotionNow();
      const phase = rmNow ? 0.08 : dayPhase(timeMs);
      const skySig = model.skyline.map((t) => `${Math.round(t.h * 20)}${t.dim ? "d" : ""}${t.you ? "y" : ""}`).join(".");
      const ssig = `${model.cols}|${model.rows}|${model.era}|${model.coolingUnits}|${cssW}|${cssH}|${dpr}|${model.charter?.id ?? ""}|${model.wall.map((w) => `${w.era}${w.asc ? "a" : ""}${w.mag === undefined ? "" : Math.round(w.mag * 4)}`).join(".")}|${skySig}|${Math.round(phase * 48)}`;
      if (ssig !== staticSig) {
        staticSig = ssig;
        off.width = canvas.width;
        off.height = canvas.height;
        offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawHallStatic(offCtx, model, cssW, cssH, phase);
      }

      // Blit the opaque room (fully overwrites the previous frame), then paint
      // the animated layer (racks/motes/markers/burst) on top.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(off, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHallDynamic(ctx, model, {
        width: cssW, height: cssH, timeMs,
        reducedMotion: reduceMotionNow(),
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
      const rm = reduceMotionNow();
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
    // Draw only while the hall can actually be seen: the tab is visible AND the card
    // is on screen. A late-game floor is ~1,400 canvas calls a frame, and it used to
    // keep drawing while the player scrolled the upgrade list below it — measured at
    // 4x CPU throttle, pausing it off-screen took the main thread from ~790 to ~330
    // ms/s and long tasks from ~79 to ~1 per 10s. (2026-09 performance audit.)
    let pageVisible = document.visibilityState !== "hidden";
    let onScreen = true;
    const sync = () => (pageVisible && onScreen ? start() : stop());
    sync();

    const onVis = () => { pageVisible = document.visibilityState !== "hidden"; sync(); };
    document.addEventListener("visibilitychange", onVis);
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          const e = entries[entries.length - 1];
          if (e) { onScreen = e.isIntersecting; sync(); }
        })
      : null;
    io?.observe(wrap);

    // Tap a side marker to buy that expansion (the in-hall affordance).
    const markerAt = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
      return markers.find((mk) => !mk.maxed && pointInPoly(px, py, mk.quad));
    };
    // Hit-test the racks front-to-back (last drawn = frontmost wins the tap), on the
    // box the player sees rather than only the floor tile under it.
    const rackAt = (ev: PointerEvent): RackHit | undefined => {
      const rect = canvas.getBoundingClientRect();
      return rackAtPoint(rackHitsRef.current, ev.clientX - rect.left, ev.clientY - rect.top);
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
      io?.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
    };
  }, [mode]);

  // The tap cards: in the card normally, inside the overlay while exploring.
  const cards = (
    <>
    {/* The rack cards echo taps on the (aria-hidden) canvas; the same facts live in
        the accessible panels. Their × stays out of the Tab order (tabIndex -1) so
        nothing focusable sits inside an aria-hidden subtree. Tapping still closes. */}
    {agentInfo && (
      <div className="rack-card" aria-hidden="true" onClick={() => setSelectedAgent(null)}>
        <div className="rack-card-head">
          <span className="rack-card-name">{agentInfo.name}</span>
          <button className="rack-card-x" aria-label="Close" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setSelectedAgent(null); }}>×</button>
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
          <button className="rack-card-x" aria-label="Close" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setChenOpen(false); }}>×</button>
        </div>
        <p className="rack-card-desc">{chenInfo.label} — {chenInfo.blurb}</p>
        <div className="rack-card-stats"><span>Lobbying (Data Market) cools her interest. Shady buys don't.</span></div>
      </div>
    )}
    {beamInfo && (
      <div className="rack-card" aria-hidden="true" onClick={() => setSelectedBeam(null)}>
        <div className="rack-card-head">
          <span className="rack-card-name">{beamInfo.name}</span>
          <button className="rack-card-x" aria-label="Close" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setSelectedBeam(null); }}>×</button>
        </div>
        <p className="rack-card-desc">
          v{beamInfo.version} · its beam rises with what it earns{beamInfo.trending ? " — trending now" : ""}
        </p>
        <div className="rack-card-stats">
          <span><b>{beamInfo.revenue}</b>/s revenue</span>
          <span><b>{beamInfo.users}</b> users</span>
          <span><b>{beamInfo.paid}</b> paying</span>
        </div>
      </div>
    )}
    {botOpen && (
      <div className="rack-card" aria-hidden="true" onClick={() => setBotOpen(false)}>
        <div className="rack-card-head">
          <span className="rack-card-name">Ops bot</span>
          <button className="rack-card-x" aria-label="Close" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setBotOpen(false); }}>×</button>
        </div>
        <p className="rack-card-desc">Your Auto-Train Orchestrator: it restarts training runs on its own, checking each rack on its rounds.</p>
      </div>
    )}
    {crowdOpen && crowdLines && (
      <div className="rack-card" aria-hidden="true" onClick={() => setCrowdOpen(false)}>
        <div className="rack-card-head">
          <span className="rack-card-name">The buzz is drawing a crowd</span>
          <button className="rack-card-x" aria-label="Close" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setCrowdOpen(false); }}>×</button>
        </div>
        <div className="rack-card-stats">
          {crowdLines.split("\n").map((l) => <span key={l}>{l}</span>)}
        </div>
      </div>
    )}
    {bigRedResult && (
      // A real button's answer, so it is announced (unlike the canvas-echo cards).
      <div className={`rack-card bigred-card ${bigRedResult.factor < 1 ? "bad" : "good"}`} role="status" onClick={() => setBigRedResult(null)}>
        <div className="rack-card-head">
          <span className="rack-card-name">{bigRedResult.headline}</span>
          <button className="rack-card-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); setBigRedResult(null); }}>×</button>
        </div>
        <p className="rack-card-desc">{bigRedResult.body}</p>
      </div>
    )}
    {!agentInfo && !chenOpen && !beamInfo && !botOpen && !crowdOpen && !bigRedResult && selected && selected.owned > 0 && (
      // A lightweight popover, not a dialog: the hall is a pointer/touch canvas
      // (aria-hidden), so claiming dialog semantics would promise keyboard/AT
      // access this canvas-only affordance doesn't provide. aria-hidden keeps it
      // out of the AT tree to match — the rack data is also in the Hardware panel.
      <div className="rack-card" aria-hidden="true" onClick={() => setSelectedTier(null)}>
        <div className="rack-card-head">
          <span className={`rack-swatch tier-${selected.tier}`} aria-hidden="true" />
          <span className="rack-card-name">{selected.name}</span>
          <button className="rack-card-x" aria-label="Close" tabIndex={-1} onClick={(e) => { e.stopPropagation(); setSelectedTier(null); }}>×</button>
        </div>
        <p className="rack-card-desc">{selected.desc}</p>
        <div className="rack-card-stats">
          <span><b>{selected.owned}</b> owned</span>
          <span><b>+{selected.computeEach}</b> compute/s each</span>
          <span><b>+{selected.computeTotal.toLocaleString()}</b> compute/s total</span>
        </div>
      </div>
    )}
    </>
  );

  return (
    <div className="hall" ref={wrapRef}>
      {mode === "2d" ? (
        <canvas ref={canvasRef} className="hall-canvas" aria-hidden="true" />
      ) : (
        <HallStage3D wingRef={wingRef} explore={false} paused={explore} filter={themeFilter(hallTheme)} onPick={onPick3D} onFail={fallBack2D} />
      )}
      {bigRedLeft >= 0 && (
        // The Big Red Button: a gamble you start (a surge, or a small disaster). The
        // ring fills as it recharges; ready, it glows. No label — the dome says it.
        <button
          className={`hall-bigred${bigRedLeft === 0 ? " ready" : ""}`}
          disabled={bigRedLeft > 0}
          onClick={onPressBigRed}
          aria-label={bigRedLeft === 0 ? "Press the Big Red Button: a gamble — a surge, or a small disaster" : `Big Red Button recharging, ${fmtDur(bigRedLeft)}`}
          title={bigRedLeft === 0 ? "Press the Big Red Button" : `Recharging · ${fmtDur(bigRedLeft)}`}
        >
          <svg className="hall-bigred-ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="20" className="track" />
            <circle cx="22" cy="22" r="20" className="fill" strokeDasharray={BIGRED_C} strokeDashoffset={BIGRED_C * Math.min(1, bigRedLeft / bigRedBalance.cooldownSec)} />
          </svg>
          <span className="hall-bigred-cap" aria-hidden="true" />
        </button>
      )}
      <div className="hall-tag">
        <span className="hall-era">{eraName(era)}</span>
        <span className="hall-count">
          {rackCount} {rackCount === 1 ? "rack" : "racks"}
          {rooms > 1 && ` · ${rooms} rooms`}
        </span>
      </div>
      {/* Wing switcher — only once a second floor exists. A single wing is just "the
          hall", and a control that never has a second option is noise. */}
      {wings > 1 && (
        // The frame is 2px wider than the pill on every side and hands a tap that
        // misses every chip to the chip nearest it (see wingSlop.ts): the scroller
        // clips a chip's own hit area to the pill, which stopped each chip at 41px.
        <div
          className="hall-wings-hit"
          onClick={(e) => {
            if ((e.target as Element).closest(".hall-wing")) return;
            const chips = Array.from(e.currentTarget.querySelectorAll(".hall-wing"), (c) => c.getBoundingClientRect());
            const i = wingAtX(chips, e.clientX);
            if (i >= 0) { setWing(i); haptics.tap(); }
          }}
        >
        <nav className="hall-wings" aria-label="Facility wings">
          {Array.from({ length: wings }, (_, i) => {
            const filled = Math.max(0, Math.min(perWing, rackCount - i * perWing));
            return (
              <button
                key={i}
                className={`hall-wing ${i === Math.min(wing, wings - 1) ? "on" : ""}`}
                aria-current={i === Math.min(wing, wings - 1) ? "true" : undefined}
                onClick={() => { setWing(i); haptics.tap(); }}
              >
                {WING_NAME(i)}
                <span className="hall-wing-fill">{filled}/{perWing}</span>
              </button>
            );
          })}
        </nav>
        </div>
      )}
      {mode === "3d" && (
        <button className="hall3d-expand" aria-label="Explore the lab in 3D" onClick={() => { haptics.tap(); closeAllCards(); setExplore(true); }}>
          <ExpandIcon size={16} />
        </button>
      )}
      {!explore && cards}
      {explore && mode === "3d" && (
        <Explore3D wingRef={wingRef} filter={themeFilter(hallTheme)} onPick={onPick3D} onFail={fallBack2D} onClose={() => { closeAllCards(); setExplore(false); }}>
          {cards}
        </Explore3D>
      )}
    </div>
  );
}

/** Full-screen "walk the floor" mode for the 3D spike: the same lab, a free camera
 *  (pan / pinch / orbit within the front quadrant), people labelled when zoomed in.
 *  Portalled so it covers the true viewport; Escape and × close it. */
function Explore3D({
  wingRef, filter, onPick, onFail, onClose, children,
}: {
  wingRef: React.MutableRefObject<number>;
  filter: string;
  onPick: (p: Pick3D | null, clientX: number, clientY: number) => void;
  onFail: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, labelledBy: "hall3d-explore-title" });
  return (
    <Portal>
      <div className="hall3d-explore" ref={ref} role="dialog" aria-modal="true" aria-labelledby="hall3d-explore-title">
        <h2 id="hall3d-explore-title" className="sr-only">The lab, in 3D</h2>
        <HallStage3D wingRef={wingRef} explore paused={false} filter={filter} onPick={onPick} onFail={onFail} callout={<TrainingCallout />} />
        <ExploreHud wing={wingRef.current} />
        <ExploreHint />
        <button className="hall3d-close" aria-label="Close" onClick={onClose}>×</button>
        {children}
      </div>
    </Portal>
  );
}

/** Circumference of the Big Red Button's recharge ring (r = 20). */
const BIGRED_C = 2 * Math.PI * 20;

/** Memoised: App re-renders at 10Hz, and this component's props are stable (it reads
 *  the store itself where it needs live state), so those renders were pure waste. */
export const HallCanvas = memo(HallCanvasImpl);
