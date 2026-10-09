import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MOUSE,
  NeutralToneMapping,
  Object3D,
  OrthographicCamera,
  PCFShadowMap,
  Plane,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { HallModel } from "../render/hallModel";
import { nightFactor, skinTint } from "../render/hallRenderer";
import { buildScene3D, agentPose, chenPose, trainingWave, type Scene3DSpec, type Rect } from "./layout3d";

/**
 * The 3D hall (Phase 0 spike — WORLD_3D_PLAN.md). A three.js diorama of the SAME
 * HallModel the 2D canvas paints: orthographic isometric camera, real light and
 * soft shadows, cutaway walls, instanced racks, staff at desks. Fully procedural —
 * no meshes, no textures, no image assets (DEV.md's parametric rule holds).
 *
 * Perf shape (mobile-first): racks are 3 instanced draws total; the shadow map is
 * re-rendered only when the room changes (people use blob shadows); DPR ≤ 2; the
 * caller caps the frame rate and pauses off-screen, exactly like the 2D loop.
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
  /** Screen position (css px) of agent i's head, or null if off-screen / absent. */
  agentScreen(i: number): { x: number; y: number } | null;
  zoom(): number;
  /** True once the GL context is gone (iOS can kill it without an event firing). */
  isLost(): boolean;
  /** Last frame's renderer counters (perf budget checks in the smoke harness). */
  stats(): { calls: number; triangles: number; geometries: number; textures: number };
  dispose(): void;
}

type RGB = [number, number, number];

const FLOOR_Y = 0.16;
const MAX_RACKS = 120;
const MAX_PEOPLE = 16;
const MAX_MOTES = 90;
const MAX_PULSES = 48;
const MAX_SMOKE = 24;
const LED_BARS = 6;
/** Per-tier footprint (x/z scale): tiers read by SHAPE, not colour alone (colour-blind
 *  safe) — a slim consumer tower, a standard server blade, a broad TPU pod with a cap. */
const TIER_FOOT = [0.78, 1, 1.14];

// Era palettes for the diorama. Grounds are deep (the dom_scholz / night-ops look);
// the rack floor keeps the 2D era hue; the ops-bay rug is the era's colour block.
const ERA_GROUND: RGB[] = [[34, 38, 56], [30, 40, 66], [40, 34, 62], [26, 46, 54], [34, 34, 70], [52, 42, 96]];
const ERA_FLOOR: RGB[] = [[86, 94, 122], [80, 98, 140], [98, 88, 136], [72, 120, 132], [92, 92, 156], [128, 112, 196]];
const ERA_RUG: RGB[] = [[201, 150, 92], [52, 170, 160], [132, 96, 214], [64, 168, 112], [70, 120, 230], [214, 112, 196]];
const TIER: RGB[] = [[52, 210, 126], [63, 134, 240], [155, 81, 224]];
const TIER_LED: RGB[] = [[150, 255, 196], [150, 205, 255], [215, 170, 255]];
const BEAM: RGB[] = [[63, 134, 240], [155, 81, 224], [52, 210, 126], [245, 180, 10], [255, 99, 132]];
const SKIN: RGB[] = [[241, 204, 176], [214, 166, 128], [168, 116, 82], [120, 80, 56], [232, 190, 150]];
const HAIR: RGB[] = [[40, 32, 30], [74, 52, 38], [20, 20, 24], [150, 104, 60], [196, 160, 110]];

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

/** A vertical gradient column (alpha 1 at the base → 0 at the top) for beams. */
function beamGeometry(radius: number): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, 1, 14, 1, true);
  g.translate(0, 0.5, 0);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    colors.set([1, 1, 1, 1 - y], i * 4);
  }
  g.setAttribute("color", new BufferAttribute(colors, 4));
  return g;
}

/** The front LED panels of a rack: inset glass on the two faces the camera sees. */
function panelGeometry(): BufferGeometry {
  const a = new BoxGeometry(0.4, 0.72, 0.012);
  a.translate(0, 0.5, 0.336);
  const b = new BoxGeometry(0.012, 0.72, 0.4);
  b.translate(0.336, 0.5, 0);
  return mergeGeometries([a, b])!;
}

/** Blade-server LED bars on both visible faces — flat quads (2 tris each), not boxes:
 *  the camera only ever sees their front, and 120 racks × 12 bars adds up. */
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
  return mergeGeometries(parts)!;
}

/** Thrown (without logging) when the device can't give us WebGL2; the stage falls back. */
export class NoWebGLError extends Error {}

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
  // carry blob shadows) — the single biggest GPU saving on a phone.
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
  scene.fog = new Fog(bg, 70, 120);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const target = new Vector3();
  const POLAR = Math.acos(1 / Math.sqrt(3)); // true isometric elevation (35.26°)
  const CAM_R = 60;
  let azimuth = Math.PI / 4;
  let cssW = 1, cssH = 1;

  // --- Lights -------------------------------------------------------------------
  const hemi = new HemisphereLight(0xdfe8ff, 0x3a3550, 1.6);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff1dc, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // --- Shared geometry + materials (created once, disposed once) -----------------
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => { owned.push(x); return x; };

  const unitBox = own(new BoxGeometry(1, 1, 1));
  const unitPlane = own(new PlaneGeometry(1, 1));
  unitPlane.rotateX(-Math.PI / 2);

  // One bevel segment: still catches the highlight that sells "rounded", at 108
  // triangles instead of 300 — the racks are most of the triangle budget.
  const rackGeo = own(new RoundedBoxGeometry(0.66, 1, 0.66, 1, 0.05));
  rackGeo.translate(0, 0.5, 0);
  const rackMat = own(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.12 }));
  const rackBody = new InstancedMesh(rackGeo, rackMat, MAX_RACKS);
  rackBody.castShadow = true;
  rackBody.receiveShadow = true;
  const panelMat = own(new MeshStandardMaterial({ color: 0x141926, roughness: 0.28, metalness: 0.5 }));
  const rackPanel = new InstancedMesh(own(panelGeometry()), panelMat, MAX_RACKS);
  const ledMat = own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const rackLeds = new InstancedMesh(own(ledGeometry()), ledMat, MAX_RACKS);
  const capGeo = own(new CylinderGeometry(0.2, 0.26, 0.1, 18));
  capGeo.translate(0, 0.05, 0);
  const podCaps = new InstancedMesh(capGeo, own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), MAX_RACKS);
  for (const m of [rackBody, rackPanel, rackLeds, podCaps]) {
    m.count = 0;
    m.frustumCulled = false; // instance bounds change every rebuild; the room is always on screen
    scene.add(m);
  }

  // People: chibi proportions — a small capsule body under a big round head.
  const bodyGeo = own(new CapsuleGeometry(0.1, 0.12, 4, 10));
  bodyGeo.translate(0, 0.16, 0);
  const headGeo = own(new SphereGeometry(0.118, 18, 12));
  const hairGeo = own(new SphereGeometry(0.126, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.52));
  const blobGeo = own(new CircleGeometry(0.17, 20));
  blobGeo.rotateX(-Math.PI / 2);
  const personMat = own(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }));
  const blobMat = own(new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }));
  const pickMat = own(new MeshBasicMaterial({ visible: false }));
  const bodies = new InstancedMesh(bodyGeo, personMat, MAX_PEOPLE);
  const heads = new InstancedMesh(headGeo, personMat, MAX_PEOPLE);
  const hair = new InstancedMesh(hairGeo, personMat, MAX_PEOPLE);
  const blobs = new InstancedMesh(blobGeo, blobMat, MAX_PEOPLE + 1);
  const agentProxy = new InstancedMesh(unitBox, pickMat, MAX_PEOPLE);
  for (const m of [bodies, heads, hair]) m.castShadow = false;
  for (const m of [bodies, heads, hair, blobs, agentProxy]) {
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
  }

  // Desks, monitors, chairs — one instanced draw each.
  const deskMat = own(new MeshStandardMaterial({ color: 0xe2cfae, roughness: 0.7 }));
  const chairMat = own(new MeshStandardMaterial({ color: 0x3a3f52, roughness: 0.6 }));
  const monitorMat = own(new MeshStandardMaterial({ color: 0x1b1f2b, roughness: 0.35, metalness: 0.4 }));
  const screenMat = own(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const desks = new InstancedMesh(own(new RoundedBoxGeometry(0.62, 0.36, 0.36, 2, 0.03)), deskMat, MAX_PEOPLE);
  const chairs = new InstancedMesh(own(new RoundedBoxGeometry(0.24, 0.2, 0.24, 2, 0.05)), chairMat, MAX_PEOPLE);
  const monitors = new InstancedMesh(unitBox, monitorMat, MAX_PEOPLE);
  const screens = new InstancedMesh(unitBox, screenMat, MAX_PEOPLE);
  desks.castShadow = true;
  for (const m of [desks, chairs, monitors, screens]) {
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
  }

  // The inspector: dark suit + clipboard; an outsider in the room.
  const chen = new Group();
  const suitMat = own(new MeshStandardMaterial({ color: 0x3a4052, roughness: 0.5 }));
  const chenBody = new Mesh(bodyGeo, suitMat);
  const chenHead = new Mesh(headGeo, own(new MeshStandardMaterial({ color: col([224, 200, 180]), roughness: 0.6 })));
  chenHead.position.y = 0.43;
  const chenHair = new Mesh(hairGeo, own(new MeshStandardMaterial({ color: 0x23202a, roughness: 0.7 })));
  chenHair.position.y = 0.45;
  const clip = new Mesh(unitBox, own(new MeshStandardMaterial({ color: 0xeef1f6, roughness: 0.5 })));
  clip.scale.set(0.12, 0.16, 0.02);
  clip.position.set(0.13, 0.22, 0.08);
  const chenProxy = new Mesh(unitBox, pickMat);
  chenProxy.scale.set(0.42, 0.62, 0.42);
  chenProxy.position.y = 0.31;
  chen.add(chenBody, chenHead, chenHair, clip, chenProxy);
  chen.visible = false;
  scene.add(chen);

  // Beams (per product), their rising pulses, data motes, smoke, crates.
  const beamCore = own(beamGeometry(0.055));
  const beamGlow = own(beamGeometry(0.17));
  const pulseGeo = own(new SphereGeometry(0.05, 10, 8));
  const pulseMat = own(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  const pulses = new InstancedMesh(pulseGeo, pulseMat, MAX_PULSES);
  pulses.frustumCulled = false;
  pulses.count = 0;
  scene.add(pulses);

  const motePos = new Float32Array(MAX_MOTES * 3);
  const moteCol = new Float32Array(MAX_MOTES * 3);
  const moteGeo = own(new BufferGeometry());
  moteGeo.setAttribute("position", new BufferAttribute(motePos, 3));
  moteGeo.setAttribute("color", new BufferAttribute(moteCol, 3));
  const motes = new Points(moteGeo, own(new PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })));
  motes.frustumCulled = false;
  scene.add(motes);

  const smokeMat = own(new MeshBasicMaterial({ color: 0x9aa3b5, transparent: true, opacity: 0.32, depthWrite: false }));
  const smoke = new InstancedMesh(own(new SphereGeometry(0.12, 10, 8)), smokeMat, MAX_SMOKE);
  const warnMat = own(new MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }));
  const warns = new InstancedMesh(own(new SphereGeometry(0.06, 10, 8)), warnMat, 8);
  const crateMat = own(new MeshStandardMaterial({ color: 0x15161b, roughness: 0.8 }));
  const crates = new InstancedMesh(own(new RoundedBoxGeometry(0.34, 0.26, 0.3, 2, 0.03)), crateMat, 6);
  crates.castShadow = true;
  for (const m of [smoke, warns, crates]) {
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
  }

  // Claim burst: a ring of light washing out across the floor.
  const ringMat = own(new MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  const ring = new Mesh(own(new RingGeometry(0.92, 1, 64)), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  // Per-rebuild world (floor, walls, plots, beams, cooling, skyline). Built from the
  // shared unit geometries, so a rebuild allocates Meshes and a few materials only.
  let world = new Group();
  scene.add(world);
  let worldMats: Material[] = [];
  let worldGeos: BufferGeometry[] = [];
  const wmat = <T extends Material>(m: T): T => { worldMats.push(m); return m; };
  let beamMeshes: { core: Mesh; glow: Mesh; node: Mesh; base: number }[] = [];
  let fans: Mesh[] = [];
  let plotMeshes: { id: string; fill: Mesh; edge: LineLoop; mat: MeshBasicMaterial; edgeMat: LineDashedMaterial; plus: Mesh[]; affordable: boolean }[] = [];
  let windowMat: MeshBasicMaterial | null = null;
  let groundMat: MeshStandardMaterial | null = null;
  let gridMat: Material | null = null;

  let model: HallModel | null = null;
  let spec: Scene3DSpec | null = null;
  let worldSig = "";
  let fitSig = "";
  let explore = false;
  let controls: OrbitControls | null = null;
  let focusFrom: { t: Vector3; z: number; at: number } | null = null;
  let focusTo: { t: Vector3; z: number } | null = null;
  let lastRM = false;

  const m4 = new Matrix4();
  const floorPlane = new Plane(new Vector3(0, 1, 0), -FLOOR_Y);
  const tmp = new Vector3();
  const dummy = new Object3D();
  const c = new Color();

  const box = (r: Rect, y0: number, h: number, mat: Material, cast = false, receive = true): Mesh => {
    const m = new Mesh(unitBox, mat);
    m.scale.set(r.x1 - r.x0, h, r.z1 - r.z0);
    m.position.set((r.x0 + r.x1) / 2, y0 + h / 2, (r.z0 + r.z1) / 2);
    m.castShadow = cast;
    m.receiveShadow = receive;
    world.add(m);
    return m;
  };
  const plane = (r: Rect, y: number, mat: Material): Mesh => {
    const m = new Mesh(unitPlane, mat);
    m.scale.set(r.x1 - r.x0, 1, r.z1 - r.z0);
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    world.add(m);
    return m;
  };

  function disposeWorld(): void {
    scene.remove(world);
    for (const m of worldMats) m.dispose();
    for (const g of worldGeos) g.dispose();
    worldMats = [];
    worldGeos = [];
    world = new Group();
    scene.add(world);
    beamMeshes = [];
    fans = [];
    plotMeshes = [];
    windowMat = null;
  }

  /** Rebuild the static room: ground, floor slabs, rugs, aisles, walls, windows,
   *  cooling, skyline, plots and beam columns. Runs only when the room changes. */
  function buildWorld(m: HallModel, s: Scene3DSpec): void {
    disposeWorld();
    const era = Math.max(0, Math.min(5, m.era));
    const ground = pick(ERA_GROUND, era);
    const floorC = pick(ERA_FLOOR, era);
    const rug = pick(ERA_RUG, era);

    groundMat = wmat(new MeshStandardMaterial({ color: col(ground), roughness: 0.95 }));
    const g = new Mesh(unitPlane, groundMat);
    g.scale.set(400, 1, 400);
    g.receiveShadow = true;
    world.add(g);
    const grid = new GridHelper(400, 200, col(shade(ground, 1.6)), col(shade(ground, 1.6)));
    gridMat = grid.material as Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.35;
    gridMat.depthWrite = false;
    worldGeos.push(grid.geometry);
    worldMats.push(gridMat);
    grid.position.y = 0.004;
    world.add(grid);

    // Slabs: the rack floor (technical tile) and the ops bay (carpet).
    const slabMat = wmat(new MeshStandardMaterial({ color: col([220, 198, 182]), roughness: 0.9 }));
    box({ ...s.floor, z1: s.bay.z1 }, 0, FLOOR_Y - 0.002, slabMat, true);
    s.rooms.forEach((r, i) => {
      const tint = mix(floorC, rug, 0.08 + (i % 2) * 0.06);
      plane({ x0: r.x0 + 0.04, z0: r.z0 + 0.04, x1: r.x1 - 0.04, z1: r.z1 - 0.04 }, FLOOR_Y, wmat(new MeshStandardMaterial({ color: col(tint), roughness: 0.72 })));
    });
    const aisleMat = wmat(new MeshStandardMaterial({ color: col(shade(floorC, 1.25)), roughness: 0.6 }));
    const stripMat = wmat(new MeshBasicMaterial({ color: col(mix(rug, [255, 255, 255], 0.4)), toneMapped: false }));
    for (const a of s.aisles) {
      plane(a, FLOOR_Y + 0.001, aisleMat);
      const vertical = a.x1 - a.x0 < a.z1 - a.z0;
      const cx = (a.x0 + a.x1) / 2, cz = (a.z0 + a.z1) / 2;
      plane(vertical ? { x0: cx - 0.03, z0: a.z0 + 0.1, x1: cx + 0.03, z1: a.z1 - 0.1 } : { x0: a.x0 + 0.1, z0: cz - 0.03, x1: a.x1 - 0.1, z1: cz + 0.03 }, FLOOR_Y + 0.002, stripMat);
    }
    plane({ x0: s.bay.x0 + 0.04, z0: s.bay.z0 + 0.04, x1: s.bay.x1 - 0.04, z1: s.bay.z1 - 0.04 }, FLOOR_Y, wmat(new MeshStandardMaterial({ color: col([160, 108, 72]), roughness: 0.85 })));
    plane({ x0: s.bay.x0 + 0.3, z0: s.bay.z0 + 0.62, x1: s.bay.x1 - 0.3, z1: s.bay.z1 - 0.2 }, FLOOR_Y + 0.001, wmat(new MeshStandardMaterial({ color: col(rug), roughness: 0.95 })));

    // Tile seams over the rack floor.
    const seam: number[] = [];
    for (let x = s.floor.x0 + 1; x < s.floor.x1; x++) seam.push(x, FLOOR_Y + 0.003, s.floor.z0, x, FLOOR_Y + 0.003, s.floor.z1);
    for (let z = s.floor.z0 + 1; z < s.floor.z1; z++) seam.push(s.floor.x0, FLOOR_Y + 0.003, z, s.floor.x1, FLOOR_Y + 0.003, z);
    const seamGeo = new BufferGeometry();
    seamGeo.setAttribute("position", new BufferAttribute(new Float32Array(seam), 3));
    worldGeos.push(seamGeo);
    world.add(new LineSegments(seamGeo, wmat(new LineBasicMaterial({ color: col(shade(floorC, 1.45)), transparent: true, opacity: 0.35 }))));

    // Cutaway walls: the two back walls only (the front is open to the viewer).
    const T = 0.12;
    const wallMat = wmat(new MeshStandardMaterial({ color: col([240, 228, 218]), roughness: 0.9 }));
    const capMat = wmat(new MeshStandardMaterial({ color: col([214, 196, 184]), roughness: 0.7 }));
    const H = s.wallH;
    box({ x0: s.floor.x0 - T, z0: s.floor.z0 - T, x1: s.floor.x1, z1: s.floor.z0 }, 0, H, wallMat, true);
    box({ x0: s.floor.x0 - T, z0: s.floor.z0, x1: s.floor.x0, z1: s.bay.z1 }, 0, H, wallMat, true);
    box({ x0: s.floor.x0 - T, z0: s.floor.z0 - T, x1: s.floor.x1, z1: s.floor.z0 }, H, 0.04, capMat);
    box({ x0: s.floor.x0 - T, z0: s.floor.z0, x1: s.floor.x0, z1: s.bay.z1 }, H, 0.04, capMat);
    // Clerestory windows: pale by day, warm and lit at night (driven per frame).
    // One instanced draw for every pane on both walls.
    windowMat = wmat(new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    const panes: Rect[] = [];
    for (let x = s.floor.x0 + 0.6; x < s.floor.x1 - 0.4; x += 1.4) panes.push({ x0: x, z0: s.floor.z0 + 0.001, x1: x + 0.9, z1: s.floor.z0 + 0.02 });
    for (let z = s.floor.z0 + 0.6; z < s.bay.z1 - 0.4; z += 1.4) panes.push({ x0: s.floor.x0 + 0.001, z0: z, x1: s.floor.x0 + 0.02, z1: z + 0.9 });
    const win = new InstancedMesh(unitBox, windowMat, Math.max(1, panes.length));
    panes.forEach((r, i) => {
      dummy.position.set((r.x0 + r.x1) / 2, H * 0.74, (r.z0 + r.z1) / 2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(r.x1 - r.x0, H * 0.24, r.z1 - r.z0);
      dummy.updateMatrix();
      win.setMatrixAt(i, dummy.matrix);
    });
    win.count = panes.length;
    win.frustumCulled = false;
    world.add(win);

    // Cooling units on both walls; their fans spin (frame()).
    const unitMat = wmat(new MeshStandardMaterial({ color: 0xc9ced9, roughness: 0.5, metalness: 0.2 }));
    const fanMat = wmat(new MeshStandardMaterial({ color: 0x5b6274, roughness: 0.4 }));
    const fanGeo = mergeGeometries([new BoxGeometry(0.34, 0.05, 0.02), new BoxGeometry(0.05, 0.34, 0.02)])!;
    worldGeos.push(fanGeo);
    for (let k = 0; k < m.coolingUnits; k++) {
      const u = (k + 1) / (m.coolingUnits + 1);
      const x = s.floor.x0 + u * (s.floor.x1 - s.floor.x0);
      box({ x0: x - 0.3, z0: s.floor.z0, x1: x + 0.3, z1: s.floor.z0 + 0.16 }, 0.5, 0.62, unitMat, true);
      const f1 = new Mesh(fanGeo, fanMat);
      f1.position.set(x, 0.81, s.floor.z0 + 0.17);
      world.add(f1);
      fans.push(f1);
      const z = s.floor.z0 + u * (s.floor.z1 - s.floor.z0);
      box({ x0: s.floor.x0, z0: z - 0.3, x1: s.floor.x0 + 0.16, z1: z + 0.3 }, 0.5, 0.62, unitMat, true);
      const f2 = new Mesh(fanGeo, fanMat);
      f2.rotation.y = Math.PI / 2;
      f2.position.set(s.floor.x0 + 0.17, 0.81, z);
      world.add(f2);
      fans.push(f2);
    }

    // The horizon race: rival datacenters beyond the back wall, yours among them.
    m.skyline.forEach((tw, i) => {
      const n = m.skyline.length;
      const x = s.floor.x0 - 3 + ((i + 0.5) / n) * (s.floor.x1 - s.floor.x0 + 8);
      const z = s.floor.z0 - 4 - (i % 3) * 1.6;
      const h = 1.6 + tw.h * 5.5;
      // Atmospheric: towers sit close to the ground colour so they read as distance,
      // not as black monoliths; the leader's crown and yours carry the light.
      const base: RGB = tw.you ? mix(ground, [150, 120, 240], 0.55) : mix(ground, [190, 200, 230], tw.dim ? 0.1 : 0.22);
      box({ x0: x - 0.8, z0: z - 0.8, x1: x + 0.8, z1: z + 0.8 }, 0, h, wmat(new MeshBasicMaterial({ color: col(base) })), false, false);
      box({ x0: x - 0.82, z0: z - 0.82, x1: x + 0.82, z1: z + 0.82 }, h - 0.25, 0.12, wmat(new MeshBasicMaterial({ color: col(tw.you ? [200, 170, 255] : tw.dim ? [70, 70, 90] : [150, 180, 230]), toneMapped: false })), false, false);
    });

    // Beam columns (one per live product).
    s.beams.forEach((b, i) => {
      const bc = pick(BEAM, i);
      const coreMat = wmat(new MeshBasicMaterial({ color: col(bc), transparent: true, opacity: 0.9, vertexColors: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      const glowMat = wmat(new MeshBasicMaterial({ color: col(bc), transparent: true, opacity: 0.35, vertexColors: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      const core = new Mesh(beamCore, coreMat);
      const glow = new Mesh(beamGlow, glowMat);
      const node = new Mesh(blobGeo, wmat(new MeshBasicMaterial({ color: col(bc), transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false, toneMapped: false })));
      node.scale.set(1.3, 1, 1.3);
      for (const o of [core, glow]) o.position.set(b.x, FLOOR_Y, b.z);
      node.position.set(b.x, FLOOR_Y + 0.004, b.z);
      world.add(core, glow, node);
      beamMeshes.push({ core, glow, node, base: i });
    });

    // Expansion plots: a ghost lot past the open edge, "+" in the middle.
    for (const p of s.plots) {
      const accent: RGB = p.affordable ? [80, 220, 150] : [150, 162, 184];
      const mat = wmat(new MeshBasicMaterial({ color: col(accent), transparent: true, opacity: 0.14, depthWrite: false }));
      const fill = plane(p.rect, 0.02, mat);
      const r = p.rect;
      const edgeGeo = new BufferGeometry().setFromPoints([new Vector3(r.x0, 0.03, r.z0), new Vector3(r.x1, 0.03, r.z0), new Vector3(r.x1, 0.03, r.z1), new Vector3(r.x0, 0.03, r.z1)]);
      worldGeos.push(edgeGeo);
      const edgeMat = wmat(new LineDashedMaterial({ color: col(accent), dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.8 }));
      const edge = new LineLoop(edgeGeo, edgeMat);
      edge.computeLineDistances();
      world.add(edge);
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const plusMat = wmat(new MeshBasicMaterial({ color: col(accent), transparent: true, opacity: 0.9, toneMapped: false }));
      const a = box({ x0: cx - 0.22, z0: cz - 0.035, x1: cx + 0.22, z1: cz + 0.035 }, 0.03, 0.02, plusMat, false, false);
      const b2 = box({ x0: cx - 0.035, z0: cz - 0.22, x1: cx + 0.035, z1: cz + 0.22 }, 0.03, 0.02, plusMat, false, false);
      fill.userData.plot = p.id;
      plotMeshes.push({ id: p.id, fill, edge, mat, edgeMat, plus: [a, b2], affordable: p.affordable });
    }

    // Sun + shadow frustum fitted to the room.
    const cx = (s.bounds.x0 + s.bounds.x1) / 2, cz = (s.bounds.z0 + s.bounds.z1) / 2;
    const span = Math.max(s.bounds.x1 - s.bounds.x0, s.bounds.z1 - s.bounds.z0) * 0.85 + 2;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx - 7, 16, cz + 11);
    const sc = sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
    sc.near = 1; sc.far = 60;
    sc.updateProjectionMatrix();
  }

  /** Static furniture + rack transforms for the current spec (people move per frame). */
  function placeStatics(s: Scene3DSpec, spawnFrom: number, spawnT: number): void {
    const grow = easeOut(spawnT);
    rackBody.count = rackPanel.count = rackLeds.count = s.racks.length;
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
    podCaps.instanceMatrix.needsUpdate = true;
    if (podCaps.instanceColor) podCaps.instanceColor.needsUpdate = true;
    rackBody.instanceMatrix.needsUpdate = rackPanel.instanceMatrix.needsUpdate = rackLeds.instanceMatrix.needsUpdate = true;
    rackBody.computeBoundingSphere();

    const n = s.desks.length;
    desks.count = chairs.count = monitors.count = screens.count = n;
    s.desks.forEach((d, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(d.x, FLOOR_Y + 0.18, d.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      desks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(d.x, FLOOR_Y + 0.1, d.z + 0.32);
      dummy.updateMatrix();
      chairs.setMatrixAt(i, dummy.matrix);
      dummy.position.set(d.x, FLOOR_Y + 0.5, d.z - 0.08);
      dummy.scale.set(0.34, 0.21, 0.025);
      dummy.updateMatrix();
      monitors.setMatrixAt(i, dummy.matrix);
      dummy.position.set(d.x, FLOOR_Y + 0.5, d.z - 0.066);
      dummy.scale.set(0.3, 0.17, 0.004);
      dummy.updateMatrix();
      screens.setMatrixAt(i, dummy.matrix);
      const a = model?.agents[d.agent];
      screens.setColorAt(i, setC(c, a?.team === "product" ? [120, 230, 170] : [130, 190, 255]));
    });
    for (const m of [desks, chairs, monitors, screens]) m.instanceMatrix.needsUpdate = true;
    if (screens.instanceColor) screens.instanceColor.needsUpdate = true;
  }

  /** Identity colours for the people: team body (gold for a 10× hire), skin, hair. */
  function peopleColors(m: HallModel): void {
    m.agents.slice(0, MAX_PEOPLE).forEach((a, i) => {
      bodies.setColorAt(i, setC(c, a.tenx ? [245, 196, 60] : a.team === "product" ? [70, 196, 132] : [80, 140, 236]));
      heads.setColorAt(i, setC(c, pick(SKIN, i * 7 + 3)));
      hair.setColorAt(i, setC(c, pick(HAIR, i * 5 + 1)));
    });
    for (const im of [bodies, heads, hair]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  function rackColors(m: HallModel, skin?: string): void {
    m.racks.forEach((r, i) => {
      const base = skinTint(pick(TIER, r.tier), skin);
      rackBody.setColorAt(i, setC(c, mix(base, [235, 238, 245], 0.12)));
    });
    if (rackBody.instanceColor) rackBody.instanceColor.needsUpdate = true;
  }

  let lastSkin: string | undefined;
  let staticsDirty = true;

  function fitCamera(): void {
    if (!spec) return;
    const aspect = cssW / Math.max(1, cssH);
    const dir = new Vector3(Math.sin(POLAR) * Math.sin(azimuth), Math.cos(POLAR), Math.sin(POLAR) * Math.cos(azimuth));
    const b = spec.bounds;
    target.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    camera.position.copy(target).addScaledVector(dir, CAM_R);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const v = new Vector3();
    for (const x of [b.x0 - 0.15, b.x1]) for (const z of [b.z0 - 0.15, b.z1]) for (const y of [0, spec.wallH + 0.1]) {
      v.set(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const pad = 1.07;
    let halfW = ((maxX - minX) / 2) * pad;
    let halfH = ((maxY - minY) / 2) * pad;
    if (halfW / halfH > aspect) halfH = halfW / aspect; else halfW = halfH * aspect;
    const cxv = (minX + maxX) / 2, cyv = (minY + maxY) / 2;
    camera.left = cxv - halfW; camera.right = cxv + halfW;
    camera.top = cyv + halfH; camera.bottom = cyv - halfH;
    camera.updateProjectionMatrix();
  }

  function attachControls(): void {
    if (controls) return;
    const oc = new OrbitControls(camera, canvas);
    oc.target.copy(target);
    oc.enableDamping = !lastRM;
    oc.dampingFactor = 0.09;
    oc.minZoom = 0.8;
    oc.maxZoom = 5;
    oc.minPolarAngle = 0.5;
    oc.maxPolarAngle = 1.18;
    oc.minAzimuthAngle = 0.1;
    oc.maxAzimuthAngle = Math.PI / 2 - 0.1;
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
    camera.zoom = 1;
    azimuth = Math.PI / 4;
    fitCamera();
  }

  const api: HallScene3D = {
    setModel(next) {
      model = next;
      spec = buildScene3D(next);
      const sig = `${next.cols}|${next.rows}|${next.era}|${next.splitGx}|${next.splitGy}|${next.coolingUnits}|${spec.plots.map((p) => p.id).join(",")}|${next.beams.length}|${next.skyline.map((t) => `${Math.round(t.h * 20)}${t.dim ? "d" : ""}${t.you ? "y" : ""}`).join(".")}`;
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
      }
      const spawning = f.spawnT < 1;
      if (staticsDirty || spawning) {
        placeStatics(s, f.spawnFrom, f.spawnT);
        staticsDirty = false;
        renderer.shadowMap.needsUpdate = true;
      }

      // Day / night: the sun sinks, the hemisphere cools, windows and LEDs take over.
      const nf = nightFactor(f.phase);
      const era = Math.max(0, Math.min(5, m.era));
      const ground = pick(ERA_GROUND, era);
      setC(bg, mix(shade(ground, 1.15), shade(ground, 0.55), nf));
      (scene.fog as Fog).color.copy(bg);
      if (groundMat) setC(groundMat.color, mix(ground, shade(ground, 0.6), nf));
      hemi.intensity = 1.6 - 1.05 * nf;
      setC(hemi.color, mix([223, 232, 255], [120, 140, 220], nf));
      sun.intensity = 2.2 - 1.85 * nf;
      setC(sun.color, mix([255, 241, 220], [150, 170, 255], nf));
      // Faction alignment: a faint warm (accel) or cool (doomer) cast on the fill light.
      if (Math.abs(m.alignment) > 0.02) hemi.color.lerp(setC(c, m.alignment < 0 ? [60, 120, 240] : [255, 150, 60]), Math.min(0.18, Math.abs(m.alignment) * 0.18));
      if (windowMat) setC(windowMat.color, mix([150, 170, 200], [255, 214, 150], nf));

      // Rack LEDs: tier glow, breathing while the lab is busy, a training wave while
      // a run is active, a hot cast under overclock / thermal load, tap flash, burst.
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
      let blobN = 0;
      for (let i = 0; i < nAgents; i++) {
        const p = agentPose(s, m, i, t, rm);
        const y = FLOOR_Y + p.lift + (p.seated ? 0.12 : 0);
        dummy.position.set(p.x, y, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(1, p.seated ? 0.86 : 1, 1);
        dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(1, 1, 1);
        dummy.position.set(p.x, y + (p.seated ? 0.38 : 0.43), p.z);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
        dummy.position.y += 0.02;
        dummy.rotation.set(-0.25, p.rotY, 0);
        dummy.updateMatrix();
        hair.setMatrixAt(i, dummy.matrix);
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(p.x, y + 0.3, p.z);
        dummy.scale.set(0.46, 0.66, 0.46);
        dummy.updateMatrix();
        agentProxy.setMatrixAt(i, dummy.matrix);
        if (!p.seated) {
          dummy.position.set(p.x, FLOOR_Y + 0.006, p.z);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          blobs.setMatrixAt(blobN++, dummy.matrix);
        }
      }
      const cp = chenPose(s, m, t, rm);
      chen.visible = !!cp;
      if (cp) {
        chen.position.set(cp.x, FLOOR_Y + cp.lift, cp.z);
        chen.rotation.y = cp.rotY;
        dummy.position.set(cp.x, FLOOR_Y + 0.006, cp.z);
        dummy.scale.set(1.1, 1, 1.1);
        dummy.updateMatrix();
        blobs.setMatrixAt(blobN++, dummy.matrix);
      }
      blobs.count = blobN;
      for (const im of [bodies, heads, hair, agentProxy, blobs]) im.instanceMatrix.needsUpdate = true;

      // Beams + rising pulses (launch buzz surges; batching speeds; monetize gilds).
      let pn = 0;
      beamMeshes.forEach((bm, i) => {
        const b = s.beams[i];
        if (!b) return;
        const buzz = m.beamBuzz[i] ?? 0;
        const inten = Math.min(1.1, (m.beams[i] ?? 0.2) * (1 + 0.45 * buzz));
        const flick = rm ? 1 : 0.88 + 0.12 * Math.sin(t / 260 + i * 1.3) + buzz * 0.2 * (0.5 + 0.5 * Math.sin(t / 110 + i));
        const h = 2.4 + 5.5 * inten;
        bm.core.scale.set(1, h, 1);
        bm.glow.scale.set(1 + buzz * 0.6, h * 0.92, 1 + buzz * 0.6);
        (bm.core.material as MeshBasicMaterial).opacity = 0.8 * flick;
        (bm.glow.material as MeshBasicMaterial).opacity = (0.22 + 0.25 * buzz) * flick;
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
            pulses.setColorAt(pn, setC(c, mix(pick(BEAM, i), [255, 205, 70], m.monetize), 1 - ph));
            pn++;
          }
        }
      });
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
        dummy.position.set(s.bay.x0 + 0.35 + (k % 3) * 0.38, FLOOR_Y + 0.13 + Math.floor(k / 3) * 0.26, s.bay.z1 - 0.3);
        dummy.rotation.set(0, (hash01(k + 20) - 0.5) * 0.4, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        crates.setMatrixAt(k, dummy.matrix);
      }
      crates.instanceMatrix.needsUpdate = true;

      // Cooling fans spin; expansion plots breathe when affordable.
      if (!rm) for (let i = 0; i < fans.length; i++) fans[i]!.rotation.z = t / 260 + i;
      for (const p of plotMeshes) {
        // Affordability moves with money every tick: recolour live, never rebuild.
        const aff = m.sides.find((q) => q.id === p.id)?.affordable ?? false;
        const accent: RGB = aff ? [80, 220, 150] : [150, 162, 184];
        setC(p.mat.color, accent);
        setC(p.edgeMat.color, accent);
        for (const plus of p.plus) setC((plus.material as MeshBasicMaterial).color, accent);
        const pulse = aff && !rm ? 0.5 + 0.5 * Math.sin(t / 360) : aff ? 1 : 0.4;
        p.mat.opacity = 0.08 + 0.14 * pulse;
        p.edgeMat.opacity = 0.35 + 0.5 * pulse;
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
          const k = rm ? 1 : easeOut((t - focusFrom.at) / 520);
          controls.target.lerpVectors(focusFrom.t, focusTo.t, k);
          camera.zoom = focusFrom.z + (focusTo.z - focusFrom.z) * k;
          camera.updateProjectionMatrix();
          if (k >= 1) { focusFrom = null; focusTo = null; }
        }
        const b = s.bounds;
        controls.target.x = Math.max(b.x0 - 1, Math.min(b.x1 + 1, controls.target.x));
        controls.target.z = Math.max(b.z0 - 1, Math.min(b.z1 + 1, controls.target.z));
        controls.target.y = 0;
        controls.update();
      } else if (!rm) {
        const az = Math.PI / 4 + 0.045 * Math.sin(t / 15000);
        if (Math.abs(az - azimuth) > 1e-4) {
          azimuth = az;
          tmp.set(Math.sin(POLAR) * Math.sin(azimuth), Math.cos(POLAR), Math.sin(POLAR) * Math.cos(azimuth));
          camera.position.copy(target).addScaledVector(tmp, CAM_R);
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
        // Keep the current view; only the aspect changes.
        const aspect = cssW / cssH;
        const halfH = (camera.top - camera.bottom) / 2;
        const cy = (camera.top + camera.bottom) / 2, cx = (camera.left + camera.right) / 2;
        camera.left = cx - halfH * aspect; camera.right = cx + halfH * aspect;
        camera.top = cy + halfH; camera.bottom = cy - halfH;
        camera.updateProjectionMatrix();
      } else fitCamera();
    },

    pick(x, y) {
      if (!model || !spec) return null;
      const ray = new Raycaster();
      ray.setFromCamera(new Vector2((x / cssW) * 2 - 1, -(y / cssH) * 2 + 1), camera);
      const plotFills = plotMeshes.map((p) => p.fill);
      // The people move every frame; their instanced bounds must be current for the ray.
      agentProxy.computeBoundingSphere();
      const hits = ray.intersectObjects([chenProxy, agentProxy, rackBody, ...plotFills], false);
      for (const h of hits) {
        if (h.object === chenProxy && chen.visible) return { kind: "chen" };
        if (h.object === agentProxy && h.instanceId !== undefined) return { kind: "agent", index: h.instanceId };
        if (h.object === rackBody && h.instanceId !== undefined) {
          const r = spec.racks[h.instanceId];
          if (r) {
            const inc = model.incidents.find((x) => x.rackIndex === r.index && !x.worked);
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
          const inc = model.incidents.find((x) => x.rackIndex === r.index && !x.worked);
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
        if (r) at = new Vector3(r.x, 0, r.z);
      } else if (p.kind === "agent") {
        m4.identity();
        agentProxy.getMatrixAt(p.index, m4);
        at = new Vector3().setFromMatrixPosition(m4).setY(0);
      } else if (p.kind === "chen") at = chen.position.clone().setY(0);
      if (!at) return;
      focusFrom = { t: controls.target.clone(), z: camera.zoom, at: performance.now() };
      focusTo = { t: at, z: Math.max(camera.zoom, 2.4) };
    },

    agentScreen(i) {
      if (!model || i >= Math.min(MAX_PEOPLE, model.agents.length)) return null;
      m4.identity();
      heads.getMatrixAt(i, m4);
      const v = new Vector3().setFromMatrixPosition(m4);
      v.y += 0.2;
      v.project(camera);
      if (v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) return null;
      return { x: ((v.x + 1) / 2) * cssW, y: ((1 - v.y) / 2) * cssH };
    },

    zoom() {
      return camera.zoom;
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
