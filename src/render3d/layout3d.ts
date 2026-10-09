import type { HallModel } from "../render/hallModel";
import { rackTileOrder } from "../render/hallRenderer";

/**
 * 3D hall LAYOUT (Phase 0 spike, see WORLD_3D_PLAN.md): a pure mapping from the
 * same HallModel the 2D canvas paints to world-space placements. No three.js here,
 * so it is unit-testable in node and the scene module stays a dumb consumer.
 *
 * World units: 1 = one floor tile. X runs along the model's gx, Z along gy, Y up.
 * The viewer stands off the FRONT corner (high gx, high gy), exactly like the 2.5D
 * view, so the two back walls sit on gx = gxMin and gy = gyMin.
 */

export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface Rack3D {
  /** Index into model.racks (== the 2D draw/hit index). */
  index: number;
  tier: number;
  x: number;
  z: number;
  /** Body height in world units. */
  h: number;
}

export interface Desk3D {
  /** Index into model.agents. */
  agent: number;
  x: number;
  z: number;
}

export interface Beam3D {
  x: number;
  z: number;
  /** 0..1.1 intensity (revenue share × launch buzz). */
  intensity: number;
}

export interface Plot3D {
  id: string;
  dir: "s" | "e";
  rect: Rect;
  affordable: boolean;
}

export interface Scene3DSpec {
  /** The rack floor (the 2D room). */
  floor: Rect;
  /** The ops bay: an apron in front of the racks where the staff sit. */
  bay: Rect;
  racks: Rack3D[];
  desks: Desk3D[];
  beams: Beam3D[];
  /** Buyable expansion plots (only the ones not maxed out). */
  plots: Plot3D[];
  /** Walkway strips the partitions leave (aisles), as floor rects. */
  aisles: Rect[];
  /** Room floors split by the partitions (1, 2 or 4) — each gets its own tint. */
  rooms: Rect[];
  /** Everything that should stay in frame (floor + bay + plots), for camera fit. */
  bounds: Rect;
  /** Back wall height. */
  wallH: number;
}

/** Ops-bay depth (tiles) in front of the rack floor. */
export const BAY_DEPTH = 2.1;
/** A desk slot's pitch along X. */
const DESK_PITCH = 0.72;

/** Rack body height (world units) — mirrors the 2D `rackBodyHeight` proportions:
 *  bigger tiers stand taller, a packed room stands taller still. */
export function rackHeight3D(tier: number, density: number): number {
  return (0.78 + tier * 0.38) * (0.72 + 0.28 * density);
}

/** Desk slots: staff assigned to a product sit in that product's column (the org
 *  chart, spatially — same rule as the 2D `agentSpots`); everyone else is a roamer
 *  and gets no desk. Overflowing columns wrap to a second row. Pure. */
export function deskSlots(model: HallModel, floor: Rect): Desk3D[] {
  const n = model.beams.length;
  if (n === 0) return [];
  const width = floor.x1 - floor.x0;
  const byBeam: number[][] = Array.from({ length: n }, () => []);
  model.agents.forEach((a, i) => {
    if (a.beam !== null && a.beam < n) byBeam[a.beam]!.push(i);
  });
  const desks: Desk3D[] = [];
  const colW = width / n;
  const perRow = Math.max(1, Math.floor(colW / DESK_PITCH));
  byBeam.forEach((agents, b) => {
    const cx = floor.x0 + (b + 0.5) * colW;
    agents.forEach((agent, k) => {
      const row = Math.floor(k / perRow);
      const inRow = Math.min(perRow, agents.length - row * perRow);
      const slot = k % perRow;
      const x = cx + (slot - (inRow - 1) / 2) * DESK_PITCH;
      desks.push({ agent, x, z: floor.z1 + 0.95 + row * 0.62 });
    });
  });
  return desks;
}

/** Build the whole static placement for one frame's model. Pure and deterministic. */
export function buildScene3D(model: HallModel): Scene3DSpec {
  const floor: Rect = { x0: model.gxMin, z0: model.gyMin, x1: model.gxMin + model.cols, z1: model.gyMin + model.rows };
  const bay: Rect = { x0: floor.x0, z0: floor.z1, x1: floor.x1, z1: floor.z1 + BAY_DEPTH };

  // Racks stand on the SAME tiles, in the same order, as the 2D renderer and its
  // hit-test, so rack index i is the same physical rack in both views.
  const tiles = rackTileOrder(model);
  const racks: Rack3D[] = [];
  for (let i = 0; i < model.racks.length && i < tiles.length; i++) {
    const r = model.racks[i]!;
    const t = tiles[i]!;
    racks.push({ index: i, tier: r.tier, x: t.gx + 0.5, z: t.gy + 0.5, h: rackHeight3D(r.tier, r.density) });
  }

  const n = model.beams.length;
  const beams: Beam3D[] = model.beams.map((v, i) => ({
    x: floor.x0 + ((i + 0.5) / n) * (floor.x1 - floor.x0),
    z: floor.z1 + 0.32,
    intensity: Math.min(1.1, v * (1 + 0.45 * (model.beamBuzz[i] ?? 0))),
  }));

  const plots: Plot3D[] = [];
  for (const s of model.sides) {
    if (s.maxed || (s.dir !== "s" && s.dir !== "e")) continue;
    plots.push({
      id: s.id,
      dir: s.dir,
      affordable: s.affordable,
      rect: s.dir === "s"
        ? { x0: bay.x0, z0: bay.z1 + 0.15, x1: bay.x1, z1: bay.z1 + 1.15 }
        : { x0: floor.x1 + 0.15, z0: floor.z0, x1: floor.x1 + 1.15, z1: floor.z1 },
    });
  }

  const aisles: Rect[] = [];
  if (model.splitGx !== null) aisles.push({ x0: model.splitGx, z0: floor.z0, x1: model.splitGx + 1, z1: floor.z1 });
  if (model.splitGy !== null) aisles.push({ x0: floor.x0, z0: model.splitGy, x1: floor.x1, z1: model.splitGy + 1 });

  const xs = model.splitGx !== null ? [[floor.x0, model.splitGx], [model.splitGx + 1, floor.x1]] : [[floor.x0, floor.x1]];
  const zs = model.splitGy !== null ? [[floor.z0, model.splitGy], [model.splitGy + 1, floor.z1]] : [[floor.z0, floor.z1]];
  const rooms: Rect[] = [];
  for (const [z0, z1] of zs) for (const [x0, x1] of xs) rooms.push({ x0: x0!, z0: z0!, x1: x1!, z1: z1! });

  const bounds: Rect = { x0: floor.x0, z0: floor.z0, x1: floor.x1, z1: bay.z1 };
  for (const p of plots) {
    bounds.x1 = Math.max(bounds.x1, p.rect.x1);
    bounds.z1 = Math.max(bounds.z1, p.rect.z1);
  }

  return { floor, bay, racks, desks: deskSlots(model, floor), beams, plots, aisles, rooms, bounds, wallH: 1.9 + Math.min(1, model.era * 0.12) };
}

export interface AgentPose {
  x: number;
  z: number;
  /** Vertical hop (walk bob / ready-to-claim bounce). */
  lift: number;
  /** Facing, radians about +Y (0 = facing +Z, toward the camera side). */
  rotY: number;
  seated: boolean;
}

/** Deterministic per-frame pose for agent `i`: seated at their desk if they have one,
 *  otherwise strolling the ops-bay aisle — pulled (bounded) toward a smoking rack if
 *  an incident is live, like the 2D floor. Pure function of (spec, model, clock). */
export function agentPose(spec: Scene3DSpec, model: HallModel, i: number, t: number, reducedMotion: boolean): AgentPose {
  const desk = spec.desks.find((d) => d.agent === i);
  const hop = !reducedMotion && model.readyToClaim ? Math.abs(Math.sin(t / 190 + i * 1.3)) * 0.12 : 0;
  if (desk) {
    // Seated, facing the monitor (toward the racks, −Z); a tiny typing sway.
    const sway = reducedMotion ? 0 : Math.sin(t / 420 + i) * 0.04;
    return { x: desk.x, z: desk.z + 0.3, lift: hop, rotY: Math.PI + sway, seated: true };
  }
  const seed = ((i * 2654435761) % 1000) / 1000;
  const seed2 = ((i * 40503) % 997) / 997;
  const { bay } = spec;
  const span = bay.x1 - bay.x0 - 0.8;
  const period = 16000 + seed * 9000;
  const ph = reducedMotion ? seed : (t / period + seed) % 1;
  // Ping-pong along the aisle: u in 0..1..0, heading flips at each end.
  const u = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  let x = bay.x0 + 0.4 + u * span;
  let z = bay.z0 + 1.55 + (seed2 - 0.5) * 0.5;
  let rotY = ph < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  // Incident rally: drift a bounded way toward the nearest smoking rack.
  if (model.incidents.length > 0) {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const ic of model.incidents) {
      const r = spec.racks[ic.rackIndex];
      if (!r) continue;
      const d = Math.hypot(r.x - x, r.z - z);
      if (d < bestD) { bestD = d; best = r; }
    }
    if (best && bestD > 0.01) {
      const pull = Math.min(0.34, 2.2 / bestD);
      x += (best.x - x) * pull;
      z += (best.z - z) * pull;
      rotY = Math.atan2(best.x - x, best.z - z);
    }
  }
  const bob = reducedMotion ? 0 : Math.abs(Math.sin(t / 210 + i)) * 0.035;
  return { x, z, lift: Math.max(bob, hop), rotY, seated: false };
}

/** The inspector's patrol: slow back-and-forth along the bay's front edge (still,
 *  mid-front under reduced motion). Null when the lab is clean. */
export function chenPose(spec: Scene3DSpec, model: HallModel, t: number, reducedMotion: boolean): AgentPose | null {
  if (!model.regulator) return null;
  const s = reducedMotion ? 0 : Math.sin(t / 2600);
  const u = 0.5 + 0.42 * s;
  const { bay } = spec;
  const heading = reducedMotion ? 0 : Math.cos(t / 2600) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  return { x: bay.x0 + u * (bay.x1 - bay.x0), z: bay.z1 - 0.28, lift: reducedMotion ? 0 : Math.abs(Math.sin(t / 260)) * 0.03, rotY: heading, seated: false };
}

/** The training run as light: a soft wave of LED brightness that sweeps the floor
 *  from the back corner to the front while a run is active. Returns 0..1 extra
 *  brightness for a rack at (x, z). Zero when idle or under reduced motion. */
export function trainingWave(x: number, z: number, t: number, active: boolean, reducedMotion: boolean): number {
  if (!active || reducedMotion) return 0;
  const d = x + z; // distance from the back corner along the view diagonal
  const front = ((t / 90) % 60) * 0.5; // wave front position, wraps
  const k = d - front;
  const w = Math.exp(-(k * k) / 2.2) + Math.exp(-((k + 30) * (k + 30)) / 2.2);
  return Math.min(1, w);
}
