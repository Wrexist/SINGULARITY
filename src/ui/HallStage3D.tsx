import { useEffect, useRef, type MutableRefObject, type ReactNode } from "react";
import { useGame } from "../state/store";
import { useSettings } from "./settings";
import { reduceMotionNow } from "./motion";
import { buildHallModel, buildSkyline, heatCrateCount, hallModelSig, type HallModel } from "../render/hallModel";
import { dayPhase, spawnFromOnChange } from "../render/hallRenderer";
import { products as PRODUCTS_BAL } from "../engine/balance/products";
import type { GameState } from "../engine/types";
import type { HallScene3D, Pick3D } from "../render3d/hallScene3d";
import { nextDprCap, shouldRender } from "../render3d/quality";

/**
 * The 3D hall stage (Phase 0 spike — WORLD_3D_PLAN.md). Same contract as the 2D
 * HallCanvas loop: an rAF loop reads the store directly (no React churn), caps the
 * paint rate at ~30fps, pauses when hidden or scrolled away, and honours reduced
 * motion. three.js is code-split behind a dynamic import, so the main bundle is
 * untouched for every player who never turns the flag on.
 *
 * Any failure (no WebGL, chunk load error, context loss — including the silent kind
 * iOS produces when it reclaims the GPU process) calls `onFail`, and HallCanvas falls
 * back to the shipped 2D renderer.
 */
export function HallStage3D({
  wingRef,
  explore,
  paused,
  filter,
  onPick,
  onFail,
  callout,
}: {
  wingRef: MutableRefObject<number>;
  explore: boolean;
  paused: boolean;
  filter: string;
  onPick: (p: Pick3D | null, clientX: number, clientY: number) => void;
  onFail: () => void;
  /** Explore only: a card pinned in the world above the racks (the training run). */
  callout?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    syncRef.current();
  }, [paused]);

  useEffect(() => {
    let disposed = false;
    let scene: HallScene3D | null = null;
    let cleanup: (() => void) | null = null;
    const fail = () => {
      if (!disposed) onFailRef.current();
    };

    import("../render3d/hallScene3d")
      .then(({ createHallScene3D }) => {
        if (disposed) return;
        const canvas = canvasRef.current!;
        const wrap = wrapRef.current!;
        try {
          scene = createHallScene3D(canvas);
        } catch {
          fail();
          return;
        }
        const s3 = scene;
        cleanup = run(s3, canvas, wrap);
      })
      .catch(fail);

    function run(s3: HallScene3D, canvas: HTMLCanvasElement, wrap: HTMLDivElement): () => void {
      let raf = 0;
      let running = false;
      const FRAME_MS = 1000 / 30;
      let lastDraw = -1e9;
      let cssW = 1, cssH = 1;

      let model: HallModel = buildHallModel(useGame.getState().game, wingRef.current);
      let modelSig = "";
      let rigLoadout: unknown = null;
      let agentRoster: unknown = null;
      let lastSkylineAt = -1e9;
      let prevTotal = model.total, prevWing = model.wing;
      let spawnFrom = 0, spawnStart = -1e9;
      const SPAWN_MS = 520;
      let prevClaim = useGame.getState().claimBurst;
      let burstStart = -1e9;
      const BURST_MS = 1100;
      let tapFlash: { index: number; start: number } | null = null;
      // Battery guards (render3d/quality.ts): adaptive pixel ratio + the still lab.
      let dprCap = 2;
      let paceAcc = 0, paceN = 0, prevTick = -1;
      let lastRenderAt = -1e9;
      let lastLostCheck = 0;
      let lostChecks = 0;
      let labelNames = "";
      let labelSizes: { w: number; h: number }[] = [];
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const order: { i: number; x: number; y: number }[] = [];
      s3.setModel(model);

      const resize = () => {
        cssW = Math.max(1, wrap.clientWidth);
        cssH = Math.max(1, wrap.clientHeight);
        s3.resize(cssW, cssH, Math.min(window.devicePixelRatio || 1, dprCap));
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);

      // People cards (explore only, zoomed in) — the Ralv agent card: name, a status
      // chip (working / training / in the lab) and what they're on. DOM, not in-scene
      // text, so they stay crisp at any zoom; positioned by projecting each head.
      const statusOf = (game: GameState, i: number): { tone: string; chip: string; line: string } => {
        const e = game.employees[i];
        const role = model.agents[i]?.role ?? "";
        if (!e) return { tone: "idle", chip: "In the lab", line: role };
        if (e.training) return { tone: "train", chip: "Training", line: `${role} · Lv ${e.level} → ${e.level + 1}` };
        const p = e.assignedProductId ? game.products.active.find((q) => q.id === e.assignedProductId) : undefined;
        return p ? { tone: "work", chip: "Working", line: `${role} · on ${p.name}` } : { tone: "idle", chip: "In the lab", line: role };
      };
      const syncLabels = (m: HallModel, game: GameState) => {
        const host = labelsRef.current;
        if (!host) return;
        const rows = m.agents.map((a, i) => ({ name: a.name, ...statusOf(game, i) }));
        const key = rows.map((r) => `${r.name}/${r.tone}/${r.line}`).join("|");
        if (key === labelNames) return;
        labelNames = key;
        host.replaceChildren(
          ...rows.map((r) => {
            const el = document.createElement("div");
            el.className = "hall3d-label";
            const head = document.createElement("div");
            head.className = "hall3d-label-head";
            const b = document.createElement("b");
            b.textContent = r.name;
            const chip = document.createElement("span");
            chip.className = `hall3d-chip ${r.tone}`;
            chip.textContent = r.chip;
            head.append(b, chip);
            const line = document.createElement("span");
            line.className = "hall3d-label-line";
            line.textContent = r.line;
            el.append(head, line);
            return el;
          }),
        );
        // Measured once (the host is laid out even while faded out), not per frame.
        labelSizes = Array.from(host.children, (el) => ({ w: (el as HTMLElement).offsetWidth || 90, h: (el as HTMLElement).offsetHeight || 32 }));
      };

      const frame = (timeMs: number) => {
        if (!running) return;
        if (timeMs - lastDraw < FRAME_MS) { raf = requestAnimationFrame(frame); return; }
        lastDraw = timeMs;

        // Context watchdog. A loss on backgrounding is normal and restores itself; one
        // that persists across three checks (~6s of visible time) — including the
        // silent kind when iOS reclaims the GPU process — falls back to the 2D hall.
        if (timeMs - lastLostCheck > 2000) {
          lastLostCheck = timeMs;
          lostChecks = s3.isLost() ? lostChecks + 1 : 0;
          if (lostChecks >= 3) { fail(); return; }
        }
        if (lostChecks > 0) { raf = requestAnimationFrame(frame); return; }

        // A renderer bug must never take the hall down: any exception while building
        // or drawing the 3D frame drops this session back to the shipped 2D canvas.
        try {
        const st = useGame.getState();
        const game = st.game;
        if (st.claimBurst !== prevClaim) { prevClaim = st.claimBurst; burstStart = timeMs; }
        const burst = timeMs - burstStart < BURST_MS ? 1 - (timeMs - burstStart) / BURST_MS : 0;

        const sig = hallModelSig(game, wingRef.current);
        let rebuilt = false;
        if (sig !== modelSig || game.components.loadout !== rigLoadout || game.employees !== agentRoster) {
          modelSig = sig;
          rigLoadout = game.components.loadout;
          agentRoster = game.employees;
          model = buildHallModel(game, wingRef.current);
          rebuilt = true;
        }
        // Live fields that move every tick: refresh in place (no rebuild).
        const money = game.resources.money;
        for (const s of model.sides) s.affordable = !s.maxed && money.gte(s.cost);
        model.heatCrates = heatCrateCount(game.heat);
        model.beamBuzz = game.products.active.map((p) => Math.max(0, Math.min(1, p.buzzSec / PRODUCTS_BAL.buzzDurationSec)));
        if (timeMs - lastSkylineAt >= 2000) {
          model.skyline = buildSkyline(game);
          lastSkylineAt = timeMs;
          rebuilt = true;
        }
        if (rebuilt) {
          s3.setModel(model);
          syncLabels(model, game);
        }

        const from = spawnFromOnChange({ total: prevTotal, wing: prevWing }, { total: model.total, wing: model.wing });
        if (from !== null) { spawnFrom = from; spawnStart = timeMs; }
        prevTotal = model.total;
        prevWing = model.wing;

        const rm = reduceMotionNow();
        const tapping = !!tapFlash && timeMs - tapFlash.start < 450;
        const changed = rebuilt || tapping || burst > 0 || from !== null;
        if (!shouldRender({ reducedMotion: rm, explore, changed, sinceLastMs: timeMs - lastRenderAt })) {
          raf = requestAnimationFrame(frame);
          return;
        }
        // Pace check (continuous rendering only): a device that can't hold ~30fps
        // gets a lower pixel-ratio cap, a step at a time.
        if (!rm || explore) {
          if (prevTick > 0 && timeMs - prevTick < 1000) { paceAcc += timeMs - prevTick; paceN++; }
          prevTick = timeMs;
          if (paceN >= 90) {
            const next = nextDprCap(dprCap, paceAcc / paceN);
            paceAcc = paceN = 0;
            if (next !== dprCap) { dprCap = next; resize(); }
          }
        }
        lastRenderAt = timeMs;
        s3.frame({
          timeMs,
          reducedMotion: rm,
          phase: rm ? 0.08 : dayPhase(timeMs),
          spawnFrom,
          spawnT: rm ? 1 : Math.min(1, (timeMs - spawnStart) / SPAWN_MS),
          burst: rm ? 0 : burst,
          rackSkin: useSettings.getState().rackSkin,
          ...(tapFlash && timeMs - tapFlash.start < 450 ? { tapFlash: { index: tapFlash.index, t: 1 - (timeMs - tapFlash.start) / 450 } } : {}),
        });
        } catch {
          stop();
          fail();
          return;
        }

        // Level of detail: at overview the run callout floats over the racks; pinched
        // in, it gives way to the people cards.
        const zoom = s3.zoom();
        const anchor = anchorRef.current;
        if (anchor) {
          const a = zoom < 1.6 ? s3.runAnchor() : null;
          anchor.classList.toggle("on", !!a);
          if (a) anchor.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) translate(-50%, -100%)`;
        }
        const host = labelsRef.current;
        if (host) {
          const show = explore && zoom >= 1.6;
          host.classList.toggle("on", show);
          if (show) {
            // Label culling: front-most people (lowest on screen) claim their spot
            // first; a label that would overlap one already placed simply hides, so a
            // busy desk cluster reads as a few clean names instead of a pile-up.
            const els = host.children;
            order.length = 0;
            for (let i = 0; i < els.length; i++) {
              const p = s3.agentScreen(i);
              if (p) order.push({ i, x: p.x, y: p.y });
              else (els[i] as HTMLElement).style.visibility = "hidden";
            }
            order.sort((a, b) => b.y - a.y);
            placed.length = 0;
            for (const o of order) {
              const el = els[o.i] as HTMLElement;
              const sz = labelSizes[o.i] ?? { w: 90, h: 32 };
              const r = { x0: o.x - sz.w / 2 - 3, y0: o.y - sz.h - 3, x1: o.x + sz.w / 2 + 3, y1: o.y + 3 };
              const clash = placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
              el.style.visibility = clash ? "hidden" : "visible";
              if (clash) continue;
              placed.push(r);
              el.style.transform = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) translate(-50%, -100%)`;
            }
          }
        }
        raf = requestAnimationFrame(frame);
      };

      const start = () => {
        if (running) return;
        running = true;
        prevTick = -1; // a pause isn't a slow frame
        raf = requestAnimationFrame(frame);
      };
      const stop = () => {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      };
      let pageVisible = document.visibilityState !== "hidden";
      let onScreen = true;
      const sync = () => (pageVisible && onScreen && !pausedRef.current ? start() : stop());
      syncRef.current = sync;
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

      if (explore) s3.setExplore(true);
      // Debug/test aid (the smoke harness taps through this, like __HALL_MARKERS__).
      const hook = { pick: (x: number, y: number) => s3.pick(x, y), stats: () => s3.stats() };
      (window as unknown as { __HALL3D__?: typeof hook }).__HALL3D__ = hook;

      // A TAP (not a drag / pinch / page scroll) picks what is under the finger. Active
      // pointers are tracked by id, and a new PRIMARY pointer means nothing else is down —
      // so a release that happened off the canvas can never leave taps stuck "busy".
      let down: { x: number; y: number; t: number; id: number } | null = null;
      const active = new Set<number>();
      const onDown = (ev: PointerEvent) => {
        if (ev.isPrimary) active.clear();
        active.add(ev.pointerId);
        down = active.size === 1 ? { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId } : null;
      };
      const onUp = (ev: PointerEvent) => {
        active.delete(ev.pointerId);
        const d = down;
        down = null;
        if (!d || d.id !== ev.pointerId) return;
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8 || performance.now() - d.t > 600) return;
        const rect = canvas.getBoundingClientRect();
        const hit = s3.pick(ev.clientX - rect.left, ev.clientY - rect.top);
        if (hit?.kind === "rack") tapFlash = { index: hit.index, start: performance.now() };
        if (hit && explore && hit.kind !== "plot") s3.focus(hit);
        onPickRef.current(hit, ev.clientX, ev.clientY);
      };
      const onCancel = (ev: PointerEvent) => {
        active.delete(ev.pointerId);
        down = null;
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onCancel);

      return () => {
        stop();
        syncRef.current = () => {};
        const w = window as unknown as { __HALL3D__?: unknown };
        if (w.__HALL3D__ === hook) delete w.__HALL3D__;
        ro.disconnect();
        io?.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onCancel);
      };
    }

    return () => {
      disposed = true;
      cleanup?.();
      scene?.dispose();
    };
    // Mount-only: explore is fixed per instance (the overlay mounts its own stage).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="hall3d-stage" ref={wrapRef}>
      <canvas ref={canvasRef} className="hall-canvas" aria-hidden="true" style={filter ? { filter } : undefined} />
      {explore && <div className="hall3d-labels" ref={labelsRef} aria-hidden="true" />}
      {explore && callout && <div className="hall3d-anchor" ref={anchorRef}>{callout}</div>}
    </div>
  );
}
