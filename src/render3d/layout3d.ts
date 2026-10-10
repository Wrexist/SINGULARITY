import type { HallModel } from "../render/hallModel";
import { rackTileOrder } from "../render/hallRenderer";

/**
 * 3D hall LAYOUT (see WORLD_3D_PLAN.md): a pure mapping from the same HallModel the
 * 2D canvas paints to world-space placements. No three.js here, so it is unit-testable
 * in node and the scene module stays a dumb consumer.
 *
 * World units: 1 = one floor tile. X runs along the model's gx, Z along gy, Y up.
 * The viewer stands off the FRONT corner (high gx, high gy), exactly like the 2.5D
 * view, so the two back walls sit on gx = gxMin and gy = gyMin.
 *
 * The ops bay (in front of the racks) is laid out like the Ralv agent office: desks
 * in facing pairs with a planter strip between them, beams rising behind, a walkway
 * along the front edge, plants and lamps in the corners.
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
  /** +1: the person sits on the FRONT side facing the racks (−Z, back to camera);
   *  −1: on the back side facing the camera (+Z). */
  side: 1 | -1;
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

export interface Prop3D { x: number; z: number; s: number }

export interface Scene3DSpec {
  /** The rack floor (the 2D room). */
  floor: Rect;
  /** The ops bay: an apron in front of the racks where the staff sit. */
  bay: Rect;
  racks: Rack3D[];
  desks: Desk3D[];
  /** Planter strips between facing desk pairs (one per product column). */
  planters: Rect[];
  beams: Beam3D[];
  /** Buyable expansion plots (only the ones not maxed out). */
  plots: Plot3D[];
  /** Walkway strips the partitions leave (aisles), as floor rects. */
  aisles: Rect[];
  /** Room floors split by the partitions (1, 2 or 4) — each gets its own rug. */
  rooms: Rect[];
  /** Potted plants (bay corners) and floor lamps (warm pools at night). */
  plants: Prop3D[];
  lamps: Prop3D[];
  /** Everything that should stay in frame (floor + bay + plots), for camera fit. */
  bounds: Rect;
  /** Back wall height. */
  wallH: number;
}

/** Ops-bay depth (tiles) in front of the rack floor. */
export const BAY_DEPTH = 2.5;
/** A desk slot's pitch along X. */
const DESK_PITCH = 0.7;
/** Z offsets inside the bay (from the rack floor's front edge). */
const BEAM_Z = 0.3;
const PAIR_Z = 1.13; // the planter strip between the two desks of a pair
const DESK_HALF = 0.19; // desk depth / 2
export const WALK_Z = 2.05; // the front walkway

/** Rack body height (world units) — mirrors the 2D `rackBodyHeight` proportions:
 *  bigger tiers stand taller, a packed room stands taller still. */
export function rackHeight3D(tier: number, density: number): number {
  return (0.78 + tier * 0.38) * (0.72 + 0.28 * density);
}

/** Desk slots: staff assigned to a product sit in that product's column (the org
 *  chart, spatially — same rule as the 2D `agentSpots`); everyone else is a roamer
 *  and gets no desk. A column fills its front row (backs to the camera, screens
 *  glowing toward it) and then the facing back row. Pure. */
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
    // At most two rows (front + facing back); anyone past that roams.
    agents.slice(0, perRow * 2).forEach((agent, k) => {
      const row = k < perRow ? 0 : 1;
      const inRow = Math.min(perRow, agents.length - row * perRow);
      const slot = k % perRow;
      const x = cx + (slot - (Math.min(inRow, perRow) - 1) / 2) * DESK_PITCH;
      const side: 1 | -1 = row === 0 ? 1 : -1;
      desks.push({ agent, x, z: floor.z1 + PAIR_Z + side * (DESK_HALF + 0.005), side });
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
  const colW = (floor.x1 - floor.x0) / Math.max(1, n);
  const beams: Beam3D[] = model.beams.map((v, i) => ({
    x: floor.x0 + (i + 0.5) * colW,
    z: floor.z1 + BEAM_Z,
    intensity: Math.min(1.1, v * (1 + 0.45 * (model.beamBuzz[i] ?? 0))),
  }));

  const desks = deskSlots(model, floor);
  // A planter strip runs between each column's facing desks, as long as its desks.
  const planters: Rect[] = [];
  for (let b = 0; b < n; b++) {
    const xs = desks.filter((d) => model.agents[d.agent]!.beam === b).map((d) => d.x);
    if (xs.length === 0) continue;
    const x0 = Math.min(...xs) - 0.28, x1 = Math.max(...xs) + 0.28;
    planters.push({ x0, z0: floor.z1 + PAIR_Z - 0.035, x1, z1: floor.z1 + PAIR_Z + 0.035 });
  }

  const plots: Plot3D[] = [];
  for (const s of model.sides) {
    if (s.maxed || (s.dir !== "s" && s.dir !== "e")) continue;
    plots.push({
      id: s.id,
      dir: s.dir,
      affordable: s.affordable,
      rect: s.dir === "s"
        ? { x0: bay.x0, z0: bay.z1 + 0.2, x1: bay.x1, z1: bay.z1 + 1.2 }
        : { x0: floor.x1 + 0.2, z0: floor.z0, x1: floor.x1 + 1.2, z1: floor.z1 },
    });
  }

  const aisles: Rect[] = [];
  if (model.splitGx !== null) aisles.push({ x0: model.splitGx, z0: floor.z0, x1: model.splitGx + 1, z1: floor.z1 });
  if (model.splitGy !== null) aisles.push({ x0: floor.x0, z0: model.splitGy, x1: floor.x1, z1: model.splitGy + 1 });

  const xs = model.splitGx !== null ? [[floor.x0, model.splitGx], [model.splitGx + 1, floor.x1]] : [[floor.x0, floor.x1]];
  const zs = model.splitGy !== null ? [[floor.z0, model.splitGy], [model.splitGy + 1, floor.z1]] : [[floor.z0, floor.z1]];
  const rooms: Rect[] = [];
  for (const [z0, z1] of zs) for (const [x0, x1] of xs) rooms.push({ x0: x0!, z0: z0!, x1: x1!, z1: z1! });

  // Corner furniture: plants at the back corners of the bay, a lamp + plant at the front.
  const plants: Prop3D[] = [
    { x: bay.x0 + 0.26, z: bay.z0 + 0.3, s: 1.15 },
    { x: bay.x1 - 0.26, z: bay.z0 + 0.3, s: 1 },
    { x: bay.x1 - 0.26, z: bay.z1 - 0.26, s: 1.3 },
  ];
  const lamps: Prop3D[] = [{ x: bay.x0 + 0.26, z: bay.z1 - 0.26, s: 1 }];

  const bounds: Rect = { x0: floor.x0, z0: floor.z0, x1: floor.x1, z1: bay.z1 };
  for (const p of plots) {
    bounds.x1 = Math.max(bounds.x1, p.rect.x1);
    bounds.z1 = Math.max(bounds.z1, p.rect.z1);
  }

  return { floor, bay, racks, desks, planters, beams, plots, aisles, rooms, plants, lamps, bounds, wallH: 2.1 + Math.min(1, model.era * 0.1) };
}

export interface AgentPose {
  x: number;
  z: number;
  /** Vertical hop (walk bob / ready-to-claim bounce). */
  lift: number;
  /** Facing, radians about +Y (0 = facing +Z, toward the camera side). */
  rotY: number;
  seated: boolean;
  /** Walk / typing cycle phase (radians) — drives the limb swing. */
  gait: number;
  /** Head turn (radians about +Y, relative to the body): seated staff glance around. */
  yaw: number;
  /** 0..1 how much the legs swing (walkers slow to a stop at each end). */
  stride?: number;
  /** 0..1 arms raised overhead (an onlooker cheering). */
  cheer?: number;
  /** 0..1 one arm raised in a wave (a tapped person answering the tap), and that
   *  arm's side-to-side swing (radians). */
  wave?: number;
  waveSwing?: number;
}

/** Deterministic per-frame pose for agent `i`: seated at their desk if they have one,
 *  otherwise strolling the ops-bay walkway — pulled (bounded) toward a smoking rack if
 *  an incident is live, like the 2D floor. Pure function of (spec, model, clock). */
export function agentPose(spec: Scene3DSpec, model: HallModel, i: number, t: number, reducedMotion: boolean): AgentPose {
  const desk = spec.desks.find((d) => d.agent === i);
  const hop = !reducedMotion && model.readyToClaim ? Math.abs(Math.sin(t / 190 + i * 1.3)) * 0.12 : 0;
  if (desk) {
    // Seated on the chair behind the desk, facing the monitor; typing drives the arms.
    // Now and then they look up and glance to one side (a few seconds in every ~30).
    const sway = reducedMotion ? 0 : Math.sin(t / 900 + i) * 0.03;
    const g = reducedMotion ? 0 : Math.sin(t / 5200 + i * 2.3);
    const yaw = g > 0.72 ? ((g - 0.72) / 0.28) * 0.6 * (i % 2 ? 1 : -1) : 0;
    return {
      x: desk.x,
      z: desk.z + desk.side * 0.34,
      lift: hop,
      rotY: (desk.side === 1 ? Math.PI : 0) + sway,
      seated: true,
      gait: reducedMotion ? 0 : t / 95 + i * 1.7,
      yaw,
    };
  }
  const seed = ((i * 2654435761) % 1000) / 1000;
  const seed2 = ((i * 40503) % 997) / 997;
  const { bay } = spec;
  const span = bay.x1 - bay.x0 - 1.3;
  const period = 16000 + seed * 9000;
  const ph = reducedMotion ? seed : (t / period + seed) % 1;
  // Back and forth along the walkway, easing to a stop at each end; mid-turn they face
  // the camera, so a turnaround reads as a person turning, not a sprite flipping.
  const u = (1 - Math.cos(ph * Math.PI * 2)) / 2;
  const v = Math.sin(ph * Math.PI * 2); // velocity sign/size along +X
  let x = bay.x0 + 0.65 + u * Math.max(0, span);
  let z = bay.z0 + WALK_Z + (seed2 - 0.5) * 0.24;
  let rotY = (Math.PI / 2) * Math.max(-1, Math.min(1, v * 3));
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
  // Stride slows with the walking speed, so they don't moonwalk at the turnarounds.
  const stride = Math.min(1, Math.abs(v) * 1.6);
  const gait = reducedMotion ? 0 : t / 160 + i * 2.3;
  const bob = reducedMotion ? 0 : Math.abs(Math.sin(gait)) * 0.025 * stride;
  return { x, z, lift: Math.max(bob, hop), rotY, seated: false, gait, yaw: 0, stride };
}

/** The inspector's patrol: slow back-and-forth along the bay's front edge (still,
 *  mid-front under reduced motion). Null when the lab is clean. */
export function chenPose(spec: Scene3DSpec, model: HallModel, t: number, reducedMotion: boolean): AgentPose | null {
  if (!model.regulator) return null;
  const s = reducedMotion ? 0 : Math.sin(t / 2600);
  const u = 0.5 + 0.38 * s;
  const { bay } = spec;
  const heading = reducedMotion ? 0 : Math.cos(t / 2600) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  const gait = reducedMotion ? 0 : t / 200;
  return { x: bay.x0 + u * (bay.x1 - bay.x0), z: bay.z1 - 0.2, lift: reducedMotion ? 0 : Math.abs(Math.sin(gait)) * 0.02, rotY: heading, seated: false, gait, yaw: 0 };
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

/** The ops bot's lane: just in front of the front row of racks. */
export const BOT_LANE = 0.16;
const BOT_SPEED = 0.0011; // tiles per ms (~1.1 tiles/s)
const BOT_DWELL = 1800; // ms scanning each rack it stops at

export interface BotPose {
  x: number;
  z: number;
  /** Facing (0 = +Z). It faces the racks (π) while scanning. */
  rotY: number;
  /** Hover height above the floor. */
  hover: number;
  /** 0..1 progress of the current scan (0 = not scanning). */
  scan: number;
  /** Index into spec.racks of the rack being scanned, or -1. */
  rack: number;
}

/** Auto-train made visible (the 2D "ops bot"): a little hover bot glides along the
 *  front row of racks, stopping at each to scan it, then back the other way. Pure
 *  function of (spec, model, clock). Under reduced motion it waits, parked, at the
 *  left end of the lane, so owning the automation still shows. Null without it. */
export function botPose(spec: Scene3DSpec, model: HallModel, t: number, reducedMotion: boolean): BotPose | null {
  if (!model.autoBot || spec.racks.length === 0) return null;
  const frontZ = Math.max(...spec.racks.map((r) => r.z));
  const z = Math.min(spec.floor.z1, frontZ + 0.5) + BOT_LANE;
  const parked: BotPose = { x: spec.floor.x0 + 0.3, z, rotY: 0, hover: 0.05, scan: 0, rack: -1 };
  if (reducedMotion) return parked;
  const stops = spec.racks
    .map((r, i) => ({ x: r.x, i }))
    .filter((_, i) => spec.racks[i]!.z === frontZ)
    .sort((a, b) => a.x - b.x);
  const hover = 0.06 + 0.018 * Math.sin(t / 420);
  if (stops.length === 1) {
    const s = stops[0]!;
    return { x: s.x, z, rotY: Math.PI, hover, scan: (t % BOT_DWELL) / BOT_DWELL, rack: s.i };
  }
  // Ping-pong over the stops: 0, 1, … n−1, n−2, … 1, then round again.
  const seq: number[] = [];
  for (let k = 0; k < stops.length; k++) seq.push(k);
  for (let k = stops.length - 2; k >= 1; k--) seq.push(k);
  const legs = seq.map((from, j) => {
    const to = seq[(j + 1) % seq.length]!;
    return { from, to, travel: Math.abs(stops[to]!.x - stops[from]!.x) / BOT_SPEED };
  });
  const cycle = legs.reduce((s, l) => s + BOT_DWELL + l.travel, 0);
  let u = ((t % cycle) + cycle) % cycle;
  for (const leg of legs) {
    const a = stops[leg.from]!, b = stops[leg.to]!;
    if (u < BOT_DWELL) return { x: a.x, z, rotY: Math.PI, hover, scan: u / BOT_DWELL, rack: a.i };
    u -= BOT_DWELL;
    if (u < leg.travel) {
      const p = u / leg.travel;
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      // Turn from facing the racks to the travel heading and back (+X → π/2, −X → 3π/2,
      // so the turn is always the short way round from π).
      const heading = b.x >= a.x ? Math.PI / 2 : (3 * Math.PI) / 2;
      const turn = Math.min(1, p / 0.2, (1 - p) / 0.2);
      return { x: a.x + (b.x - a.x) * e, z, rotY: Math.PI + (heading - Math.PI) * turn, hover, scan: 0, rack: -1 };
    }
    u -= leg.travel;
  }
  return parked; // unreachable: u < cycle
}

/** Hype made visible (the 2D crowd): onlookers pressed against the lab's open front
 *  edge while a good-tone event runs, turned in toward the floor. Every third one
 *  cheers, arms up. They bob with excitement (still under reduced motion). */
export function crowdPose(spec: Scene3DSpec, k: number, t: number, reducedMotion: boolean): AgentPose {
  const { bay, floor } = spec;
  const seed = ((k * 48271) % 997) / 997;
  const w = bay.x1 - bay.x0;
  const x = bay.x0 + 0.8 + seed * Math.max(0, w - 1.6);
  const z = bay.z1 + 0.34 + (k % 2) * 0.3;
  const cx = (floor.x0 + floor.x1) / 2;
  const rotY = Math.atan2(cx - x, floor.z1 - z);
  const cheer = k % 3 === 0 ? 1 : 0;
  const bob = reducedMotion ? 0 : Math.abs(Math.sin(t / 210 + k * 1.9)) * (cheer ? 0.08 : 0.04);
  return { x, z, lift: bob, rotY, seated: false, gait: reducedMotion ? 0 : t / 260 + k, yaw: 0, stride: 0, cheer };
}

/** A component purchase arriving (the 2D delivery dolly): a crate fades in at the
 *  plinth's right edge, rolls along the front walkway and fades as it reaches the
 *  racks. `ms` since the buy; null once it has arrived (or for any non-finite clock). */
export const DELIVERY_MS = 1800;
export function deliveryPose(spec: Scene3DSpec, ms: number): { x: number; z: number; alpha: number } | null {
  if (!(ms >= 0) || ms >= DELIVERY_MS) return null;
  const u = ms / DELIVERY_MS;
  const e = 1 - Math.pow(1 - u, 3);
  const { bay, floor } = spec;
  const z = bay.z0 + WALK_Z + 0.1;
  const x0 = bay.x1 - 0.25; // on the plinth, never floating past its edge
  const x1 = floor.x0 + (floor.x1 - floor.x0) * 0.55;
  const alpha = u < 0.1 ? u / 0.1 : u > 0.8 ? (1 - u) / 0.2 : 1;
  return { x: x0 + (x1 - x0) * e, z, alpha };
}

/** Squared distance from point (px, py) to the segment (ax, ay)–(bx, by): how close a
 *  tap (css px) landed to a beam's projected column. */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return (px - ax - u * dx) ** 2 + (py - ay - u * dy) ** 2;
}
