import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MOUSE,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { HallModel } from "../render/hallModel";
import { nightFactor, skinTint } from "../render/hallRenderer";
import { buildScene3D, agentPose, chenPose, trainingWave, type AgentPose, type Scene3DSpec, type Rect } from "./layout3d";

/**
 * The 3D hall (WORLD_3D_PLAN.md) — a "Lab Diorama" in the style of the Ralv agent
 * office: a low-FOV perspective camera over a building on a cream plinth, cutaway
 * walls, colour-blocked rugs, real soft shadows plus contact shadows, instanced racks,
 * staff at paired desks. It paints the SAME HallModel the 2D canvas paints.
 *
 * Fully procedural: no meshes, no image files. The few textures (contact-shadow
 * blobs, the ground grid, floor lettering) are drawn on a canvas at startup — the
 * DEV.md parametric rule holds.
 *
 * Perf shape (mobile-first): everything repeated is instanced; the shadow map is
 * re-rendered only when the room changes (people carry contact shadows); DPR ≤ 2;
 * the caller caps the frame rate and pauses off-screen, exactly like the 2D loop.
 */

export interface Scene3DFrame {
  timeMs: number;
  reducedMotion: boolean;
  /** Day phase 0..1 (dayPhase from the 2D renderer; the caller freezes it under RM). */
  phase: number;
  spawnFrom: number;
  spawnT: number;
  burst: number;
  rackSkin?: string;
  tapFlash?: { index: number; t: number };
}

export type Pick3D =
  | { kind: "rack"; index: number; tier: number; incident: string | null }
  | { kind: "agent"; index: number }
  | { kind: "chen" }
  | { kind: "plot"; id: string };

export interface HallScene3D {
  setModel(model: HallModel): void;
  frame(f: Scene3DFrame): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  pick(cssX: number, cssY: number): Pick3D | null;
  /** Explore mode: free camera (pan / pinch / orbit within the front quadrant). */
  setExplore(on: boolean): void;
  /** Explore mode: glide the camera toward a picked thing. */
  focus(p: Pick3D): void;
  /** Screen position (css px) above agent i's head, or null if off-screen / absent. */
  agentScreen(i: number): { x: number; y: number } | null;
  /** Screen position (css px) of the training-run anchor above the racks. */
  runAnchor(): { x: number; y: number } | null;
  /** 1 at the fitted view; larger when the player has pinched in. */
  zoom(): number;
  /** True once the GL context is gone (iOS can kill it without an event firing). */
  isLost(): boolean;
  /** Last frame's renderer counters (perf budget checks in the smoke harness). */
  stats(): { calls: number; triangles: number; geometries: number; textures: number };
  dispose(): void;
}

/** Thrown (without logging) when the device can't give us WebGL2; the stage falls back. */
export class NoWebGLError extends Error {}

type RGB = [number, number, number];
/** A box by its floor rect, base height and height (+ optional instance colour). */
type Bx = { r: Rect; y0: number; h: number; c?: RGB };

const FLOOR_Y = 0.3; // the plinth top — everything stands on it
const MAX_RACKS = 120;
const MAX_PEOPLE = 16;
const MAX_MOTES = 90;
const MAX_PULSES = 48;
const MAX_SMOKE = 24;
const MAX_LEAVES = 220;
const LED_BARS = 6;
const FOV = 24;
/** Per-tier footprint (x/z scale): tiers read by SHAPE, not colour alone (colour-blind
 *  safe) — a slim consumer tower, a standard server blade, a broad TPU pod with a cap. */
const TIER_FOOT = [0.78, 1, 1.14];
const WING_NAME = (i: number) => (i < 26 ? `WING ${String.fromCharCode(65 + i)}` : `WING ${i + 1}`);

// Lab Diorama palette. Neutral, warm architecture; colour lives in rugs and light.
const WALL: RGB = [240, 229, 219];
const WALL_CAP: RGB = [214, 194, 180];
const PLINTH: RGB = [220, 198, 182];
const ERA_GROUND: RGB[] = [[38, 32, 46], [34, 30, 56], [40, 28, 56], [26, 40, 50], [30, 32, 64], [46, 34, 76]];
const ERA_FLOOR: RGB[] = [[146, 140, 133], [164, 110, 72], [156, 106, 74], [160, 114, 78], [150, 104, 76], [226, 222, 238]];
const ERA_BAY_RUG: RGB[] = [[201, 150, 92], [40, 150, 140], [128, 92, 206], [52, 150, 100], [64, 112, 214], [206, 112, 190]];
const ROOM_RUGS: RGB[][] = [
  [[124, 120, 116]], // garage: worn anti-static mats on the concrete
  [[63, 45, 92], [29, 79, 85], [38, 58, 102], [90, 42, 58]],
  [[63, 45, 92], [29, 79, 85], [38, 58, 102], [90, 42, 58]],
  [[29, 79, 85], [38, 58, 102], [63, 45, 92], [90, 42, 58]],
  [[38, 58, 102], [63, 45, 92], [29, 79, 85], [90, 42, 58]],
  [[150, 132, 210], [124, 176, 200], [196, 150, 206], [140, 160, 220]],
];
const TIER: RGB[] = [[52, 210, 126], [63, 134, 240], [155, 81, 224]];
const TIER_LED: RGB[] = [[150, 255, 196], [150, 205, 255], [215, 170, 255]];
const BEAM: RGB[] = [[63, 134, 240], [155, 81, 224], [52, 210, 126], [245, 180, 10], [255, 99, 132]];
const SKIN: RGB[] = [[241, 204, 176], [214, 166, 128], [168, 116, 82], [120, 80, 56], [232, 190, 150]];
const HAIR: RGB[] = [[40, 32, 30], [74, 52, 38], [20, 20, 24], [150, 104, 60], [196, 160, 110], [120, 60, 50]];
const CHAIR: RGB[] = [[168, 195, 160], [232, 164, 99], [239, 230, 214], [143, 155, 179], [214, 132, 120]];
/** Rig Bay part grades (matches the 2D hall): standard, enterprise, prototype. */
const GRADE_GLOW: RGB[] = [[255, 228, 180], [255, 228, 180], [96, 224, 255], [208, 144, 255]];
const LEAF: RGB[] = [[88, 150, 82], [70, 132, 74], [112, 168, 90], [60, 118, 70]];

const pick = <T,>(a: T[], i: number): T => a[((i % a.length) + a.length) % a.length]!;
const col = (c: RGB) => new Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, SRGBColorSpace);
/** Write an sRGB triple into an existing Color (no per-frame allocation). */
const setC = (target: Color, c: RGB, k = 1) => target.setRGB((c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k, SRGBColorSpace);
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: RGB, f: number): RGB => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const hash01 = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// --- Procedural textures (drawn once on a canvas; no image files) -----------------

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (g) draw(g);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A soft radial contact shadow: dark centre fading to nothing. */
function blobTexture(): CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, "rgba(0,0,0,0.62)");
    r.addColorStop(0.55, "rgba(0,0,0,0.28)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Ambient occlusion along a wall base: dark at the wall, fading into the room. */
function edgeTexture(): CanvasTexture {
  return canvasTex(8, 64, (g) => {
    const r = g.createLinearGradient(0, 0, 0, 64);
    r.addColorStop(0, "rgba(0,0,0,0.5)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 8, 64);
  });
}

/** A two-tier ground grid (one tile per 4 units: minor lines + a major edge). */
function gridTexture(): CanvasTexture {
  const t = canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(255,255,255,0.22)";
    g.lineWidth = 2;
    for (let k = 1; k < 4; k++) {
      g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64, 256); g.stroke();
      g.beginPath(); g.moveTo(0, k * 64); g.lineTo(256, k * 64); g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,0.5)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Floor lettering (Ralv-style room names lying on the ground). */
function textTexture(text: string): { tex: CanvasTexture; aspect: number } {
  const font = "600 44px -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif";
  const probe = document.createElement("canvas").getContext("2d");
  if (probe) probe.font = font;
  const w = Math.ceil((probe?.measureText(text).width ?? text.length * 24) + 24);
  const tex = canvasTex(w, 64, (g) => {
    g.font = font;
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.textBaseline = "middle";
    g.fillText(text, 12, 34);
  });
  return { tex, aspect: w / 64 };
}

// --- Procedural geometry -------------------------------------------------------------

/** Merge parts into one geometry. RoundedBoxGeometry is non-indexed while the other
 *  primitives are indexed, and mergeGeometries refuses a mix — so de-index first. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(flat);
  if (!out) throw new Error("hall3d: incompatible geometry parts");
  return out;
}

/** A vertical gradient column (alpha 1 at the base → 0 at the top) for beams. */
function beamGeometry(radius: number): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, 1, 14, 1, true);
  g.translate(0, 0.5, 0);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) colors.set([1, 1, 1, 1 - pos.getY(i)], i * 4);
  g.setAttribute("color", new BufferAttribute(colors, 4));
  return g;
}

/** The front LED panels of a rack: inset glass on the two faces the camera sees. */
function panelGeometry(): BufferGeometry {
  const a = new BoxGeometry(0.4, 0.72, 0.012);
  a.translate(0, 0.5, 0.336);
  const b = new BoxGeometry(0.012, 0.72, 0.4);
  b.translate(0.336, 0.5, 0);
  return merge([a, b]);
}

/** Blade-server LED bars on both visible faces — flat quads (2 tris each). */
function ledGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < LED_BARS; k++) {
    const y = 0.21 + (k * 0.58) / (LED_BARS - 1);
    const a = new PlaneGeometry(0.28, 0.026);
    a.translate(-0.02, y, 0.344);
    const b = new PlaneGeometry(0.28, 0.026);
    b.rotateY(Math.PI / 2);
    b.translate(0.344, y, 0.02);
    parts.push(a, b);
  }
  return merge(parts);
}

/** A desk: a light wooden top on two panel legs. Origin at floor, centred. */
function deskGeometry(): BufferGeometry {
  const top = new RoundedBoxGeometry(0.62, 0.04, 0.38, 1, 0.012);
  top.translate(0, 0.38, 0);
  const l = new BoxGeometry(0.03, 0.36, 0.32);
  l.translate(-0.28, 0.18, 0);
  const r = new BoxGeometry(0.03, 0.36, 0.32);
  r.translate(0.28, 0.18, 0);
  return merge([top, l, r]);
}

/** An office chair: seat, back (on the −Z side, behind a sitter facing +Z), post. */
function chairGeometry(): BufferGeometry {
  const seat = new RoundedBoxGeometry(0.25, 0.05, 0.24, 1, 0.02);
  seat.translate(0, 0.19, 0);
  const back = new RoundedBoxGeometry(0.25, 0.24, 0.045, 1, 0.02);
  back.translate(0, 0.33, -0.12);
  const post = new BoxGeometry(0.03, 0.16, 0.03);
  post.translate(0, 0.08, 0);
  return merge([seat, back, post]);
}

/** A monitor on a stand, screen facing +Z. Origin at the desk top. */
function monitorGeometry(): BufferGeometry {
  const screen = new BoxGeometry(0.3, 0.18, 0.022);
  screen.translate(0, 0.15, 0);
  const stand = new BoxGeometry(0.035, 0.07, 0.03);
  stand.translate(0, 0.035, -0.005);
  const foot = new BoxGeometry(0.12, 0.012, 0.08);
  foot.translate(0, 0.006, 0);
  return merge([screen, stand, foot]);
}

/** A pot (tapered) for plants; foliage is a 3-blob cluster. */
function potGeometry(): BufferGeometry {
  const g = new CylinderGeometry(0.1, 0.075, 0.2, 14);
  g.translate(0, 0.1, 0);
  return g;
}
function foliageGeometry(): BufferGeometry {
  const a = new SphereGeometry(0.15, 10, 8);
  a.translate(0, 0.36, 0);
  const b = new SphereGeometry(0.11, 10, 8);
  b.translate(0.08, 0.46, 0.03);
  const c = new SphereGeometry(0.1, 10, 8);
  c.translate(-0.07, 0.5, -0.03);
  return merge([a, b, c]);
}

/** A floor lamp: pole + base; the shade is separate (it glows). */
function lampPoleGeometry(): BufferGeometry {
  const base = new CylinderGeometry(0.09, 0.1, 0.03, 16);
  base.translate(0, 0.015, 0);
  const pole = new CylinderGeometry(0.012, 0.012, 0.86, 8);
  pole.translate(0, 0.45, 0);
  return merge([base, pole]);
}

/** A hyperboloid cooling tower (3.4 tall), lathed from its profile. */
function coolingTowerGeometry(): BufferGeometry {
  const pts: Vector2[] = [];
  for (let k = 0; k <= 12; k++) {
    const y = (k / 12) * 3.4;
    const r = 0.62 * Math.sqrt(1 + ((y - 2.3) / 1.25) ** 2) * 0.82;
    pts.push(new Vector2(r, y));
  }
  return new LatheGeometry(pts, 24);
}

/** A lattice transmission pylon: four tapered legs, three cross-arms, braces. */
function pylonGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const leg = new BoxGeometry(0.05, 3.6, 0.05);
    leg.rotateZ(-sx * 0.07);
    leg.rotateX(sz * 0.07);
    leg.translate(sx * 0.2, 1.8, sz * 0.2);
    parts.push(leg);
  }
  for (const [y, w] of [[2.6, 1.3], [3.1, 1.1], [3.42, 1.4]] as const) {
    const arm = new BoxGeometry(w, 0.05, 0.06);
    arm.translate(0, y, 0);
    parts.push(arm);
  }
  for (let k = 0; k < 4; k++) {
    const b = new BoxGeometry(0.03, 0.62, 0.03);
    b.rotateZ(k % 2 ? 0.75 : -0.75);
    b.translate(0, 0.5 + k * 0.62, 0.3 - k * 0.04);
    parts.push(b);
  }
  return merge(parts);
}

/** The "+" on an expansion plot (two flat bars). */
function plusGeometry(): BufferGeometry {
  return merge([new BoxGeometry(0.44, 0.02, 0.07), new BoxGeometry(0.07, 0.02, 0.44)]);
}

/** A beanbag: a squashed blob, origin on the floor. */
function beanbagGeometry(): BufferGeometry {
  const g = new SphereGeometry(0.21, 16, 10);
  g.scale(1, 0.58, 1);
  g.translate(0, 0.11, 0);
  return g;
}

/** A Rig Bay part's cooling fan: a ring and three blades, facing +Z. */
function rigFanGeometry(): BufferGeometry {
  const ring = new TorusGeometry(0.42, 0.07, 6, 20);
  const parts: BufferGeometry[] = [ring];
  for (let k = 0; k < 3; k++) {
    const b = new BoxGeometry(0.62, 0.14, 0.04);
    b.translate(0.22, 0, 0);
    b.rotateZ((k * Math.PI * 2) / 3);
    parts.push(b);
  }
  return merge(parts);
}

/** Accelerator heatsink: three glowing fins across a unit face. */
function finGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const y of [-0.28, 0, 0.28]) {
    const f = new BoxGeometry(0.82, 0.13, 1);
    f.translate(0, y, 0);
    parts.push(f);
  }
  return merge(parts);
}

// --- The scene ----------------------------------------------------------------------

export function createHallScene3D(canvas: HTMLCanvasElement): HallScene3D {
  // Ask for the context ourselves: WebGLRenderer logs a console error before throwing
  // when it can't get one, and "no WebGL" is an expected fallback, not an error.
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "default" });
  if (!gl) throw new NoWebGLError("WebGL2 unavailable");
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: true, alpha: false, powerPreference: "default" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Shadows are re-rendered only when the room changes (racks never move; people
  // carry contact shadows) — the single biggest GPU saving on a phone.
  renderer.shadowMap.autoUpdate = false;

  // iOS drops the GL context whenever the app is backgrounded. preventDefault lets
  // WebGLRenderer restore it on webglcontextrestored; the stage's watchdog falls back
  // to 2D only if it stays lost. After a restore the frozen shadow map is re-rendered.
  const onContextLost = (e: Event) => e.preventDefault();
  const onContextRestored = () => { renderer.shadowMap.needsUpdate = true; };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  const scene = new Scene();
  const bg = new Color();
  scene.background = bg;
  const fog = new Fog(bg, 40, 120);
  scene.fog = fog;

  // A low-FOV perspective camera (Ralv): reads as a diorama, but dollying into a
  // room has real depth. Elevation ~40°, a touch off 45° so the two walls differ.
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 500);
  const target = new Vector3();
  // Radians from vertical: ≈40° elevation in a landscape frame; a portrait screen
  // (explore on a phone) looks a little more top-down so the lab fills it.
  let POLAR = 0.87;
  const AZ = 0.74; // radians from +Z toward +X
  let azimuth = AZ;
  let fitDist = 30;
  let cssW = 1, cssH = 1;

  // --- Lights -------------------------------------------------------------------
  const hemi = new HemisphereLight(0xfff1e6, 0x2a1830, 1.1);
  scene.add(hemi);
  const sun = new DirectionalLight(0xffdcb4, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  // --- Shared resources (created once, disposed once) -----------------------------
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => { owned.push(x); return x; };

  const unitBox = own(new BoxGeometry(1, 1, 1));
  const unitPlane = own(new PlaneGeometry(1, 1));
  unitPlane.rotateX(-Math.PI / 2);
  const blobTex = own(blobTexture());
  const edgeTex = own(edgeTexture());
  const gridTex = own(gridTexture());
  gridTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  gridTex.repeat.set(100, 100);
  const shadowMat = own(new MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0xffffff }));
  const pickMat = own(new MeshBasicMaterial({ visible: false }));
  const coolingTowerGeo = own(coolingTowerGeometry());
  const pylonGeo = own(pylonGeometry());
  const plusGeo = own(plusGeometry());
  const beanbagGeo = own(beanbagGeometry());

  const inst = (geo: BufferGeometry, mat: Material, n: number, cast = false): InstancedMesh => {
    const m = new InstancedMesh(geo, mat, n);
    m.count = 0;
    m.frustumCulled = false; // instance bounds change every rebuild; the lab is always on screen
    m.castShadow = cast;
    m.receiveShadow = cast;
    scene.add(m);
    return m;
  };

  // Racks: chassis, glass panel, LED bars, TPU caps, contact shadows.
  const rackGeo = own(new RoundedBoxGeometry(0.66, 1, 0.66, 1, 0.05));
  rackGeo.translate(0, 0.5, 0);
  const rackBody = inst(rackGeo, own(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.12 })), MAX_RACKS, true);
  const rackPanel = inst(own(panelGeometry()), own(new MeshStandardMaterial({ color: 0x141926, roughness: 0.28, metalness: 0.5 })), MAX_RACKS);
  const rackLeds = inst(own(ledGeometry()), own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), MAX_RACKS);
  const capGeo = own(new CylinderGeometry(0.2, 0.26, 0.1, 18));
  capGeo.translate(0, 0.05, 0);
  const podCaps = inst(capGeo, own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), MAX_RACKS);
  const rackAO = inst(unitPlane, shadowMat, MAX_RACKS);
  rackAO.renderOrder = 1;

  // People: chibi rig — capsule body, big head, hair cap, arms and legs that swing.
  const bodyGeo = own(new CapsuleGeometry(0.092, 0.07, 4, 10));
  bodyGeo.translate(0, 0.247, 0);
  const headGeo = own(new SphereGeometry(0.122, 18, 12));
  const hairGeo = own(new SphereGeometry(0.13, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5));
  const legGeo = own(new CapsuleGeometry(0.034, 0.07, 3, 8));
  legGeo.translate(0, -0.069, 0);
  const armGeo = own(new CapsuleGeometry(0.027, 0.09, 3, 8));
  armGeo.translate(0, -0.072, 0);
  const personMat = own(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  const bodies = inst(bodyGeo, personMat, MAX_PEOPLE);
  const heads = inst(headGeo, personMat, MAX_PEOPLE);
  const hair = inst(hairGeo, personMat, MAX_PEOPLE);
  const legs = inst(legGeo, personMat, MAX_PEOPLE * 2);
  const arms = inst(armGeo, personMat, MAX_PEOPLE * 2);
  const blobs = inst(unitPlane, shadowMat, MAX_PEOPLE + 1);
  blobs.renderOrder = 1;
  const agentProxy = inst(unitBox, pickMat, MAX_PEOPLE);
  const headPos = new Float32Array(MAX_PEOPLE * 3);

  // Desks, chairs, monitors, screens, keyboards — one instanced draw each.
  const desks = inst(own(deskGeometry()), own(new MeshStandardMaterial({ color: col([222, 196, 156]), roughness: 0.75 })), MAX_PEOPLE, true);
  const chairs = inst(own(chairGeometry()), own(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })), MAX_PEOPLE);
  const monitors = inst(own(monitorGeometry()), own(new MeshStandardMaterial({ color: 0x1b1f2b, roughness: 0.35, metalness: 0.4 })), MAX_PEOPLE);
  const screenGeo = own(new PlaneGeometry(0.27, 0.15));
  const screens = inst(screenGeo, own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), MAX_PEOPLE);
  const keyboards = inst(unitBox, own(new MeshStandardMaterial({ color: 0xe8eaee, roughness: 0.5 })), MAX_PEOPLE);
  const deskAO = inst(unitPlane, shadowMat, MAX_PEOPLE);
  deskAO.renderOrder = 1;

  // Planter strips + their leaves, potted plants, floor lamps (+ warm night pools).
  const leafGeo = own(new SphereGeometry(0.075, 8, 6));
  const leaves = inst(leafGeo, own(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })), MAX_LEAVES);
  const pots = inst(own(potGeometry()), own(new MeshStandardMaterial({ color: col([236, 232, 224]), roughness: 0.6 })), 8, true);
  const foliage = inst(own(foliageGeometry()), own(new MeshStandardMaterial({ color: col([84, 146, 82]), roughness: 0.85 })), 8, true);
  const lampPoles = inst(own(lampPoleGeometry()), own(new MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.4, metalness: 0.5 })), 4);
  const shadeGeo = own(new CylinderGeometry(0.08, 0.13, 0.15, 18, 1, true));
  shadeGeo.translate(0, 0.94, 0);
  const shadeMat = own(new MeshBasicMaterial({ color: col([255, 226, 180]), side: DoubleSide, toneMapped: false }));
  const lampShades = inst(shadeGeo, shadeMat, 4);
  const poolMat = own(new MeshBasicMaterial({ map: blobTex, color: col([255, 196, 120]), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
  const lampPools = inst(unitPlane, poolMat, 4);
  lampPools.renderOrder = 2;
  const propAO = inst(unitPlane, shadowMat, 12);
  propAO.renderOrder = 1;

  // The inspector: dark suit + clipboard; an outsider in the room (with legs, too).
  const chen = new Group();
  const suitMat = own(new MeshStandardMaterial({ color: 0x3a4052, roughness: 0.5 }));
  const chenBody = new Mesh(bodyGeo, suitMat);
  const chenHead = new Mesh(headGeo, own(new MeshStandardMaterial({ color: col([224, 200, 180]), roughness: 0.6 })));
  chenHead.position.y = 0.49;
  const chenHair = new Mesh(hairGeo, own(new MeshStandardMaterial({ color: 0x23202a, roughness: 0.7 })));
  chenHair.position.y = 0.51;
  const chenLegs = [new Mesh(legGeo, suitMat), new Mesh(legGeo, suitMat)];
  chenLegs.forEach((l, k) => l.position.set(k ? 0.045 : -0.045, 0.145, 0));
  const clip = new Mesh(unitBox, own(new MeshStandardMaterial({ color: 0xeef1f6, roughness: 0.5 })));
  clip.scale.set(0.12, 0.16, 0.02);
  clip.position.set(0.12, 0.27, 0.1);
  const chenProxy = new Mesh(unitBox, pickMat);
  chenProxy.scale.set(0.46, 0.7, 0.46);
  chenProxy.position.y = 0.35;
  chen.add(chenBody, chenHead, chenHair, ...chenLegs, clip, chenProxy);
  chen.visible = false;
  scene.add(chen);

  // Beams (per product), their rising pulses, data motes, smoke, crates.
  const beamCore = own(beamGeometry(0.055));
  const beamGlow = own(beamGeometry(0.17));
  const pulses = inst(own(new SphereGeometry(0.05, 10, 8)), own(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false })), MAX_PULSES);
  const motePos = new Float32Array(MAX_MOTES * 3);
  const moteCol = new Float32Array(MAX_MOTES * 3);
  const moteGeo = own(new BufferGeometry());
  moteGeo.setAttribute("position", new BufferAttribute(motePos, 3));
  moteGeo.setAttribute("color", new BufferAttribute(moteCol, 3));
  const motes = new Points(moteGeo, own(new PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })));
  motes.frustumCulled = false;
  scene.add(motes);
  const smoke = inst(own(new SphereGeometry(0.12, 10, 8)), own(new MeshBasicMaterial({ color: 0x9aa3b5, transparent: true, opacity: 0.32, depthWrite: false })), MAX_SMOKE);
  const warns = inst(own(new SphereGeometry(0.06, 10, 8)), own(new MeshBasicMaterial({ color: 0xff3b30, toneMapped: false })), 8);
  const crates = inst(own(new RoundedBoxGeometry(0.34, 0.26, 0.3, 1, 0.03)), own(new MeshStandardMaterial({ color: 0x15161b, roughness: 0.8 })), 6, true);

  // Cooling units on the walls (one draw) and their spinning fans (one draw).
  const coolers = inst(own(new RoundedBoxGeometry(0.6, 0.62, 0.16, 1, 0.03)), own(new MeshStandardMaterial({ color: col([206, 211, 222]), roughness: 0.5, metalness: 0.2 })), 12, true);
  const fanGeo = own(merge([new BoxGeometry(0.34, 0.05, 0.02), new BoxGeometry(0.05, 0.34, 0.02)]));
  const fans = inst(fanGeo, own(new MeshStandardMaterial({ color: 0x5b6274, roughness: 0.4 })), 12);
  let fanSpots: { x: number; y: number; z: number; ry: number }[] = [];

  // Claim burst: a ring of light washing out across the floor.
  const ringMat = own(new MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  const ring = new Mesh(own(new RingGeometry(0.92, 1, 64)), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  // Cooling-tower steam (Frontier+) and the Singularity's spiral motes (era 5).
  const steam = inst(own(new SphereGeometry(0.3, 10, 8)), own(new MeshBasicMaterial({ color: 0xf2f4fa, transparent: true, opacity: 0.38, depthWrite: false })), 18);
  const orbits = inst(own(new SphereGeometry(0.045, 8, 6)), own(new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })), 28);

  // Rig Bay ("Bare Metal") on each rack's left face: a socket per slot — dark and
  // open when empty; fitted parts grow geometry by class (heatsink fins, a spinning
  // fan, a lit cable trunk to the floor) glowing in their grade's colour.
  const MAX_SLOTS = MAX_RACKS * 3;
  const bayPlates = inst(unitBox, own(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.3 })), MAX_SLOTS);
  const bayFins = inst(own(finGeometry()), own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), MAX_RACKS);
  const bayFans = inst(own(rigFanGeometry()), own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), MAX_RACKS);
  const cableGeo = own(new CylinderGeometry(0.018, 0.018, 1, 6));
  cableGeo.translate(0, 0.5, 0);
  const bayCables = inst(cableGeo, own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), MAX_RACKS);
  const bayPackets = inst(own(new SphereGeometry(0.035, 8, 6)), own(new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })), MAX_RACKS);
  let rigFanSpots: { x: number; y: number; z: number; s: number }[] = [];
  let rigCables: { x: number; y0: number; y1: number; z: number; c: RGB }[] = [];

  // Per-rebuild world (plinth, floors, walls, plots, beams, skyline, decor, lettering).
  let world = new Group();
  scene.add(world);
  let worldMats: Material[] = [];
  let worldGeos: BufferGeometry[] = [];
  let worldTex: Texture[] = [];
  const wmat = <T extends Material>(m: T): T => { worldMats.push(m); return m; };
  const wgeo = <T extends BufferGeometry>(g: T): T => { worldGeos.push(g); return g; };
  let beamCores: InstancedMesh | null = null;
  let beamGlows: InstancedMesh | null = null;
  let steamTops: { x: number; y: number; z: number; k: number }[] = [];
  let halo: Mesh | null = null;
  let plotMeshes: { id: string; fill: Mesh; mat: MeshBasicMaterial; edgeMat: LineDashedMaterial; plusMat: MeshBasicMaterial }[] = [];
  let windowMat: MeshBasicMaterial | null = null;
  let groundMat: MeshStandardMaterial | null = null;
  let skylineMat: MeshBasicMaterial | null = null;
  let letterMats: MeshBasicMaterial[] = [];

  let model: HallModel | null = null;
  let spec: Scene3DSpec | null = null;
  let worldSig = "";
  let fitSig = "";
  let explore = false;
  let controls: OrbitControls | null = null;
  let focusFrom: { t: Vector3; d: number; at: number } | null = null;
  let focusTo: { t: Vector3; d: number } | null = null;
  let lastRM = false;
  let lastSkin: string | undefined;
  let staticsDirty = true;

  const mA = new Matrix4();
  const mB = new Matrix4();
  const mC = new Matrix4();
  const floorPlane = new Plane(new Vector3(0, 1, 0), -FLOOR_Y);
  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const dummy = new Object3D();
  const c = new Color();

  const plane = (r: Rect, y: number, mat: Material, layer = 0): Mesh => {
    // Stacked floor layers (floor → rug → strip) get a polygon offset per layer, so
    // they never z-fight however far the camera pulls back.
    if (layer > 0) {
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -layer;
      mat.polygonOffsetUnits = -layer * 2;
    }
    const m = new Mesh(unitPlane, mat);
    m.scale.set(r.x1 - r.x0, 1, r.z1 - r.z0);
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    world.add(m);
    return m;
  };
  /** One instanced draw of unit boxes for a list of rects (world-owned). */
  const boxes = (rects: { r: Rect; y0: number; h: number; c?: RGB }[], mat: Material, cast = false): void => {
    if (rects.length === 0) return;
    const im = new InstancedMesh(unitBox, mat, rects.length);
    rects.forEach(({ r, y0, h, c: tint }, i) => {
      dummy.position.set((r.x0 + r.x1) / 2, y0 + h / 2, (r.z0 + r.z1) / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(r.x1 - r.x0, h, r.z1 - r.z0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      if (tint) im.setColorAt(i, setC(c, tint));
    });
    im.frustumCulled = false;
    im.castShadow = cast;
    im.receiveShadow = cast;
    world.add(im);
  };
  /** One instanced draw of coloured floor rects at height y (a rug layer). */
  const planes = (list: { r: Rect; c: RGB }[], y: number, mat: Material, layer: number): void => {
    if (list.length === 0) return;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -layer;
    mat.polygonOffsetUnits = -layer * 2;
    const im = new InstancedMesh(unitPlane, mat, list.length);
    list.forEach(({ r, c: tint }, i) => {
      dummy.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(r.x1 - r.x0, 1, r.z1 - r.z0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, setC(c, tint));
    });
    im.frustumCulled = false;
    im.receiveShadow = true;
    world.add(im);
  };
  /** A flat sign lying on the ground: `dir` "x" reads along +X, "z" along −Z. */
  const lettering = (text: string, x: number, z: number, h: number, dir: "x" | "z"): void => {
    const { tex, aspect } = textTexture(text);
    worldTex.push(tex);
    const mat = wmat(new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    letterMats.push(mat);
    const m = new Mesh(unitPlane, mat);
    m.scale.set(h * aspect, 1, h);
    if (dir === "z") m.rotation.y = Math.PI / 2;
    // Anchor the text's leading edge at (x, z).
    const half = (h * aspect) / 2;
    m.position.set(dir === "x" ? x + half : x, 0.012, dir === "x" ? z : z - half);
    world.add(m);
  };

  function disposeWorld(): void {
    scene.remove(world);
    for (const m of worldMats) m.dispose();
    for (const g of worldGeos) g.dispose();
    for (const t of worldTex) t.dispose();
    worldMats = [];
    worldGeos = [];
    worldTex = [];
    world = new Group();
    scene.add(world);
    beamCores = beamGlows = null;
    steamTops = [];
    halo = null;
    plotMeshes = [];
    letterMats = [];
    windowMat = null;
    skylineMat = null;
  }

  /** Rebuild the static room. Runs only when the room changes. Almost everything is
   *  collected into a few instanced batches (one matte, one glowing, one rug layer),
   *  so the room's architecture costs a handful of draw calls whatever the era. */
  function buildWorld(m: HallModel, s: Scene3DSpec): void {
    disposeWorld();
    const era = Math.max(0, Math.min(5, m.era));
    const ground = pick(ERA_GROUND, era);
    const floorC = pick(ERA_FLOOR, era);
    const bayRug = pick(ERA_BAY_RUG, era);
    const rugs = pick(ROOM_RUGS, era);
    const F = s.floor, B = s.bay;
    const H = s.wallH;
    const T = 0.14;
    const decor: Bx[] = []; // matte, per-instance colour, casts shadows
    const glow: Bx[] = []; // unlit, per-instance colour

    // Ground + a fading two-tier grid (fog does the fade).
    groundMat = wmat(new MeshStandardMaterial({ color: col(ground), roughness: 0.95 }));
    const g = new Mesh(unitPlane, groundMat);
    g.scale.set(400, 1, 400);
    g.receiveShadow = true;
    world.add(g);
    const grid = new Mesh(unitPlane, wmat(new MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false, color: col(shade(ground, 2.2)), opacity: 0.5 })));
    grid.scale.set(400, 1, 400);
    grid.position.y = 0.004;
    world.add(grid);

    // The plinth: a bevelled cream base the whole building stands on.
    const pw = F.x1 - F.x0 + 0.3, pd = B.z1 - F.z0 + 0.3;
    const plinth = new Mesh(wgeo(new RoundedBoxGeometry(pw, FLOOR_Y, pd, 2, 0.05)), wmat(new MeshStandardMaterial({ color: col(PLINTH), roughness: 0.9 })));
    plinth.position.set((F.x0 + F.x1) / 2 - 0.075, FLOOR_Y / 2, (F.z0 + B.z1) / 2 - 0.075);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    world.add(plinth);
    plane({ x0: F.x0 - 0.02, z0: F.z0, x1: F.x1, z1: B.z1 }, FLOOR_Y + 0.002, wmat(new MeshStandardMaterial({ color: col(floorC), roughness: 0.78 })));

    // Rugs (one instanced layer): a colour block per room — the Ralv signature — and
    // the era's colour under the desks.
    const rugList: { r: Rect; c: RGB }[] = s.rooms.map((r, i) => ({ r: { x0: r.x0 + 0.08, z0: r.z0 + 0.08, x1: r.x1 - 0.08, z1: r.z1 - 0.08 }, c: pick(rugs, i) }));
    rugList.push({ r: { x0: B.x0 + 0.3, z0: B.z0 + 0.62, x1: B.x1 - 0.3, z1: B.z1 - 0.62 }, c: bayRug });
    planes(rugList, FLOOR_Y + 0.006, wmat(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })), 1);

    // Floor tiles: from the Scale-Up the rack floor is a raised data-hall floor; after
    // the Singularity its seams glow.
    if (era >= 2) {
      const seam: number[] = [];
      const y = FLOOR_Y + 0.009;
      for (let x = F.x0 + 1; x < F.x1; x++) seam.push(x, y, F.z0, x, y, F.z1);
      for (let z = F.z0 + 1; z < F.z1; z++) seam.push(F.x0, y, z, F.x1, y, z);
      const seamGeo = wgeo(new BufferGeometry());
      seamGeo.setAttribute("position", new BufferAttribute(new Float32Array(seam), 3));
      const glowSeams = era >= 5;
      world.add(new LineSegments(seamGeo, wmat(new LineBasicMaterial({ color: col(glowSeams ? [200, 170, 255] : shade(floorC, 1.35)), transparent: true, opacity: glowSeams ? 0.7 : 0.28, toneMapped: !glowSeams }))));
    }

    // Aisles: lit strips + low glass rails.
    const glass: Bx[] = [];
    for (const a of s.aisles) {
      const vertical = a.x1 - a.x0 < a.z1 - a.z0;
      const cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
      glow.push({ r: vertical ? { x0: cx - 0.025, z0: a.z0 + 0.15, x1: cx + 0.025, z1: a.z1 - 0.15 } : { x0: a.x0 + 0.15, z0: cz - 0.025, x1: a.x1 - 0.15, z1: cz + 0.025 }, y0: FLOOR_Y, h: 0.012, c: mix(bayRug, [255, 255, 255], 0.45) });
      for (const e of vertical ? [a.x0 + 0.06, a.x1 - 0.06] : [a.z0 + 0.06, a.z1 - 0.06]) {
        const r: Rect = vertical ? { x0: e - 0.012, z0: a.z0 + 0.1, x1: e + 0.012, z1: a.z1 - 0.1 } : { x0: a.x0 + 0.1, z0: e - 0.012, x1: a.x1 - 0.1, z1: e + 0.012 };
        glass.push({ r, y0: FLOOR_Y, h: 0.42 });
        glow.push({ r, y0: FLOOR_Y + 0.42, h: 0.012, c: [235, 245, 255] });
      }
    }
    boxes(glass, wmat(new MeshStandardMaterial({ color: col([206, 228, 255]), transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0.1, depthWrite: false })));

    // Cutaway walls (back two only) with bevelled caps; AO where they meet the floor.
    decor.push({ r: { x0: F.x0 - T, z0: F.z0 - T, x1: F.x1, z1: F.z0 }, y0: FLOOR_Y, h: H, c: WALL });
    decor.push({ r: { x0: F.x0 - T, z0: F.z0, x1: F.x0, z1: B.z1 }, y0: FLOOR_Y, h: H, c: WALL });
    decor.push({ r: { x0: F.x0 - T - 0.02, z0: F.z0 - T - 0.02, x1: F.x1 + 0.02, z1: F.z0 + 0.02 }, y0: FLOOR_Y + H, h: 0.05, c: WALL_CAP });
    decor.push({ r: { x0: F.x0 - T - 0.02, z0: F.z0, x1: F.x0 + 0.02, z1: B.z1 + 0.02 }, y0: FLOOR_Y + H, h: 0.05, c: WALL_CAP });
    const edgeMat = wmat(new MeshBasicMaterial({ map: edgeTex, transparent: true, depthWrite: false, color: 0xffffff }));
    const eb = new Mesh(unitPlane, edgeMat);
    eb.scale.set(F.x1 - F.x0, 1, 0.55);
    eb.position.set((F.x0 + F.x1) / 2, FLOOR_Y + 0.012, F.z0 + 0.275);
    eb.renderOrder = 1;
    const el = new Mesh(unitPlane, edgeMat);
    el.scale.set(B.z1 - F.z0, 1, 0.55);
    el.rotation.y = Math.PI / 2;
    el.position.set(F.x0 + 0.275, FLOOR_Y + 0.012, (F.z0 + B.z1) / 2);
    el.renderOrder = 1;
    world.add(eb, el);

    // Clerestory windows (one instanced draw): pale by day, warm and lit at night.
    windowMat = wmat(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    const panes: Bx[] = [];
    for (let x = F.x0 + 0.6; x < F.x1 - 0.4; x += 1.4) panes.push({ r: { x0: x, z0: F.z0 + 0.001, x1: x + 0.9, z1: F.z0 + 0.02 }, y0: FLOOR_Y + H * 0.63, h: H * 0.22 });
    for (let z = F.z0 + 0.6; z < B.z1 - 0.4; z += 1.4) panes.push({ r: { x0: F.x0 + 0.001, z0: z, x1: F.x0 + 0.02, z1: z + 0.9 }, y0: FLOOR_Y + H * 0.63, h: H * 0.22 });
    boxes(panes, windowMat);

    // Wall over the bay: a pegboard of tools in the garage, a whiteboard with sticky
    // notes once the lab is funded.
    const boardZ = (B.z0 + B.z1) / 2;
    const wallX = (x: number, w: number): Rect => ({ x0: F.x0 + x, z0: 0, x1: F.x0 + x + w, z1: 0 });
    const onLeftWall = (z0: number, z1: number, x: number, w: number): Rect => ({ ...wallX(x, w), z0, z1 });
    if (era === 0) {
      decor.push({ r: onLeftWall(boardZ - 0.6, boardZ + 0.6, 0.001, 0.03), y0: FLOOR_Y + 0.7, h: 0.72, c: [190, 150, 106] });
      for (const [dz, dy, w, h] of [[-0.4, 0.2, 0.06, 0.32], [-0.36, 0.42, 0.18, 0.06], [-0.1, 0.18, 0.05, 0.36], [0.14, 0.3, 0.22, 0.05], [0.18, 0.15, 0.05, 0.2], [0.4, 0.22, 0.05, 0.38]] as const) {
        decor.push({ r: onLeftWall(boardZ + dz - w / 2, boardZ + dz + w / 2, 0.03, 0.035), y0: FLOOR_Y + 0.7 + dy, h, c: [74, 80, 94] });
      }
    } else {
      decor.push({ r: onLeftWall(boardZ - 0.58, boardZ + 0.58, 0.001, 0.025), y0: FLOOR_Y + 0.72, h: 0.03, c: WALL_CAP });
      decor.push({ r: onLeftWall(boardZ - 0.55, boardZ + 0.55, 0.001, 0.03), y0: FLOOR_Y + 0.75, h: 0.62, c: [250, 250, 252] });
      ([[-0.36, 0.38, [252, 226, 120]], [-0.2, 0.18, [255, 170, 200]], [0.02, 0.36, [150, 220, 255]], [0.28, 0.22, [252, 226, 120]]] as const).forEach(([dz, dy, cc]) => {
        decor.push({ r: onLeftWall(boardZ + dz - 0.06, boardZ + dz + 0.06, 0.03, 0.006), y0: FLOOR_Y + 0.75 + dy, h: 0.12, c: [cc[0], cc[1], cc[2]] });
      });
    }

    // The Garage Closet's own architecture: a roller door, a shelf of boxes.
    if (era === 0) {
      const dw = Math.min(2.2, (F.x1 - F.x0) * 0.42);
      const dx = F.x0 + (F.x1 - F.x0) * 0.64;
      decor.push({ r: { x0: dx - dw / 2, z0: F.z0, x1: dx + dw / 2, z1: F.z0 + 0.03 }, y0: FLOOR_Y, h: 1.55, c: [184, 188, 194] });
      for (let k = 0; k < 9; k++) decor.push({ r: { x0: dx - dw / 2 + 0.02, z0: F.z0 + 0.03, x1: dx + dw / 2 - 0.02, z1: F.z0 + 0.05 }, y0: FLOOR_Y + 0.1 + k * 0.165, h: 0.03, c: [152, 157, 166] });
      decor.push({ r: { x0: dx - dw / 2 - 0.06, z0: F.z0, x1: dx + dw / 2 + 0.06, z1: F.z0 + 0.12 }, y0: FLOOR_Y + 1.55, h: 0.18, c: [112, 118, 128] });
      const sx = F.x0 + 0.3, sw = Math.min(1.5, (F.x1 - F.x0) * 0.28);
      decor.push({ r: { x0: sx, z0: F.z0, x1: sx + sw, z1: F.z0 + 0.26 }, y0: FLOOR_Y + 1.32, h: 0.04, c: [150, 110, 72] });
      ([[0.05, 0.36, 0.26], [0.45, 0.3, 0.2], [0.8, 0.4, 0.3], [1.22, 0.24, 0.16]] as const).forEach(([ox, w, h]) => {
        if (ox + w <= sw) decor.push({ r: { x0: sx + ox, z0: F.z0 + 0.03, x1: sx + ox + w, z1: F.z0 + 0.24 }, y0: FLOOR_Y + 1.36, h, c: [198, 152, 100] });
      });
    }

    // The bay's front-right corner tells the lab's story: a mattress in the garage
    // (founded in a garage, rented hourly), beanbags at the funded startup.
    const cx0 = B.x1 - 0.62, cz0 = B.z1 - 0.34;
    if (era === 0) {
      decor.push({ r: { x0: cx0 - 0.5, z0: cz0 - 0.24, x1: cx0 + 0.5, z1: cz0 + 0.24 }, y0: FLOOR_Y, h: 0.12, c: [236, 230, 218] });
      decor.push({ r: { x0: cx0 + 0.24, z0: cz0 - 0.18, x1: cx0 + 0.46, z1: cz0 + 0.18 }, y0: FLOOR_Y + 0.12, h: 0.07, c: [250, 250, 252] });
      decor.push({ r: { x0: cx0 - 0.5, z0: cz0 - 0.25, x1: cx0 + 0.1, z1: cz0 + 0.25 }, y0: FLOOR_Y + 0.12, h: 0.03, c: [96, 124, 196] });
    } else if (era === 1) {
      const bags = new InstancedMesh(beanbagGeo, wmat(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })), 2);
      ([[cx0 - 0.2, cz0, [232, 120, 92]], [cx0 + 0.28, cz0 - 0.06, [98, 176, 160]]] as const).forEach(([x, z, cc], i) => {
        dummy.position.set(x, FLOOR_Y, z);
        dummy.rotation.set(0, i * 0.8, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bags.setMatrixAt(i, dummy.matrix);
        bags.setColorAt(i, setC(c, [cc[0], cc[1], cc[2]]));
      });
      bags.castShadow = true;
      world.add(bags);
    }

    // From the Scale-Up: cable ladder trays along the top of both walls.
    if (era >= 2) {
      const ty = FLOOR_Y + H - 0.34;
      const rail: RGB = [150, 156, 168];
      decor.push({ r: { x0: F.x0, z0: F.z0, x1: F.x1, z1: F.z0 + 0.03 }, y0: ty, h: 0.05, c: rail });
      decor.push({ r: { x0: F.x0, z0: F.z0 + 0.3, x1: F.x1, z1: F.z0 + 0.33 }, y0: ty, h: 0.05, c: rail });
      decor.push({ r: { x0: F.x0, z0: F.z0, x1: F.x0 + 0.03, z1: F.z1 }, y0: ty, h: 0.05, c: rail });
      decor.push({ r: { x0: F.x0 + 0.3, z0: F.z0, x1: F.x0 + 0.33, z1: F.z1 }, y0: ty, h: 0.05, c: rail });
      for (let x = F.x0 + 0.35; x < F.x1 - 0.1; x += 0.36) decor.push({ r: { x0: x, z0: F.z0, x1: x + 0.03, z1: F.z0 + 0.33 }, y0: ty, h: 0.02, c: rail });
      for (let z = F.z0 + 0.35; z < F.z1 - 0.1; z += 0.36) decor.push({ r: { x0: F.x0, z0: z, x1: F.x0 + 0.33, z1: z + 0.03 }, y0: ty, h: 0.02, c: rail });
      ([[70, 120, 220], [235, 190, 60], [210, 80, 80]] as const).forEach((cc, k) => {
        const o = 0.08 + k * 0.08;
        decor.push({ r: { x0: F.x0 + 0.33, z0: F.z0 + o, x1: F.x1, z1: F.z0 + o + 0.04 }, y0: ty + 0.02, h: 0.04, c: [cc[0], cc[1], cc[2]] });
        decor.push({ r: { x0: F.x0 + o, z0: F.z0 + 0.33, x1: F.x0 + o + 0.04, z1: F.z1 }, y0: ty + 0.02, h: 0.04, c: [cc[0], cc[1], cc[2]] });
      });
    }

    // The charter, hung on the back wall; the Legacy shelf on the left.
    if (m.charter) {
      const bx = F.x0 + (F.x1 - F.x0) * 0.3;
      decor.push({ r: { x0: bx - 0.42, z0: F.z0 + 0.001, x1: bx + 0.42, z1: F.z0 + 0.03 }, y0: FLOOR_Y + H * 0.2, h: H * 0.42, c: mix(bayRug, [40, 30, 60], 0.35) });
      decor.push({ r: { x0: bx - 0.46, z0: F.z0 + 0.001, x1: bx + 0.46, z1: F.z0 + 0.05 }, y0: FLOOR_Y + H * 0.62, h: 0.04, c: [200, 170, 90] });
    }
    if (m.wall.length > 0) {
      const z0 = F.z0 + 0.5, step = Math.min(0.62, (F.z1 - F.z0 - 1) / Math.max(1, m.wall.length));
      const sy = FLOOR_Y + H * 0.45;
      decor.push({ r: { x0: F.x0, z0: z0 - 0.25, x1: F.x0 + 0.2, z1: z0 + step * m.wall.length - 0.05 }, y0: sy, h: 0.04, c: WALL_CAP });
      // A gold trophy per shipped generation, its core sized by the Legacy it banked
      // (the shape of a career, not eight identical prizes).
      m.wall.forEach((w, i) => {
        const tz = z0 + i * step;
        const k = 0.04 * Math.max(0.6, Math.min(1.4, (w.mag ?? 3) / 4));
        decor.push({ r: { x0: F.x0 + 0.05, z0: tz - 0.05, x1: F.x0 + 0.15, z1: tz + 0.05 }, y0: sy + 0.04, h: 0.1, c: [214, 178, 92] });
        glow.push({ r: { x0: F.x0 + 0.1 - k, z0: tz - k, x1: F.x0 + 0.1 + k, z1: tz + k }, y0: sy + 0.16, h: k * 2, c: w.asc ? [215, 170, 255] : pick(BEAM, w.era) });
      });
    }

    // Planter strips between paired desks.
    for (const p of s.planters) decor.push({ r: p, y0: FLOOR_Y + 0.38, h: 0.12, c: [196, 160, 118] });

    // Cooling units on both walls; their fans spin (frame()).
    fanSpots = [];
    let cu = 0;
    for (let k = 0; k < m.coolingUnits && cu < 12; k++) {
      const u = (k + 1) / (m.coolingUnits + 1);
      const x = F.x0 + u * (F.x1 - F.x0);
      const z = F.z0 + u * (F.z1 - F.z0);
      for (const [px, pz, ry] of [[x, F.z0 + 0.09, 0], [F.x0 + 0.09, z, Math.PI / 2]] as const) {
        dummy.position.set(px, FLOOR_Y + 0.85, pz);
        dummy.rotation.set(0, ry, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        coolers.setMatrixAt(cu, dummy.matrix);
        fanSpots.push({ x: ry ? px + 0.085 : px, y: FLOOR_Y + 0.85, z: ry ? pz : pz + 0.085, ry });
        cu++;
      }
    }
    coolers.count = cu;
    coolers.instanceMatrix.needsUpdate = true;

    // Campus growth beyond the walls (tall enough to read over them).
    steamTops = [];
    if (era >= 3) {
      // Cooling towers behind the back-right corner, steaming (frame()).
      const spots: [number, number, number][] = [[F.x1 - 1.1, F.z0 - 2.8, 1]];
      if (era >= 4) spots.push([F.x1 + 1.5, F.z0 - 1.6, 0.85]);
      const towersIM = new InstancedMesh(coolingTowerGeo, wmat(new MeshStandardMaterial({ color: col([206, 200, 192]), roughness: 0.85 })), spots.length);
      spots.forEach(([x, z, k], i) => {
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(k);
        dummy.updateMatrix();
        towersIM.setMatrixAt(i, dummy.matrix);
        steamTops.push({ x, y: 3.4 * k, z, k });
      });
      towersIM.castShadow = true;
      world.add(towersIM);
    }
    if (era >= 4) {
      // Transmission pylons marching to the horizon behind the left wall, wired in.
      const pz = [F.z1 - 0.5, F.z0 - 3, F.z0 - 8.5, F.z0 - 14];
      const px = F.x0 - 2.2;
      const pylons = new InstancedMesh(pylonGeo, wmat(new MeshStandardMaterial({ color: col([150, 156, 170]), roughness: 0.5, metalness: 0.4 })), pz.length);
      const wire: number[] = [];
      pz.forEach((z, i) => {
        dummy.position.set(px, 0, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pylons.setMatrixAt(i, dummy.matrix);
        const next = pz[i + 1];
        if (next !== undefined) for (const ax of [-0.62, 0.62]) wire.push(px + ax, 3.42, z, px + ax, 3.42, next);
      });
      for (const ax of [-0.62, 0.62]) wire.push(px + ax, 3.42, pz[0]!, F.x0 - T, FLOOR_Y + H, F.z1 - 0.4);
      const wireGeo = wgeo(new BufferGeometry());
      wireGeo.setAttribute("position", new BufferAttribute(new Float32Array(wire), 3));
      world.add(pylons, new LineSegments(wireGeo, wmat(new LineBasicMaterial({ color: col([40, 44, 56]) }))));
    }
    halo = null;
    if (era >= 5) {
      // The Singularity: an iridescent ring hanging over the lab, motes spiralling up
      // through it (the 2D hall's vortex, in the round). Animated in frame().
      const span = Math.min(F.x1 - F.x0, F.z1 - F.z0);
      const ring = new Mesh(wgeo(new TorusGeometry(Math.max(1.2, span * 0.3), 0.05, 10, 120)), wmat(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
      ring.position.set((F.x0 + F.x1) / 2, FLOOR_Y + H + 1.7, (F.z0 + F.z1) / 2);
      ring.rotation.x = Math.PI / 2;
      world.add(ring);
      halo = ring;
    }

    // The horizon race: rival datacenters, far off and hazy, yours among them.
    const towers: Bx[] = [];
    m.skyline.forEach((tw, i) => {
      const n = m.skyline.length;
      const x = F.x0 - 6 + ((i + 0.5) / n) * (F.x1 - F.x0 + 14);
      const z = F.z0 - 12 - (i % 3) * 3;
      const h = 2 + tw.h * 6;
      const r: Rect = { x0: x - 1, z0: z - 1, x1: x + 1, z1: z + 1 };
      towers.push({ r, y0: 0, h, c: tw.you ? mix(ground, [150, 120, 240], 0.3) : mix(ground, [150, 160, 195], tw.dim ? 0.06 : 0.13) });
      glow.push({ r: { x0: r.x0 - 0.02, z0: r.z0 - 0.02, x1: r.x1 + 0.02, z1: r.z1 + 0.02 }, y0: h - 0.25, h: 0.14, c: tw.you ? [205, 175, 255] : tw.dim ? [80, 80, 100] : [160, 190, 235] });
    });
    skylineMat = wmat(new MeshBasicMaterial({ color: 0xffffff }));
    boxes(towers, skylineMat);

    // Product beams: three instanced draws however many products (frame() sizes them).
    const nb = s.beams.length;
    if (nb > 0) {
      const add = { transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false } as const;
      beamCores = new InstancedMesh(beamCore, wmat(new MeshBasicMaterial({ color: 0xffffff, vertexColors: true, ...add })), nb);
      beamGlows = new InstancedMesh(beamGlow, wmat(new MeshBasicMaterial({ color: 0xffffff, vertexColors: true, ...add })), nb);
      const nodes = new InstancedMesh(unitPlane, wmat(new MeshBasicMaterial({ map: blobTex, color: 0xffffff, ...add })), nb);
      s.beams.forEach((b, i) => {
        dummy.position.set(b.x, FLOOR_Y + 0.014, b.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.7, 1, 0.7);
        dummy.updateMatrix();
        nodes.setMatrixAt(i, dummy.matrix);
        nodes.setColorAt(i, setC(c, pick(BEAM, i)));
      });
      for (const im of [beamCores, beamGlows, nodes]) {
        im.frustumCulled = false;
        world.add(im);
      }
    } else {
      beamCores = beamGlows = null;
    }

    // Expansion plots: a ghost lot past the open edge, "+" in the middle.
    for (const p of s.plots) {
      const accent: RGB = p.affordable ? [80, 220, 150] : [150, 162, 184];
      const mat = wmat(new MeshBasicMaterial({ color: col(accent), transparent: true, opacity: 0.14, depthWrite: false }));
      const fill = plane(p.rect, 0.02, mat);
      const r = p.rect;
      const edgeGeo = wgeo(new BufferGeometry().setFromPoints([new Vector3(r.x0, 0.03, r.z0), new Vector3(r.x1, 0.03, r.z0), new Vector3(r.x1, 0.03, r.z1), new Vector3(r.x0, 0.03, r.z1)]));
      const edgeMat = wmat(new LineDashedMaterial({ color: col(accent), dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.8 }));
      const edge = new LineLoop(edgeGeo, edgeMat);
      edge.computeLineDistances();
      world.add(edge);
      const plusMat = wmat(new MeshBasicMaterial({ color: col(accent), transparent: true, opacity: 0.9, toneMapped: false }));
      const plus = new Mesh(plusGeo, plusMat);
      plus.position.set((r.x0 + r.x1) / 2, 0.04, (r.z0 + r.z1) / 2);
      world.add(plus);
      fill.userData.plot = p.id;
      plotMeshes.push({ id: p.id, fill, mat, edgeMat, plusMat });
    }

    // Floor lettering (explore overview only): the wing, and the ops bay.
    const outZ = Math.max(B.z1, ...s.plots.filter((p) => p.dir === "s").map((p) => p.rect.z1)) + 0.25;
    const outX = Math.max(F.x1, ...s.plots.filter((p) => p.dir === "e").map((p) => p.rect.x1)) + 0.25;
    lettering(`${WING_NAME(m.wing)} · ${m.total} ${m.total === 1 ? "RACK" : "RACKS"}`, F.x0, outZ + 0.45, 0.7, "x");
    lettering(`OPS · ${m.staff} STAFF`, outX + 0.45, B.z1, 0.7, "z");

    // The two batches.
    boxes(decor, wmat(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 })), true);
    boxes(glow, wmat(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));

    // Sun + shadow frustum fitted to the building.
    const cx = (s.bounds.x0 + s.bounds.x1) / 2, cz = (s.bounds.z0 + s.bounds.z1) / 2;
    const span = Math.max(s.bounds.x1 - s.bounds.x0, s.bounds.z1 - s.bounds.z0) * 0.8 + 2.5;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx - 9, 15, cz + 8);
    const sc = sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
    sc.near = 1; sc.far = 60;
    sc.updateProjectionMatrix();
  }

  /** Static furniture + rack transforms for the current spec (people move per frame). */
  function placeStatics(m: HallModel, s: Scene3DSpec, spawnFrom: number, spawnT: number): void {
    const grow = easeOut(spawnT);
    rackBody.count = rackPanel.count = rackLeds.count = rackAO.count = s.racks.length;
    let caps = 0;
    s.racks.forEach((r, i) => {
      const k = i >= spawnFrom && spawnT < 1 ? Math.max(0.001, grow) : 1;
      const foot = TIER_FOOT[r.tier] ?? 1;
      dummy.position.set(r.x, FLOOR_Y, r.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(foot, r.h * k, foot);
      dummy.updateMatrix();
      rackBody.setMatrixAt(i, dummy.matrix);
      rackPanel.setMatrixAt(i, dummy.matrix);
      rackLeds.setMatrixAt(i, dummy.matrix);
      dummy.position.set(r.x + 0.04, FLOOR_Y + 0.012, r.z + 0.04);
      dummy.scale.set(foot * 1.25 * k, 1, foot * 1.25 * k);
      dummy.updateMatrix();
      rackAO.setMatrixAt(i, dummy.matrix);
      if (r.tier === 2) {
        dummy.position.set(r.x, FLOOR_Y + r.h * k, r.z);
        dummy.scale.set(foot, Math.max(0.001, k), foot);
        dummy.updateMatrix();
        podCaps.setMatrixAt(caps, dummy.matrix);
        podCaps.setColorAt(caps, setC(c, pick(TIER_LED, 2)));
        caps++;
      }
    });
    podCaps.count = caps;
    for (const im of [rackBody, rackPanel, rackLeds, rackAO, podCaps]) im.instanceMatrix.needsUpdate = true;
    if (podCaps.instanceColor) podCaps.instanceColor.needsUpdate = true;
    rackBody.computeBoundingSphere();

    // Rig Bay sockets on each rack's left (+Z) face, top slot first (as in 2D).
    let np = 0, nf = 0, nfan = 0, nc = 0;
    rigFanSpots = [];
    rigCables = [];
    if (m.rigs) {
      s.racks.forEach((r, i) => {
        const slots = m.rigs?.[r.tier];
        if (!slots || slots.length === 0) return;
        const foot = TIER_FOOT[r.tier] ?? 1;
        const k = i >= spawnFrom && spawnT < 1 ? Math.max(0.001, grow) : 1;
        const h = r.h * k;
        const face = r.z + 0.33 * foot + 0.02;
        const tierShade = shade(skinTint(pick(TIER, r.tier), lastSkin), 0.42);
        slots.forEach((slot, j) => {
          const v = 0.7 - j * 0.26;
          const y = FLOOR_Y + h * v;
          const w = 0.42 * foot, ph = Math.min(0.17 * h, 0.16);
          dummy.rotation.set(0, 0, 0);
          dummy.position.set(r.x, y, face);
          dummy.scale.set(w, ph, 0.035);
          dummy.updateMatrix();
          bayPlates.setMatrixAt(np, dummy.matrix);
          bayPlates.setColorAt(np, setC(c, slot.grade === 0 ? [10, 12, 18] : tierShade));
          np++;
          if (slot.grade === 0) return;
          const gc = pick(GRADE_GLOW, slot.grade);
          if (slot.cls === "accelerator") {
            dummy.position.set(r.x, y, face + 0.02);
            dummy.scale.set(w, ph, 0.012);
            dummy.updateMatrix();
            bayFins.setMatrixAt(nf, dummy.matrix);
            bayFins.setColorAt(nf, setC(c, gc));
            nf++;
          } else if (slot.cls === "cooling") {
            rigFanSpots.push({ x: r.x, y, z: face + 0.022, s: ph * 0.9 });
            bayFans.setColorAt(nfan, setC(c, gc));
            nfan++;
          } else {
            const z = face + 0.05;
            dummy.position.set(r.x + w * 0.3, FLOOR_Y, z);
            dummy.scale.set(1, Math.max(0.01, y - ph / 2 - FLOOR_Y), 1);
            dummy.updateMatrix();
            bayCables.setMatrixAt(nc, dummy.matrix);
            bayCables.setColorAt(nc, setC(c, gc, 0.55));
            rigCables.push({ x: r.x + w * 0.3, y0: FLOOR_Y, y1: y - ph / 2, z, c: gc });
            nc++;
          }
        });
      });
    }
    bayPlates.count = np;
    bayFins.count = nf;
    bayFans.count = nfan;
    bayCables.count = nc;
    for (const im of [bayPlates, bayFins, bayCables]) im.instanceMatrix.needsUpdate = true;
    for (const im of [bayPlates, bayFins, bayFans, bayCables]) if (im.instanceColor) im.instanceColor.needsUpdate = true;

    // Desks + chairs + monitors + screens + keyboards. side +1: sitter on the front
    // (camera) side facing −Z; side −1: sitter on the back side facing +Z.
    const n = s.desks.length;
    desks.count = chairs.count = monitors.count = screens.count = keyboards.count = deskAO.count = n;
    s.desks.forEach((d, i) => {
      const facing = d.side === 1 ? Math.PI : 0; // sitter's rotY
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(d.x, FLOOR_Y, d.z);
      dummy.updateMatrix();
      desks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(d.x, FLOOR_Y + 0.012, d.z);
      dummy.scale.set(0.95, 1, 0.75);
      dummy.updateMatrix();
      deskAO.setMatrixAt(i, dummy.matrix);
      // Chair under the sitter; its back on the far side of them from the desk.
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, facing, 0);
      dummy.position.set(d.x, FLOOR_Y, d.z + d.side * 0.34);
      dummy.updateMatrix();
      chairs.setMatrixAt(i, dummy.matrix);
      chairs.setColorAt(i, setC(c, pick(CHAIR, d.agent * 3 + 1)));
      // Monitor at the planter edge of the desk, screen toward the sitter.
      dummy.rotation.set(0, d.side === 1 ? 0 : Math.PI, 0);
      dummy.position.set(d.x, FLOOR_Y + 0.4, d.z - d.side * 0.09);
      dummy.updateMatrix();
      monitors.setMatrixAt(i, dummy.matrix);
      dummy.position.set(d.x, FLOOR_Y + 0.4 + 0.15, d.z - d.side * 0.09 + d.side * 0.0125);
      dummy.updateMatrix();
      screens.setMatrixAt(i, dummy.matrix);
      const a = m.agents[d.agent];
      screens.setColorAt(i, setC(c, a?.team === "product" ? [120, 230, 170] : [130, 190, 255]));
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(d.x, FLOOR_Y + 0.405, d.z + d.side * 0.08);
      dummy.scale.set(0.22, 0.012, 0.07);
      dummy.updateMatrix();
      keyboards.setMatrixAt(i, dummy.matrix);
    });
    for (const im of [desks, chairs, monitors, screens, keyboards, deskAO]) im.instanceMatrix.needsUpdate = true;
    for (const im of [screens, chairs]) if (im.instanceColor) im.instanceColor.needsUpdate = true;

    // Leaves along the planter strips.
    let ln = 0;
    for (const p of s.planters) {
      for (let x = p.x0 + 0.08; x <= p.x1 - 0.06 && ln < MAX_LEAVES; x += 0.13) {
        const j = hash01(ln + 7);
        dummy.position.set(x + (j - 0.5) * 0.04, FLOOR_Y + 0.52 + j * 0.05, (p.z0 + p.z1) / 2 + (hash01(ln + 3) - 0.5) * 0.05);
        dummy.rotation.set(0, j * 3, 0);
        dummy.scale.set(1 + j * 0.4, 0.8 + hash01(ln + 11) * 0.6, 1 + j * 0.3);
        dummy.updateMatrix();
        leaves.setMatrixAt(ln, dummy.matrix);
        leaves.setColorAt(ln, setC(c, pick(LEAF, Math.floor(j * 8))));
        ln++;
      }
    }
    leaves.count = ln;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;

    // Potted plants, floor lamps, and their contact shadows. In the Garage and the
    // Startup the front-right corner holds the mattress / beanbags instead.
    let ao = 0;
    const plants = m.era <= 1 ? s.plants.filter((_, i) => i !== 2) : s.plants;
    pots.count = foliage.count = plants.length;
    plants.forEach((p, i) => {
      dummy.position.set(p.x, FLOOR_Y, p.z);
      dummy.rotation.set(0, i * 1.7, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      pots.setMatrixAt(i, dummy.matrix);
      foliage.setMatrixAt(i, dummy.matrix);
      dummy.position.y = FLOOR_Y + 0.012;
      dummy.scale.set(0.5 * p.s, 1, 0.5 * p.s);
      dummy.updateMatrix();
      propAO.setMatrixAt(ao++, dummy.matrix);
    });
    lampPoles.count = lampShades.count = lampPools.count = s.lamps.length;
    s.lamps.forEach((p, i) => {
      dummy.position.set(p.x, FLOOR_Y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      lampPoles.setMatrixAt(i, dummy.matrix);
      lampShades.setMatrixAt(i, dummy.matrix);
      dummy.position.y = FLOOR_Y + 0.014;
      dummy.scale.set(2.6, 1, 2.6);
      dummy.updateMatrix();
      lampPools.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(0.35, 1, 0.35);
      dummy.updateMatrix();
      propAO.setMatrixAt(ao++, dummy.matrix);
    });
    propAO.count = ao;
    for (const im of [pots, foliage, lampPoles, lampShades, lampPools, propAO]) im.instanceMatrix.needsUpdate = true;
  }

  function rackColors(m: HallModel, skin?: string): void {
    m.racks.forEach((r, i) => {
      const base = skinTint(pick(TIER, r.tier), skin);
      rackBody.setColorAt(i, setC(c, mix(base, [235, 238, 245], 0.12)));
    });
    if (rackBody.instanceColor) rackBody.instanceColor.needsUpdate = true;
  }

  /** Identity colours for the people: team shirt (gold for a 10× hire), skin, hair. */
  function peopleColors(m: HallModel): void {
    m.agents.slice(0, MAX_PEOPLE).forEach((a, i) => {
      const shirt: RGB = a.tenx ? [245, 196, 60] : a.team === "product" ? [70, 196, 132] : [80, 140, 236];
      bodies.setColorAt(i, setC(c, shirt));
      heads.setColorAt(i, setC(c, pick(SKIN, i * 7 + 3)));
      hair.setColorAt(i, setC(c, pick(HAIR, i * 5 + 1)));
      arms.setColorAt(i * 2, setC(c, shirt));
      arms.setColorAt(i * 2 + 1, setC(c, shirt));
      legs.setColorAt(i * 2, setC(c, [52, 58, 78]));
      legs.setColorAt(i * 2 + 1, setC(c, [52, 58, 78]));
    });
    for (const im of [bodies, heads, hair, arms, legs]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  /** Pose one chibi: root matrix, then limbs swung about their hip / shoulder pivots. */
  function posePerson(i: number, p: AgentPose, rm: boolean): void {
    const rootY = FLOOR_Y + p.lift + (p.seated ? 0.06 : 0);
    mA.makeRotationY(p.rotY).setPosition(p.x, rootY, p.z);
    bodies.setMatrixAt(i, mA);
    mB.makeTranslation(0, 0.49, 0);
    mC.multiplyMatrices(mA, mB);
    heads.setMatrixAt(i, mC);
    tmp.setFromMatrixPosition(mC);
    headPos[i * 3] = tmp.x; headPos[i * 3 + 1] = tmp.y + 0.17; headPos[i * 3 + 2] = tmp.z;
    mB.makeRotationX(-0.28).setPosition(0, 0.51, -0.01);
    mC.multiplyMatrices(mA, mB);
    hair.setMatrixAt(i, mC);
    // Legs: forward under the desk when seated; a swing when walking.
    const swing = rm ? 0 : Math.sin(p.gait) * 0.55;
    for (let k = 0; k < 2; k++) {
      const sgn = k === 0 ? 1 : -1;
      const ang = p.seated ? -1.45 : swing * sgn;
      mB.makeRotationX(ang).setPosition(sgn * 0.045, 0.145, 0);
      mC.multiplyMatrices(mA, mB);
      legs.setMatrixAt(i * 2 + k, mC);
      // Arms: reaching for the keyboard and typing when seated; counter-swing walking.
      const type = rm ? 0 : Math.sin(p.gait * (k === 0 ? 1 : 1.13) + k) * 0.12;
      const armAng = p.seated ? -1.05 + type : -swing * sgn * 0.8;
      mB.makeRotationX(armAng).setPosition(sgn * 0.113, 0.33, 0);
      mC.multiplyMatrices(mA, mB);
      arms.setMatrixAt(i * 2 + k, mC);
    }
    mB.makeScale(0.5, 0.72, 0.5).setPosition(0, 0.34, 0);
    mC.multiplyMatrices(mA, mB);
    agentProxy.setMatrixAt(i, mC);
  }

  function fitCamera(): void {
    if (!spec) return;
    const b = spec.bounds;
    const aspect = cssW / Math.max(1, cssH);
    POLAR = aspect < 0.8 ? 0.66 : 0.87;
    camera.aspect = aspect;
    camera.fov = FOV;
    camera.updateProjectionMatrix();
    const dir = tmp2.set(Math.sin(POLAR) * Math.sin(azimuth), Math.cos(POLAR), Math.sin(POLAR) * Math.cos(azimuth)).normalize();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
    const up = new Vector3().crossVectors(dir, right).normalize();
    const tanV = Math.tan((FOV * Math.PI) / 360);
    const tanH = tanV * aspect;
    const corners: Vector3[] = [];
    for (const x of [b.x0 - 0.2, b.x1 + 0.1]) for (const z of [b.z0 - 0.2, b.z1 + 0.1]) for (const y of [0, FLOOR_Y + spec.wallH + 0.1]) corners.push(new Vector3(x, y, z));
    target.set((b.x0 + b.x1) / 2, FLOOR_Y + 0.4, (b.z0 + b.z1) / 2);
    // Solve the distance that fits every corner, then re-centre on the projected
    // extents and solve again (perspective framing isn't symmetric around a corner).
    let D = 20;
    for (let pass = 0; pass < 3; pass++) {
      D = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of corners) {
        const v = tmp.copy(p).sub(target);
        const x = v.dot(right), y = v.dot(up), depth = v.dot(dir);
        D = Math.max(D, Math.abs(x) / tanH + depth, Math.abs(y) / tanV + depth);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      target.addScaledVector(right, (minX + maxX) / 2 * 0.5).addScaledVector(up, (minY + maxY) / 2 * 0.5);
    }
    fitDist = D * 1.04;
    camera.near = Math.max(0.3, fitDist * 0.04);
    camera.far = fitDist * 8 + 60;
    camera.updateProjectionMatrix();
    camera.position.copy(target).addScaledVector(dir, fitDist);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    fog.near = fitDist + span * 0.5;
    fog.far = fitDist + span * 2.6 + 25;
  }

  function attachControls(): void {
    if (controls) return;
    const oc = new OrbitControls(camera, canvas);
    oc.target.copy(target);
    oc.enableDamping = !lastRM;
    oc.dampingFactor = 0.09;
    oc.minDistance = fitDist * 0.2;
    oc.maxDistance = fitDist * 1.35;
    oc.minPolarAngle = 0.42;
    oc.maxPolarAngle = 1.2;
    oc.minAzimuthAngle = 0.12;
    oc.maxAzimuthAngle = Math.PI / 2 - 0.12;
    oc.screenSpacePanning = false;
    oc.zoomToCursor = true;
    oc.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
    oc.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    oc.update();
    controls = oc;
  }
  function detachControls(): void {
    if (!controls) return;
    controls.dispose();
    controls = null;
    canvas.style.touchAction = "";
    azimuth = AZ;
    fitCamera();
  }

  const project = (v: Vector3): { x: number; y: number } | null => {
    v.project(camera);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return null;
    return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
  };

  const api: HallScene3D = {
    setModel(next) {
      model = next;
      spec = buildScene3D(next);
      const sig = `${next.cols}|${next.rows}|${next.era}|${next.splitGx}|${next.splitGy}|${next.coolingUnits}|${spec.plots.map((p) => p.id).join(",")}|${next.beams.length}|${spec.planters.map((p) => `${p.x0.toFixed(2)}:${p.x1.toFixed(2)}`).join(",")}|${next.skyline.map((t) => `${Math.round(t.h * 20)}${t.dim ? "d" : ""}${t.you ? "y" : ""}`).join(".")}|${next.charter?.id ?? ""}|${next.wall.length}|${next.wing}|${next.total}|${next.staff}`;
      if (sig !== worldSig) {
        worldSig = sig;
        buildWorld(next, spec);
      }
      const b = spec.bounds;
      const fit = `${b.x0},${b.z0},${b.x1},${b.z1},${spec.wallH}`;
      if (fit !== fitSig) {
        fitSig = fit;
        if (!explore) fitCamera();
      }
      rackColors(next, lastSkin);
      peopleColors(next);
      staticsDirty = true;
      renderer.shadowMap.needsUpdate = true;
    },

    frame(f) {
      if (!model || !spec) return;
      const m = model;
      const s = spec;
      const t = f.timeMs;
      const rm = f.reducedMotion;
      if (rm !== lastRM) {
        lastRM = rm;
        if (controls) controls.enableDamping = !rm;
      }
      if (f.rackSkin !== lastSkin) {
        lastSkin = f.rackSkin;
        rackColors(m, lastSkin);
        staticsDirty = true; // Rig Bay plates take the skinned tier colour too
      }
      const spawning = f.spawnT < 1;
      if (staticsDirty || spawning) {
        placeStatics(m, s, f.spawnFrom, f.spawnT);
        staticsDirty = false;
        renderer.shadowMap.needsUpdate = true;
      }

      // Day / night: the sun sinks into a cool moon; windows, lamps and LEDs take over.
      const nf = nightFactor(f.phase);
      const era = Math.max(0, Math.min(5, m.era));
      const ground = pick(ERA_GROUND, era);
      setC(bg, mix(shade(ground, 1.05), shade(ground, 0.5), nf));
      fog.color.copy(bg);
      if (groundMat) setC(groundMat.color, mix(ground, shade(ground, 0.55), nf));
      hemi.intensity = 1.1 - 0.72 * nf;
      setC(hemi.color, mix([255, 241, 230], [120, 140, 220], nf));
      sun.intensity = 2.7 - 2.35 * nf;
      setC(sun.color, mix([255, 220, 180], [150, 170, 255], nf));
      // Faction alignment: a faint warm (accel) or cool (doomer) cast on the fill light.
      if (Math.abs(m.alignment) > 0.02) hemi.color.lerp(setC(c, m.alignment < 0 ? [60, 120, 240] : [255, 150, 60]), Math.min(0.18, Math.abs(m.alignment) * 0.18));
      if (windowMat) setC(windowMat.color, mix([170, 190, 215], [255, 214, 150], nf));
      // Rival towers sink into the night; only their crown lights stay on.
      if (skylineMat) setC(skylineMat.color, mix([255, 255, 255], [70, 70, 92], nf));
      poolMat.opacity = 0.12 + 0.55 * nf;
      setC(shadeMat.color, mix([238, 226, 206], [255, 214, 150], nf), 1 + 0.6 * nf);
      // Floor lettering: the overview's labels, faded out as the player pinches in.
      const z = api.zoom();
      const letterA = explore ? Math.max(0, Math.min(1, (1.55 - z) / 0.35)) * 0.85 : 0;
      for (const lm of letterMats) lm.opacity = letterA;

      // Rack LEDs: tier glow, breathing while busy, a training wave while a run is
      // active, a hot cast under overclock / thermal load, tap flash, claim burst.
      const busy = m.busy && !rm ? 0.5 + 0.5 * Math.sin(t / 700) : 0.5;
      const hot = Math.min(1, m.overclock * 0.6 + Math.max(0, m.loadFrac - 0.85) * 2);
      for (let i = 0; i < s.racks.length; i++) {
        const r = s.racks[i]!;
        let led = mix(pick(TIER_LED, r.tier), [255, 150, 80], hot * 0.55);
        const wave = trainingWave(r.x, r.z, t, m.active, rm);
        let k = 0.42 + 0.18 * busy + 0.9 * wave + 0.6 * f.burst;
        if (f.tapFlash && f.tapFlash.index === i) k += f.tapFlash.t * (rm ? 0.6 : 0.6 + 0.4 * Math.sin(t / 30));
        const inc = m.incidents.find((x) => x.rackIndex === i);
        if (inc) led = mix(led, [255, 80, 60], inc.worked ? 0.35 : 0.7);
        k *= 0.85 + 0.35 * nf;
        rackLeds.setColorAt(i, setC(c, led, k));
      }
      if (rackLeds.instanceColor) rackLeds.instanceColor.needsUpdate = true;

      // People.
      const nAgents = Math.min(MAX_PEOPLE, m.agents.length);
      bodies.count = heads.count = hair.count = agentProxy.count = nAgents;
      legs.count = arms.count = nAgents * 2;
      let blobN = 0;
      for (let i = 0; i < nAgents; i++) {
        const p = agentPose(s, m, i, t, rm);
        posePerson(i, p, rm);
        dummy.position.set(p.x, FLOOR_Y + 0.012, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.42, 1, 0.42);
        dummy.updateMatrix();
        blobs.setMatrixAt(blobN++, dummy.matrix);
      }
      const cp = chenPose(s, m, t, rm);
      chen.visible = !!cp;
      if (cp) {
        chen.position.set(cp.x, FLOOR_Y + cp.lift, cp.z);
        chen.rotation.y = cp.rotY;
        const sw = rm ? 0 : Math.sin(cp.gait) * 0.5;
        chenLegs[0]!.rotation.x = sw;
        chenLegs[1]!.rotation.x = -sw;
        dummy.position.set(cp.x, FLOOR_Y + 0.012, cp.z);
        dummy.scale.set(0.46, 1, 0.46);
        dummy.updateMatrix();
        blobs.setMatrixAt(blobN++, dummy.matrix);
      }
      blobs.count = blobN;
      for (const im of [bodies, heads, hair, legs, arms, agentProxy, blobs]) im.instanceMatrix.needsUpdate = true;

      // Beams + rising pulses (launch buzz surges; batching speeds; monetize gilds).
      // Instanced: brightness stands in for opacity (additive blending).
      let pn = 0;
      s.beams.forEach((b, i) => {
        const buzz = m.beamBuzz[i] ?? 0;
        const inten = Math.min(1.1, (m.beams[i] ?? 0.2) * (1 + 0.45 * buzz));
        const flick = rm ? 1 : 0.88 + 0.12 * Math.sin(t / 260 + i * 1.3) + buzz * 0.2 * (0.5 + 0.5 * Math.sin(t / 110 + i));
        const h = 2.6 + 5.5 * inten;
        const bc = pick(BEAM, i);
        if (beamCores && beamGlows) {
          dummy.position.set(b.x, FLOOR_Y, b.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, h, 1);
          dummy.updateMatrix();
          beamCores.setMatrixAt(i, dummy.matrix);
          beamCores.setColorAt(i, setC(c, bc, 0.8 * flick));
          dummy.scale.set(1 + buzz * 0.6, h * 0.92, 1 + buzz * 0.6);
          dummy.updateMatrix();
          beamGlows.setMatrixAt(i, dummy.matrix);
          beamGlows.setColorAt(i, setC(c, bc, (0.22 + 0.25 * buzz) * flick));
        }
        if (!rm && (m.batching > 0.001 || m.monetize > 0.001 || buzz > 0.04)) {
          const speed = 1 + m.batching * 2.4;
          const count = buzz > 0.04 ? 4 : 2;
          for (let k = 0; k < count && pn < MAX_PULSES; k++) {
            const ph = ((t / 1500) * speed + k / count + i * 0.29) % 1;
            dummy.position.set(b.x + Math.sin(ph * 5 + i) * 0.04, FLOOR_Y + ph * h, b.z);
            const sc = (0.8 + m.monetize * 0.5) * (1 - ph * 0.6);
            dummy.scale.set(sc, sc, sc);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            pulses.setMatrixAt(pn, dummy.matrix);
            pulses.setColorAt(pn, setC(c, mix(bc, [255, 205, 70], m.monetize), 1 - ph));
            pn++;
          }
        }
      });
      for (const im of [beamCores, beamGlows]) {
        if (!im) continue;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      pulses.count = pn;
      pulses.instanceMatrix.needsUpdate = true;
      if (pulses.instanceColor) pulses.instanceColor.needsUpdate = true;

      // Data motes drifting up out of the racks (denser with a better pipeline).
      const nm = rm ? 0 : Math.min(MAX_MOTES, Math.round((10 + 70 * m.dataFlow) * Math.min(1, s.racks.length / 12)));
      for (let k = 0; k < nm; k++) {
        const r = s.racks[Math.floor(hash01(k) * s.racks.length)];
        if (!r) continue;
        const ph = (t / (5200 + hash01(k + 50) * 3000) + hash01(k + 9)) % 1;
        motePos[k * 3] = r.x + (hash01(k + 3) - 0.5) * 0.5;
        motePos[k * 3 + 1] = FLOOR_Y + r.h + ph * 2.2;
        motePos[k * 3 + 2] = r.z + (hash01(k + 7) - 0.5) * 0.5;
        const tc = pick(TIER_LED, r.tier);
        const a = Math.sin(ph * Math.PI) * 0.8;
        moteCol[k * 3] = (tc[0] / 255) * a;
        moteCol[k * 3 + 1] = (tc[1] / 255) * a;
        moteCol[k * 3 + 2] = (tc[2] / 255) * a;
      }
      moteGeo.setDrawRange(0, nm);
      moteGeo.getAttribute("position").needsUpdate = true;
      moteGeo.getAttribute("color").needsUpdate = true;

      // Incidents: a blinking warn light + rising smoke on the afflicted rack.
      let sn = 0, wn = 0;
      for (const ic of m.incidents) {
        const r = s.racks[ic.rackIndex];
        if (!r || wn >= 8) continue;
        const top = FLOOR_Y + r.h;
        const blink = rm ? 1 : Math.sin(t / 180) > 0 ? 1 : 0.25;
        dummy.position.set(r.x + 0.2, top + 0.06, r.z + 0.2);
        dummy.scale.setScalar(blink);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        warns.setMatrixAt(wn++, dummy.matrix);
        const puffs = ic.worked ? 2 : 4;
        for (let k = 0; k < puffs && sn < MAX_SMOKE; k++) {
          const ph = rm ? 0.35 + k * 0.15 : (t / 2400 + k / puffs + ic.rackIndex * 0.13) % 1;
          dummy.position.set(r.x + Math.sin(ph * 4 + k) * 0.12, top + 0.1 + ph * 1.1, r.z);
          dummy.scale.setScalar((0.6 + ph * 1.4) * (ic.worked ? 0.6 : 1));
          dummy.updateMatrix();
          smoke.setMatrixAt(sn++, dummy.matrix);
        }
      }
      warns.count = wn;
      smoke.count = sn;
      warns.instanceMatrix.needsUpdate = smoke.instanceMatrix.needsUpdate = true;

      // Heat: unmarked crates stacked by the entrance.
      crates.count = Math.min(6, m.heatCrates);
      for (let k = 0; k < crates.count; k++) {
        dummy.position.set(s.bay.x0 + 0.62 + (k % 3) * 0.38, FLOOR_Y + 0.13 + Math.floor(k / 3) * 0.26, s.bay.z1 - 0.32);
        dummy.rotation.set(0, (hash01(k + 20) - 0.5) * 0.4, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        crates.setMatrixAt(k, dummy.matrix);
      }
      crates.instanceMatrix.needsUpdate = true;

      // Cooling fans spin (still under RM).
      fans.count = fanSpots.length;
      fanSpots.forEach((fs, i) => {
        dummy.position.set(fs.x, fs.y, fs.z);
        dummy.rotation.set(0, fs.ry, rm ? 0.4 : t / 260 + i);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        fans.setMatrixAt(i, dummy.matrix);
      });
      fans.instanceMatrix.needsUpdate = true;

      // Expansion plots breathe when affordable; recoloured live (money moves per tick).
      for (const p of plotMeshes) {
        const aff = m.sides.find((q) => q.id === p.id)?.affordable ?? false;
        const accent: RGB = aff ? [80, 220, 150] : [150, 162, 184];
        setC(p.mat.color, accent);
        setC(p.edgeMat.color, accent);
        setC(p.plusMat.color, accent);
        const pulse = aff && !rm ? 0.5 + 0.5 * Math.sin(t / 360) : aff ? 1 : 0.4;
        p.mat.opacity = 0.08 + 0.14 * pulse;
        p.edgeMat.opacity = 0.35 + 0.5 * pulse;
      }

      // Cooling-tower steam: soft puffs rising and widening (held still under RM).
      let sn2 = 0;
      for (const st of steamTops) {
        for (let k = 0; k < 6 && sn2 < 18; k++) {
          const ph = rm ? 0.2 + k * 0.13 : (t / 5200 + k / 6 + st.x * 0.1) % 1;
          dummy.position.set(st.x + Math.sin(ph * 3 + k) * 0.25 * st.k, st.y + ph * 2.2 * st.k, st.z + ph * 0.6);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar((0.8 + ph * 1.6) * st.k * (1 - ph * 0.35));
          dummy.updateMatrix();
          steam.setMatrixAt(sn2++, dummy.matrix);
        }
      }
      steam.count = sn2;
      steam.instanceMatrix.needsUpdate = true;

      // The Singularity: the ring slowly turns and shifts hue; motes spiral up it.
      let on = 0;
      if (halo) {
        const hue = rm ? 0.75 : (t / 9000) % 1;
        (halo.material as MeshBasicMaterial).color.setHSL(hue, 0.85, 0.72, SRGBColorSpace);
        if (!rm) halo.rotation.z = t / 6000;
        const R = (halo.geometry as TorusGeometry).parameters.radius;
        for (let k = 0; k < 28; k++) {
          const ph = rm ? k / 28 : (t / 7000 + k / 28) % 1;
          const a = ph * Math.PI * 6 + k;
          const rr = R * (1 - ph * 0.85);
          dummy.position.set(halo.position.x + Math.cos(a) * rr, halo.position.y - 1.4 + ph * 2.2, halo.position.z + Math.sin(a) * rr);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1 - ph * 0.5);
          dummy.updateMatrix();
          orbits.setMatrixAt(on, dummy.matrix);
          orbits.setColorAt(on, c.setHSL((hue + ph * 0.3) % 1, 0.8, 0.7, SRGBColorSpace));
          on++;
        }
      }
      orbits.count = on;
      orbits.instanceMatrix.needsUpdate = true;
      if (orbits.instanceColor) orbits.instanceColor.needsUpdate = true;

      // Rig Bay: fitted cooling fans spin; interconnect cables carry a packet down.
      bayFans.count = rigFanSpots.length;
      rigFanSpots.forEach((fs, i) => {
        dummy.position.set(fs.x, fs.y, fs.z);
        dummy.rotation.set(0, 0, rm ? 0.5 : t / 170 + i);
        dummy.scale.set(fs.s, fs.s, fs.s);
        dummy.updateMatrix();
        bayFans.setMatrixAt(i, dummy.matrix);
      });
      bayFans.instanceMatrix.needsUpdate = true;
      bayPackets.count = rm ? 0 : rigCables.length;
      if (!rm) {
        rigCables.forEach((cb, i) => {
          const ph = (t / 900 + i * 0.37) % 1;
          dummy.position.set(cb.x, cb.y1 - ph * (cb.y1 - cb.y0), cb.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          bayPackets.setMatrixAt(i, dummy.matrix);
          bayPackets.setColorAt(i, setC(c, cb.c));
        });
        bayPackets.instanceMatrix.needsUpdate = true;
        if (bayPackets.instanceColor) bayPackets.instanceColor.needsUpdate = true;
      }

      // Claim burst ring.
      ring.visible = f.burst > 0.001;
      if (ring.visible) {
        const span = Math.max(s.floor.x1 - s.floor.x0, s.floor.z1 - s.floor.z0);
        const r = 0.5 + (1 - f.burst) * span * 0.9;
        ring.scale.set(r, r, 1);
        ring.position.set((s.floor.x0 + s.floor.x1) / 2, FLOOR_Y + 0.02, (s.floor.z0 + s.floor.z1) / 2);
        ringMat.opacity = f.burst * 0.8;
      }

      // Camera: a slow, gentle sway in the card (still under RM); free in explore.
      if (controls) {
        if (focusFrom && focusTo) {
          const k = rm ? 1 : easeOut((t - focusFrom.at) / 560);
          controls.target.lerpVectors(focusFrom.t, focusTo.t, k);
          const d = focusFrom.d + (focusTo.d - focusFrom.d) * k;
          tmp.copy(camera.position).sub(controls.target).normalize();
          camera.position.copy(controls.target).addScaledVector(tmp, d);
          if (k >= 1) { focusFrom = null; focusTo = null; }
        }
        const b = s.bounds;
        controls.target.x = Math.max(b.x0 - 1, Math.min(b.x1 + 1, controls.target.x));
        controls.target.z = Math.max(b.z0 - 1, Math.min(b.z1 + 1, controls.target.z));
        controls.target.y = FLOOR_Y + 0.4;
        controls.update();
      } else if (!rm) {
        const az = AZ + 0.035 * Math.sin(t / 15000);
        if (Math.abs(az - azimuth) > 1e-4) {
          azimuth = az;
          tmp.set(Math.sin(POLAR) * Math.sin(azimuth), Math.cos(POLAR), Math.sin(POLAR) * Math.cos(azimuth));
          camera.position.copy(target).addScaledVector(tmp, fitDist);
          camera.lookAt(target);
        }
      }

      renderer.render(scene, camera);
    },

    resize(w, h, dpr) {
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      renderer.setPixelRatio(Math.min(2, dpr));
      renderer.setSize(cssW, cssH, false);
      if (controls) {
        camera.aspect = cssW / cssH;
        camera.updateProjectionMatrix();
      } else fitCamera();
    },

    pick(x, y) {
      if (!model || !spec) return null;
      const ray = new Raycaster();
      ray.setFromCamera(new Vector2((x / cssW) * 2 - 1, -(y / cssH) * 2 + 1), camera);
      // The people move every frame; their instanced bounds must be current for the ray.
      agentProxy.computeBoundingSphere();
      const hits = ray.intersectObjects([chenProxy, agentProxy, rackBody, ...plotMeshes.map((p) => p.fill)], false);
      for (const h of hits) {
        if (h.object === chenProxy && chen.visible) return { kind: "chen" };
        if (h.object === agentProxy && h.instanceId !== undefined) return { kind: "agent", index: h.instanceId };
        if (h.object === rackBody && h.instanceId !== undefined) {
          const r = spec.racks[h.instanceId];
          if (r) {
            const inc = model.incidents.find((q) => q.rackIndex === r.index && !q.worked);
            return { kind: "rack", index: r.index, tier: r.tier, incident: inc?.id ?? null };
          }
        }
        const plot = h.object.userData.plot as string | undefined;
        if (plot) return { kind: "plot", id: plot };
      }
      // A tap in the gap between racks lands on the floor: the tile under it belongs to
      // the rack standing there (the 2D hit-test honours the floor tile the same way).
      if (ray.ray.intersectPlane(floorPlane, tmp)) {
        const gx = Math.floor(tmp.x), gz = Math.floor(tmp.z);
        const r = spec.racks.find((q) => Math.floor(q.x) === gx && Math.floor(q.z) === gz);
        if (r) {
          const inc = model.incidents.find((q) => q.rackIndex === r.index && !q.worked);
          return { kind: "rack", index: r.index, tier: r.tier, incident: inc?.id ?? null };
        }
      }
      return null;
    },

    setExplore(on) {
      explore = on;
      if (on) attachControls(); else detachControls();
    },

    focus(p) {
      if (!controls || !model || !spec) return;
      let at: Vector3 | null = null;
      if (p.kind === "rack") {
        const r = spec.racks.find((q) => q.index === p.index);
        if (r) at = new Vector3(r.x, FLOOR_Y + 0.4, r.z);
      } else if (p.kind === "agent") {
        at = new Vector3(headPos[p.index * 3]!, FLOOR_Y + 0.4, headPos[p.index * 3 + 2]!);
      } else if (p.kind === "chen") at = chen.position.clone().setY(FLOOR_Y + 0.4);
      if (!at) return;
      const d = camera.position.distanceTo(controls.target);
      focusFrom = { t: controls.target.clone(), d, at: performance.now() };
      focusTo = { t: at, d: Math.min(d, fitDist / 2.6) };
    },

    agentScreen(i) {
      if (!model || i >= Math.min(MAX_PEOPLE, model.agents.length)) return null;
      return project(tmp.set(headPos[i * 3]!, headPos[i * 3 + 1]!, headPos[i * 3 + 2]!));
    },

    runAnchor() {
      if (!spec) return null;
      const f = spec.floor;
      const top = spec.racks.reduce((h, r) => Math.max(h, r.h), 0.6);
      return project(tmp.set((f.x0 + f.x1) / 2, FLOOR_Y + top + 0.9, (f.z0 + f.z1) / 2));
    },

    zoom() {
      return controls ? fitDist / Math.max(0.01, camera.position.distanceTo(controls.target)) : 1;
    },

    isLost() {
      return renderer.getContext().isContextLost();
    },

    stats() {
      const { render, memory } = renderer.info;
      return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
    },

    dispose() {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      controls?.dispose();
      disposeWorld();
      for (const o of owned) o.dispose();
      renderer.dispose();
    },
  };
  return api;
}
