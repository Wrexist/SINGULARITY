import type { HallModel, SideMarker, RigSlotView, AgentView, SkylineTower } from "./hallModel";

/**
 * Pure Canvas 2D renderer for the 2.5D hall. No React, no image assets — every
 * pixel is parametric (CLAUDE.md hard rule + GDD §5). Quality comes from
 * gradient-shaded faces, server-unit detail, rim lighting, floor light-spill, a
 * lit room, particles, and clickable per-side expansion markers — not textures.
 */

export interface DrawOpts {
  width: number; // CSS px
  height: number;
  timeMs: number;
  reducedMotion: boolean;
  spawnFrom: number;
  spawnT: number; // 0..1
  burst: number; // 1 just after a claim → 0
  dpr: number;
  /** Cosmetic rack skin id (R6.3) — recolours the rack bodies. Undefined/"classic"
   *  is identity, so the default render is byte-identical. */
  rackSkin?: string;
  /** Rack-tap micro-interaction: the tapped rack's index + a 1→0 decay, driving
   *  a brief LED flicker so the hall answers the touch. Undefined is identity. */
  tapFlash?: { index: number; t: number };
  /** IDEAS #3 — a component purchase arriving: 1 just after the buy → 0. A pale
   *  crate dollies in along the front edge and fades. Undefined/0 is identity. */
  delivery?: number;
}

type Pt = { x: number; y: number };
type RGB = [number, number, number];

export interface Layout {
  iso: (gx: number, gy: number) => Pt;
  tileW: number;
  tileH: number;
  originY: number;
  gxMin: number;
  gyMin: number;
  gxMax: number;
  gyMax: number;
}

export interface PlacedMarker extends SideMarker {
  quad: [Pt, Pt, Pt, Pt];
  centroid: Pt;
}

const TIER_BASE: RGB[] = [
  [52, 210, 126], // consumer GPU — green
  [63, 134, 240], // server GPU — blue
  [155, 81, 224], // TPU pod — violet
];

// Lightened, de-saturated room palettes (visibility pass). The hall used to be
// near-black navy that read as a "dark blue spot"; these slate tones keep enough
// depth for the glowing racks to pop while sitting comfortably in the light app.
const ERA_BG: [string, string][] = [
  ["#2a3046", "#343c56"], // 0 Garage Closet — slate
  ["#283454", "#33426c"], // 1 Funded Startup — blue
  ["#322a4d", "#403962"], // 2 Scale-Up Lab — violet
  ["#1f3a42", "#27525c"], // 3 Frontier Lab — teal
  ["#2b2a55", "#3a3a78"], // 4 Hyperscaler — royal indigo
  ["#3a3470", "#5848a8"], // 5 Post-Singularity — luminous iridescent violet
];
const ERA_FLOOR: RGB[] = [
  [56, 64, 92],
  [54, 70, 110],
  [70, 60, 104],
  [48, 92, 104], // 3 teal
  [64, 64, 124], // 4 indigo
  [96, 82, 168], // 5 post-singularity — bright iridescent
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const shade = (c: RGB, f: number): RGB => [clamp(c[0] * f, 0, 255), clamp(c[1] * f, 0, 255), clamp(c[2] * f, 0, 255)];
const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1)})`;

const tierBase = (tier: number): RGB => TIER_BASE[tier] ?? TIER_BASE[0]!;

// Bare Metal grade flair — the fitted part's glow colour by grade
// (1 standard = warm white · 2 enterprise = cyan · 3 prototype = violet).
const GRADE_GLOW: RGB[] = [
  [255, 228, 180],
  [255, 228, 180],
  [96, 224, 255],
  [208, 144, 255],
];
const gradeGlow = (grade: number): RGB => GRADE_GLOW[clamp(grade, 1, 3)] ?? GRADE_GLOW[1]!;

// --- Rack skins (R6.3): a pure HSL transform on the tier base colour. Applied to the
// ONE base RGB each rack derives from (faces, LEDs, spill, rim all follow), so a skin
// recolours the whole rack consistently while preserving per-tier hue contrast. An
// absent/"classic" id is identity → the default render is byte-identical. ---
const SKIN_TINTS: Record<string, { h?: number; s?: number; l?: number }> = {
  mono: { s: 0.1, l: 0.95 },
  frost: { h: 35, s: 1.0, l: 1.12 },
  ember: { h: -120, s: 1.25, l: 1.0 },
  synth: { h: 150, s: 1.3, l: 1.05 },
  aurora: { h: 80, s: 1.4, l: 1.08 },
  gold: { h: -105, s: 1.1, l: 1.05 },
};

function rgbToHsl(c: RGB): [number, number, number] {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

function skinTint(base: RGB, skinId?: string): RGB {
  const t = skinId ? SKIN_TINTS[skinId] : undefined;
  if (!t) return base; // classic / unknown → identity
  const [h, s, l] = rgbToHsl(base);
  return hslToRgb(h + (t.h ?? 0), clamp(s * (t.s ?? 1), 0, 1), clamp(l * (t.l ?? 1), 0, 1));
}
const eraBg = (era: number): [string, string] => ERA_BG[era] ?? ERA_BG[0]!;
const eraFloor = (era: number): RGB => ERA_FLOOR[era] ?? ERA_FLOOR[0]!;

/** Shared isometric layout — sizes/centres the (possibly offset) grid to fit. */
export function computeLayout(cols: number, rows: number, gxMin: number, gyMin: number, W: number, H: number): Layout {
  const gxMax = gxMin + cols, gyMax = gyMin + rows;
  const span = cols + rows;
  const tileW = Math.min((1.84 * W) / span, (2 * H) / span, 64);
  const tileH = tileW / 2;
  // Centre the grid (its own bounds, so directional growth shifts everything).
  const cgx = gxMin + cols / 2, cgy = gyMin + rows / 2;
  const originX = W / 2 - (cgx - cgy) * (tileW / 2);
  const originY = H * 0.5 - (cgx + cgy) * (tileH / 2);
  const iso = (gx: number, gy: number): Pt => ({
    x: originX + (gx - gy) * (tileW / 2),
    y: originY + (gx + gy) * (tileH / 2),
  });
  return { iso, tileW, tileH, originY, gxMin, gyMin, gxMax, gyMax };
}

/** The four side-expansion affordances, as screen polygons (draw + hit-test). */
export function expansionMarkers(model: HallModel, W: number, H: number): PlacedMarker[] {
  const L = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);
  const { gxMin, gyMin, gxMax, gyMax, iso } = L;
  const d = 1.0; // strip depth in tiles
  const quads: Record<string, [Pt, Pt, Pt, Pt]> = {
    n: [iso(gxMin, gyMin - d), iso(gxMax, gyMin - d), iso(gxMax, gyMin), iso(gxMin, gyMin)],
    s: [iso(gxMin, gyMax), iso(gxMax, gyMax), iso(gxMax, gyMax + d), iso(gxMin, gyMax + d)],
    e: [iso(gxMax, gyMin), iso(gxMax + d, gyMin), iso(gxMax + d, gyMax), iso(gxMax, gyMax)],
    w: [iso(gxMin - d, gyMin), iso(gxMin, gyMin), iso(gxMin, gyMax), iso(gxMin - d, gyMax)],
  };
  return model.sides.map((s) => {
    const quad = quads[s.dir]!;
    const centroid = { x: (quad[0].x + quad[2].x) / 2, y: (quad[0].y + quad[2].y) / 2 };
    return { ...s, quad, centroid };
  });
}

/** The integer tile coordinates racks fill, in paint order: row-major, back-to-front,
 *  skipping the partition walkways. SINGLE SOURCE for rack placement — both the
 *  renderer (drawHallDynamic) and hit-testing (rackHitAreas) consume this, so a tap
 *  can never land on a different tile than the rack the player sees. Pure on the model. */
export function rackTileOrder(model: HallModel): { gx: number; gy: number }[] {
  const gxMax = model.gxMin + model.cols, gyMax = model.gyMin + model.rows;
  const tiles: { gx: number; gy: number }[] = [];
  for (let gy = model.gyMin; gy < gyMax; gy++) {
    if (gy === model.splitGy) continue;
    for (let gx = model.gxMin; gx < gxMax; gx++) {
      if (gx === model.splitGx) continue;
      tiles.push({ gx, gy });
    }
  }
  return tiles;
}

/** A tappable rack: its draw index, tier, and the floor-diamond polygon it sits
 *  on (the hit target). Built from the SAME `rackTileOrder` the renderer uses, so a
 *  tap maps to the rack the player sees. Pure — safe to compute on demand for hit-test. */
export interface RackHit {
  index: number;
  tier: number;
  quad: [Pt, Pt, Pt, Pt];
  centroid: Pt;
}

export function rackHitAreas(model: HallModel, W: number, H: number): RackHit[] {
  const { iso } = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);
  const tiles = rackTileOrder(model);
  const hits: RackHit[] = [];
  for (let i = 0; i < model.racks.length && i < tiles.length; i++) {
    const { gx, gy } = tiles[i]!;
    const quad: [Pt, Pt, Pt, Pt] = [iso(gx, gy), iso(gx + 1, gy), iso(gx + 1, gy + 1), iso(gx, gy + 1)];
    const centroid = { x: (quad[0].x + quad[2].x) / 2, y: (quad[0].y + quad[2].y) / 2 };
    hits.push({ index: i, tier: model.racks[i]!.tier, quad, centroid });
  }
  return hits;
}

export function pointInPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The STATIC layer: sky, room shell, and floor. These depend only on the room
 * size + era, not on the animation clock or rack count — so HallCanvas paints
 * this once into an offscreen buffer and blits it each frame instead of
 * rebuilding ~a dozen gradients and the whole floor grid 30–60×/sec (the main
 * source of the reported jank on mobile).
 */
export function drawHallStatic(ctx: CanvasRenderingContext2D, model: HallModel, W: number, H: number): void {
  const [bg0, bg1] = eraBg(model.era);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, bg0);
  sky.addColorStop(1, bg1);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const L = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);

  // Hero backlight — a soft, era-tinted bloom rising from behind the rack cluster, so
  // the floor of glowing hardware reads as lit-from-within depth instead of a flat
  // panel. Cheap (one gradient) and lives in the cached static layer → zero per-frame cost.
  {
    const fc = eraFloor(model.era);
    const cx = W / 2, cy = H * 0.44;
    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
    bloom.addColorStop(0, rgba(shade(fc, 2.3), 0.22));
    bloom.addColorStop(0.55, rgba(shade(fc, 1.4), 0.09));
    bloom.addColorStop(1, rgba(fc, 0));
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, W, H);
  }

  // IDEAS #4 — the race on the horizon, behind the room shell.
  if (model.skyline.length > 0) drawSkyline(ctx, model.skyline, W, H, L);
  // Housings only — the spinning blades live in the dynamic layer (QW2) so the
  // fans actually turn while the room shell stays cached.
  drawRoom(ctx, L, model.era, H, model.coolingUnits);
  // Hyperscaler+ (era ≥ 4) earns real new geometry, not just a recolour: glowing power
  // bus-bars run the back walls — the "we bought a substation" energy the era is about.
  if (model.era >= 4) drawPowerBus(ctx, L, H, model.era);
  drawFloor(ctx, L, model.era);
  drawPartitions(ctx, L, model);
  // IDEAS #8/#6 — the run's charter hangs on the back-right wall; shipped
  // generations stand as trophy plinths along the back-left one.
  if (model.charter) drawCharterBanner(ctx, L, H, model.charter);
  if (model.wall.length > 0) drawLegacyWall(ctx, L, H, model.wall);

  // Vignette — gently darken the corners so the lit floor is the focus (depth + polish).
  // Drawn last in the STATIC layer, so it sits under the dynamic racks: the room and
  // floor edges fall away while the glowing hardware stays crisp and bright on top.
  const vig = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.74);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(6,8,16,0.36)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

/** IDEAS #4 — rival datacenter silhouettes on the horizon, height ∝ market
 *  share of the leader. Your own tower (violet, beacon-tipped) rises among
 *  them; a press-blitzed rival's windows go dark for the run. Static — the
 *  cache key carries a coarse skyline signature. */
function drawSkyline(ctx: CanvasRenderingContext2D, towers: SkylineTower[], W: number, H: number, L: Layout): void {
  const n = towers.length;
  // Rest the towers on the horizon: the top line of the back walls.
  const baseY = Math.max(H * 0.1, L.iso(L.gxMin, L.gyMin).y - H * 0.22 + 2);
  const maxH = Math.min(H * 0.17, baseY - 6);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const tw = towers[i]!;
    const cx = W * (0.14 + (0.72 * (i + 0.5)) / n);
    const w = W * 0.052;
    const h = Math.max(6, maxH * tw.h);
    const body: RGB = tw.you ? [110, 84, 190] : [52, 58, 84];
    ctx.fillStyle = rgba(body, tw.dim ? 0.55 : 0.9);
    ctx.fillRect(cx - w / 2, baseY - h, w, h);
    // Rooftop detail: a beacon for you, an antenna stub for rivals.
    if (tw.you) {
      ctx.fillStyle = "rgba(190,150,255,0.95)";
      ctx.beginPath();
      ctx.arc(cx, baseY - h - 3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = rgba(body, 0.9);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, baseY - h); ctx.lineTo(cx, baseY - h - 4); ctx.stroke();
    }
    // Lit windows — blitzed rivals go dark (the comms team is sweating).
    if (!tw.dim) {
      ctx.fillStyle = tw.you ? "rgba(220,190,255,0.8)" : "rgba(150,190,255,0.55)";
      const rows = Math.max(1, Math.floor(h / 7));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          if (((i * 7 + r * 3 + c) % 5) < 2) continue; // deterministic sparse lights
          ctx.fillRect(cx - w * 0.28 + c * w * 0.4, baseY - h + 3 + r * 7, Math.max(1, w * 0.14), 2);
        }
      }
    }
  }
  ctx.restore();
}

// IDEAS #8 — per-charter banner colours (flair only; unknown ids get slate).
const CHARTER_COLORS: Record<string, RGB> = {
  open_source: [90, 200, 140],
  bootstrapped: [240, 190, 90],
  moonshot: [140, 150, 255],
  data_monopoly: [170, 120, 255],
  cash_machine: [110, 220, 140],
  mad_science: [255, 120, 160],
  frugal_genius: [120, 210, 220],
};

/** IDEAS #8 — the run's charter as a hanging banner on the back-right wall:
 *  the generation's identity, visible every time you look at the room. */
function drawCharterBanner(ctx: CanvasRenderingContext2D, L: Layout, H: number, charter: { id: string; name: string }): void {
  const { iso, gxMin, gyMin, gxMax } = L;
  const a = iso(gxMin, gyMin), b = iso(gxMax, gyMin);
  const wallH = H * 0.22;
  const col = CHARTER_COLORS[charter.id] ?? [150, 160, 180];
  // Hang on the back-right wall at ~72% along, from just under the ceiling.
  const u = 0.72, w = 0.09;
  const p0 = lerp(a, b, u - w), p1 = lerp(a, b, u + w);
  const top = -0.92 * wallH, bot = -0.45 * wallH;
  const quad: Pt[] = [
    { x: p0.x, y: p0.y + top }, { x: p1.x, y: p1.y + top },
    { x: p1.x, y: p1.y + bot }, { x: p0.x, y: p0.y + bot },
  ];
  const g = ctx.createLinearGradient(0, p0.y + top, 0, p0.y + bot);
  g.addColorStop(0, rgba(col, 0.85));
  g.addColorStop(1, rgba(shade(col, 0.6), 0.7));
  poly(ctx, quad, g);
  // A notched banner tail + hanging rod.
  const mid = lerp({ x: p0.x, y: p0.y + bot }, { x: p1.x, y: p1.y + bot }, 0.5);
  poly(ctx, [quad[3]!, quad[2]!, { x: mid.x, y: mid.y + wallH * 0.08 }], rgba(shade(col, 0.55), 0.7));
  stroke(ctx, { x: p0.x - 2, y: p0.y + top }, { x: p1.x + 2, y: p1.y + top }, "rgba(255,255,255,0.35)", 1.5);
  // Monogram: the charter's initial.
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `700 ${Math.max(8, wallH * 0.16)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(charter.name.charAt(0).toUpperCase(), mid.x, mid.y - wallH * 0.16);
}

/** IDEAS #6 — the Legacy Wall: each shipped generation stands as a small plinth
 *  with a glowing model-core, era-tinted (ascension gens get a gold ring). The
 *  reset visibly ADDS to the room — prestige leaves a permanent trace. */
function drawLegacyWall(ctx: CanvasRenderingContext2D, L: Layout, H: number, wall: { era: number; asc: boolean }[]): void {
  const { iso, gxMin, gyMin, gyMax } = L;
  const wallH = H * 0.22;
  ctx.save();
  for (let i = 0; i < wall.length; i++) {
    const e = wall[i]!;
    // Mounted UP on the back-left wall, anchored from the FRONT (left-corner)
    // end so the newest trophies sit in the clear lower-left stretch — the top
    // corner end is covered by the hall-tag overlay on phones (QA finding).
    const step = (gyMax - gyMin - 1) / 9;
    const base = iso(gxMin, gyMax - 0.6 - i * step);
    const p: Pt = { x: base.x, y: base.y - wallH * 0.52 };
    const s = Math.max(3.2, L.tileW * 0.16);
    const eraCol = eraFloor(e.era);
    // Shelf bracket + plinth block.
    stroke(ctx, { x: p.x - s * 0.7, y: p.y + s * 0.55 }, { x: p.x + s * 0.7, y: p.y + s * 0.55 }, "rgba(255,255,255,0.25)", 1);
    ctx.fillStyle = rgb(shade(eraCol, 1.35));
    ctx.fillRect(p.x - s * 0.42, p.y - s * 0.55, s * 0.84, s * 1.1);
    ctx.fillStyle = rgb(shade(eraCol, 1.7));
    ctx.fillRect(p.x - s * 0.42, p.y - s * 0.55, s * 0.84, s * 0.2);
    // The model-core hologram above the plinth.
    const cy = p.y - s * 1.2;
    const glow = ctx.createRadialGradient(p.x, cy, 0, p.x, cy, s * 0.95);
    glow.addColorStop(0, rgba(shade(eraCol, 2.6), 0.95));
    glow.addColorStop(1, rgba(eraCol, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, cy, s * 0.95, 0, Math.PI * 2);
    ctx.fill();
    if (e.asc) {
      ctx.strokeStyle = "rgba(255,214,10,0.9)";
      ctx.lineWidth = Math.max(1, s * 0.14);
      ctx.beginPath();
      ctx.arc(p.x, cy, s * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Interior glass partition walls (Phase 2 multi-room): once the floor is expanded
 * it splits into rooms at the midpoint(s), drawn as low semi-transparent dividers
 * so the hall reads as a multi-room facility without occluding the racks.
 */
function drawPartitions(ctx: CanvasRenderingContext2D, L: Layout, model: HallModel): void {
  const { iso, tileH, gxMin, gyMin, gxMax, gyMax } = L;
  const base = eraFloor(model.era);
  const h = tileH * 2.0; // a partition wall, low enough not to bury the racks
  const rail: RGB = [120, 210, 255]; // cool cyan glow on the rails

  const wall = (p0: Pt, p1: Pt) => {
    // Floor seam: a bright walkway stripe under the divider.
    stroke(ctx, p0, p1, rgba(rail, 0.5), 3);
    const t0: Pt = { x: p0.x, y: p0.y - h }, t1: Pt = { x: p1.x, y: p1.y - h };
    const g = ctx.createLinearGradient(0, t0.y, 0, p0.y);
    g.addColorStop(0, rgba(shade(base, 2.1), 0.42));
    g.addColorStop(1, rgba(shade(base, 1.3), 0.14));
    poly(ctx, [p0, p1, t1, t0], g);
    // Vertical mullions for a server-room divider feel.
    const segs = 6;
    for (let i = 1; i < segs; i++) {
      const a = lerp(p0, p1, i / segs), b = lerp(t0, t1, i / segs);
      stroke(ctx, a, b, rgba(shade(base, 1.7), 0.2), 1);
    }
    stroke(ctx, t0, t1, rgba(rail, 0.7), 1.5); // glowing top rail
    stroke(ctx, p0, p1, "rgba(0,0,0,0.28)", 1); // base shadow
  };

  if (model.splitGx !== null) wall(iso(model.splitGx, gyMin), iso(model.splitGx, gyMax));
  if (model.splitGy !== null) wall(iso(gxMin, model.splitGy), iso(gxMax, model.splitGy));
}

/** The ANIMATED layer: drifting motes, racks, claim burst, expansion markers. */
export function drawHallDynamic(ctx: CanvasRenderingContext2D, model: HallModel, o: DrawOpts): void {
  const { width: W, height: H } = o;

  const L = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);
  const { iso, tileW, tileH, originY, gxMin, gyMin, gxMax, gyMax } = L;

  // "Lively" = a manual run OR a live product business. Keeps the hall breathing
  // between runs once you've shipped something, instead of going dead.
  const lively = model.active || model.busy;
  // The data pipeline thickens the motes — a cleaner pipeline is visibly busier air.
  drawMotes(ctx, W, H, originY, o.timeMs, lively, model.total, o.reducedMotion, 0.6 + model.dataFlow * 0.7);

  // Fan blades spin over the cached housings (the walls sit behind the racks).
  drawCoolingFans(ctx, L, H, model.coolingUnits, o.timeMs, o.reducedMotion);

  // IDEAS #3 — the loading dock: unmarked crates linger by the entrance while
  // regulatory Heat is up (the dark-web supply chain, visibly not-cleaned-up),
  // and a fresh component purchase dollies in as a pale crate.
  if (model.heatCrates > 0) drawHeatCrates(ctx, L, model.heatCrates, o.timeMs, o.reducedMotion);
  if (o.delivery && o.delivery > 0 && !o.reducedMotion) drawDelivery(ctx, L, o.delivery);

  // Place racks in orderly rows, back-to-front (valid iso paint order). Tile order
  // comes from the shared rackTileOrder helper (also used for hit-testing) so the
  // boxes drawn here and the tap targets can never drift apart.
  const tiles: Pt[] = rackTileOrder(model).map(({ gx, gy }) => iso(gx + 0.5, gy + 0.5));

  const t = o.timeMs;
  for (let i = 0; i < model.racks.length && i < tiles.length; i++) {
    const rack = model.racks[i]!;
    const c = tiles[i]!;
    let scale = 1;
    let powerOn = 0;
    if (!o.reducedMotion && i >= o.spawnFrom && o.spawnT < 1) {
      scale = easeOut(Math.max(0.0001, o.spawnT));
      powerOn = 1 - o.spawnT;
    }
    const blink = o.reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(t / 280 + i * 1.7);
    // A manual run drives a strong work pulse; a running product business keeps a
    // gentler ambient pulse so the racks always look like they're computing.
    const basePulse = o.reducedMotion
      ? 0
      : model.active
        ? 0.5 + 0.5 * Math.sin(t / 150 + i)
        : model.busy
          ? 0.22 + 0.22 * Math.sin(t / 320 + i)
          : 0;
    // Overclock manifests as a hotter rack: lift the work-pulse (which already
    // drives rim/LED glow) so the upgrade you bought is visible in the room.
    // Rig Bay components manifest as real geometry (Bare Metal, below) plus a
    // touch of extra pulse for a fully-fitted tier.
    const rig = model.rigs?.[rack.tier] ?? null;
    const fill = rig && rig.length > 0 ? rig.filter((s) => s.grade > 0).length / rig.length : 0;
    let workPulse = Math.min(1.2, basePulse + model.overclock * 0.45 + fill * 0.3);
    let blinkNow = blink;
    // Tap answer: the touched rack flickers its LEDs hard for a beat (pure
    // juice, so reduced-motion skips it entirely).
    if (!o.reducedMotion && o.tapFlash && o.tapFlash.index === i) {
      const tf = o.tapFlash.t;
      blinkNow = Math.max(blinkNow, tf * (0.65 + 0.35 * Math.sin(t / 38)));
      workPulse = Math.min(1.4, workPulse + tf * 0.8);
    }
    drawRack(ctx, c.x, c.y, tileW, tileH, rack.tier, rack.density, scale, blinkNow, workPulse, model.active, powerOn, o.rackSkin, rig, t, o.reducedMotion);
  }

  // IDEAS #5 — incident theater: bad events smoke on a specific rack (tap it to
  // work the problem); good events draw a small crowd of onlookers out front.
  for (const inc of model.incidents) {
    const c = tiles[inc.rackIndex];
    const rack = model.racks[inc.rackIndex];
    if (!c || !rack) continue;
    const ph = tileH * (1.1 + rack.tier * 0.5) * (0.72 + 0.28 * rack.density);
    drawIncident(ctx, c.x, c.y - ph, tileW, o.timeMs, inc.worked, o.reducedMotion);
  }
  if (model.crowd > 0) drawCrowd(ctx, L, model.crowd, o.timeMs, o.reducedMotion);

  // C2 — thermal stress: as power draw approaches/exceeds capacity the racks run hot.
  // A red bloom (+ rising heat-haze bands when motion is on) washes the rack band so
  // the power soft-cap is legible without opening a panel. Identity below the knee.
  if (model.loadFrac > THERMAL_KNEE) {
    const intensity = clamp((model.loadFrac - THERMAL_KNEE) / 0.6, 0, 1);
    drawThermalStress(ctx, W, H, originY, o.timeMs, intensity, o.reducedMotion);
  }

  // C2 — product "uplink beams": one glowing column per live product, rising from the
  // back of the floor, height ∝ revenue. Drawn before staff so agents read in front.
  if (model.beams.length > 0) drawBeams(ctx, L, model.beams, model.beamBuzz, o.timeMs, o.reducedMotion);

  // C2/#7 — staff on the floor: real employees working the room (tap for their card).
  if (model.agents.length > 0) drawStaffAgents(ctx, model.agents, agentSpots(model, W, H, o.timeMs, o.reducedMotion), o.timeMs, o.reducedMotion);

  // IDEAS #2 — the inspector patrols once scrutiny has a name on it.
  const chen = chenSpot(model, W, H, o.timeMs, o.reducedMotion);
  if (chen) drawChen(ctx, chen, o.timeMs, o.reducedMotion);

  // C2 — faction tint: a faint room-wide wash by alignment (doomer cool, accel warm).
  if (Math.abs(model.alignment) > 0.15) drawAlignmentTint(ctx, W, H, model.alignment);

  // C2e — Post-Singularity transformation: at the AGI era the hall transcends — an
  // iridescent ceiling bloom + a rising vortex of data funnelling into a singularity.
  if (model.era >= 5) drawSingularityVortex(ctx, W, H, originY, o.timeMs, o.reducedMotion);

  // Auto-train "ops bot": a small glowing dot that patrols the floor, so the
  // automation you bought is something you can see working. Additive, drawn over
  // the racks; reduced-motion hides it (it's pure motion juice).
  if (model.autoBot && !o.reducedMotion && model.total > 0) {
    const cx = (gxMin + gxMax) / 2;
    const cyy = (gyMin + gyMax) / 2;
    const r = Math.max(0.6, (gxMax - gxMin) / 2 - 0.5);
    const bot = iso(cx + Math.cos(t / 900) * r, cyy + Math.sin(t / 900) * r * 0.7);
    const glow = ctx.createRadialGradient(bot.x, bot.y, 0, bot.x, bot.y, 9);
    glow.addColorStop(0, "rgba(120,230,180,0.9)");
    glow.addColorStop(1, "rgba(120,230,180,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bot.x, bot.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Data flowing through a live business: bright packets stream along the front
  // cable run (era ≥ 1, where the cable exists).
  if (lively && model.era >= 1 && !o.reducedMotion) drawDataFlow(ctx, L, o.timeMs, model.active);

  if (lively || !o.reducedMotion) {
    drawMotes(ctx, W, H, originY, o.timeMs, lively, model.total, o.reducedMotion, 1);
  }
  if (o.burst > 0 && !o.reducedMotion) drawClaimBurst(ctx, W, H, originY, o.burst);

  // Expansion affordances on each side (drawn over the floor).
  drawMarkers(ctx, expansionMarkers(model, W, H), o.timeMs, o.reducedMotion);

  if (model.total === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 13px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Your empty server closet. Buy a rack to fill it.", W / 2, H - 14);
  }
}

function drawMarkers(ctx: CanvasRenderingContext2D, markers: PlacedMarker[], t: number, reducedMotion: boolean): void {
  ctx.save();
  ctx.textAlign = "center";
  for (const m of markers) {
    if (m.maxed) continue;
    const accent: RGB = m.affordable ? [80, 220, 150] : [150, 162, 184];
    const pulse = m.affordable && !reducedMotion ? 0.5 + 0.5 * Math.sin(t / 360) : m.affordable ? 1 : 0.55;

    // Ghost tile fill
    ctx.fillStyle = rgba(accent, 0.06 + 0.08 * pulse);
    poly(ctx, m.quad, rgba(accent, 0.06 + 0.08 * pulse));

    // Animated dashed border
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = reducedMotion ? 0 : -(t / 40) % 11;
    ctx.strokeStyle = rgba(accent, 0.35 + 0.4 * pulse);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(m.quad[0].x, m.quad[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(m.quad[i]!.x, m.quad[i]!.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // "+" and cost
    const { x, y } = m.centroid;
    const s = 5;
    ctx.strokeStyle = rgba(accent, 0.7 + 0.3 * pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - s, y - 5); ctx.lineTo(x + s, y - 5);
    ctx.moveTo(x, y - 5 - s); ctx.lineTo(x, y - 5 + s);
    ctx.stroke();
    ctx.fillStyle = rgba(accent, m.affordable ? 0.95 : 0.7);
    ctx.font = "700 10px -apple-system, system-ui, sans-serif";
    ctx.fillText(fmtShort(m.cost), x, y + 12);
  }
  ctx.restore();
}

function fmtShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function drawRoom(ctx: CanvasRenderingContext2D, L: Layout, era: number, H: number, units: number): void {
  const { iso, gxMin, gyMin, gxMax, gyMax } = L;
  const a = iso(gxMin, gyMin), b = iso(gxMax, gyMin), d = iso(gxMin, gyMax);
  const base = eraFloor(era);
  const wallH = H * 0.22;
  const up = (p: Pt): Pt => ({ x: p.x, y: p.y - wallH });

  for (const [p0, p1, lit] of [[a, b, 1.05] as const, [a, d, 0.78] as const]) {
    const g = ctx.createLinearGradient(0, up(a).y, 0, a.y);
    g.addColorStop(0, rgb(shade(base, 0.62 * lit)));
    g.addColorStop(1, rgb(shade(base, 0.32 * lit)));
    poly(ctx, [p0, p1, up(p1), up(p0)], g);
  }

  const ceil = shade(base, 2.4);
  const ga = up(a), gb = up(b), gd = up(d);
  stroke(ctx, ga, gb, rgba(ceil, 0.55), 2);
  stroke(ctx, ga, gd, rgba(ceil, 0.4), 2);
  const bloom = ctx.createLinearGradient(0, ga.y, 0, ga.y + wallH * 0.5);
  bloom.addColorStop(0, rgba(ceil, 0.22));
  bloom.addColorStop(1, rgba(base, 0));
  poly(ctx, [ga, gb, { x: gb.x, y: gb.y + wallH * 0.5 }, { x: ga.x, y: ga.y + wallH * 0.5 }], bloom);
  poly(ctx, [ga, gd, { x: gd.x, y: gd.y + wallH * 0.5 }, { x: ga.x, y: ga.y + wallH * 0.5 }], bloom);

  for (const u of coolingUnitGeometry(L, H, units)) drawCoolingUnit(ctx, u.topL, u.topR, u.h);
}

/**
 * Shared cooling-unit placement. The housings are painted into the cached
 * static layer; the spinning blades redraw every frame in the dynamic layer —
 * both read THIS geometry so they can never drift apart.
 */
function coolingUnitGeometry(L: Layout, H: number, units: number): { topL: Pt; topR: Pt; h: number }[] {
  const { iso, gxMin, gyMin, gxMax, gyMax } = L;
  const a = iso(gxMin, gyMin), b = iso(gxMax, gyMin), d = iso(gxMin, gyMax);
  const wallH = H * 0.22;
  const wallPt = (p0: Pt, p1: Pt, u: number, v: number): Pt => {
    const bp = lerp(p0, p1, u);
    return { x: bp.x, y: bp.y - v * wallH };
  };
  const out: { topL: Pt; topR: Pt; h: number }[] = [];
  for (const [p0, p1] of [[a, b] as const, [a, d] as const]) {
    for (let k = 0; k < units; k++) {
      // Evenly space within the open (0,1) interval so the last unit never runs
      // off the wall edge (3 units → 0.25 / 0.5 / 0.75).
      const u = (k + 1) / (units + 1);
      out.push({ topL: wallPt(p0, p1, u - 0.06, 0.66), topR: wallPt(p0, p1, u + 0.06, 0.66), h: wallH * 0.3 });
    }
  }
  return out;
}

/** Housing + ring + status LED only — blades are dynamic (drawCoolingFans). */
function drawCoolingUnit(ctx: CanvasRenderingContext2D, topL: Pt, topR: Pt, h: number): void {
  const bl: Pt = { x: topL.x, y: topL.y + h };
  const br: Pt = { x: topR.x, y: topR.y + h };
  const g = ctx.createLinearGradient(0, topL.y, 0, bl.y);
  g.addColorStop(0, "rgb(70,78,96)");
  g.addColorStop(1, "rgb(40,46,60)");
  poly(ctx, [topL, topR, br, bl], g);
  stroke(ctx, topL, topR, "rgba(255,255,255,0.18)", 1);

  const cx = (topL.x + br.x) / 2, cy = (topL.y + br.y) / 2;
  const r = Math.min(Math.abs(topR.x - topL.x), h) * 0.32;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "rgba(120,255,180,0.85)";
  ctx.beginPath();
  ctx.arc(topL.x + (br.x - topL.x) * 0.16, topL.y + h * 0.22, Math.max(0.8, r * 0.12), 0, Math.PI * 2);
  ctx.fill();
}

/** The spinning fan blades — redrawn per frame over the cached housings (QW2).
 *  Reduced motion keeps a still blade set so the units still read as fans. */
function drawCoolingFans(ctx: CanvasRenderingContext2D, L: Layout, H: number, units: number, t: number, reducedMotion: boolean): void {
  const rot = reducedMotion ? 0 : (t / 240) % (Math.PI * 2);
  for (const u of coolingUnitGeometry(L, H, units)) {
    const br: Pt = { x: u.topR.x, y: u.topR.y + u.h };
    const cx = (u.topL.x + br.x) / 2, cy = (u.topL.y + br.y) / 2;
    const r = Math.min(Math.abs(u.topR.x - u.topL.x), u.h) * 0.32;
    ctx.strokeStyle = "rgba(180,210,255,0.55)";
    ctx.lineWidth = Math.max(1, r * 0.18);
    for (let i = 0; i < 3; i++) {
      const ang = rot + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * r * 0.82, cy + Math.sin(ang) * r * 0.82);
      ctx.stroke();
    }
  }
}

/** Hyperscaler+ power infrastructure: a bright bus-bar along each back wall with
 *  evenly-spaced tap-off nodes — new geometry that makes crossing into Era 4 (and the
 *  Era-5 payoff) read as a scale change, not a palette swap. Static (cached). */
function drawPowerBus(ctx: CanvasRenderingContext2D, L: Layout, H: number, era: number): void {
  const { iso, gxMin, gyMin, gxMax, gyMax } = L;
  const a = iso(gxMin, gyMin), b = iso(gxMax, gyMin), d = iso(gxMin, gyMax);
  const wallH = H * 0.22;
  // Gold conduit at Hyperscaler (energy deals); it shifts to hot iridescent at Era 5.
  const col: RGB = era >= 5 ? [180, 150, 255] : [255, 208, 120];
  const at = (p0: Pt, p1: Pt, u: number, v: number): Pt => {
    const bp = lerp(p0, p1, u);
    return { x: bp.x, y: bp.y - v * wallH };
  };
  for (const [p0, p1] of [[a, b] as const, [a, d] as const]) {
    const y0 = at(p0, p1, 0.04, 0.5), y1 = at(p0, p1, 0.96, 0.5);
    stroke(ctx, y0, y1, rgba(col, 0.22), 5); // outer glow
    stroke(ctx, y0, y1, rgba(col, 0.85), 2); // bright core
    const nodes = 5;
    for (let k = 1; k <= nodes; k++) {
      const p = at(p0, p1, k / (nodes + 1), 0.5);
      ctx.fillStyle = rgba(shade(col, 1.3), 0.95);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // a short drop lead toward the floor, hinting the feed to the racks below
      stroke(ctx, p, at(p0, p1, k / (nodes + 1), 0.24), rgba(col, 0.4), 1.2);
    }
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, L: Layout, era: number): void {
  const { iso, gxMin, gyMin, gxMax, gyMax } = L;
  const a = iso(gxMin, gyMin), b = iso(gxMax, gyMin), c = iso(gxMax, gyMax), d = iso(gxMin, gyMax);
  const base = eraFloor(era);

  const g = ctx.createLinearGradient(0, a.y, 0, c.y);
  g.addColorStop(0, rgb(shade(base, 1.15)));
  g.addColorStop(1, rgb(shade(base, 0.7)));
  poly(ctx, [a, b, c, d], g);

  const cx = (a.x + c.x) / 2, cy = (a.y + c.y) / 2;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, (c.y - a.y) * 0.9);
  glow.addColorStop(0, rgba(shade(base, 1.7), 0.35));
  glow.addColorStop(1, rgba(base, 0));
  poly(ctx, [a, b, c, d], glow);

  ctx.lineWidth = 1;
  for (let gx = gxMin; gx <= gxMax; gx++) {
    const p0 = iso(gx, gyMin), p1 = iso(gx, gyMax);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
  for (let gy = gyMin; gy <= gyMax; gy++) {
    const p0 = iso(gxMin, gy), p1 = iso(gxMax, gy);
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + 0.06 * ((gy - gyMin) / (gyMax - gyMin))})`;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.stroke();

  if (era >= 1) {
    const cable: RGB = [90, 210, 255];
    const e0 = iso(gxMin, gyMax - 0.12), e1 = iso(gxMax, gyMax - 0.12);
    stroke(ctx, e0, e1, rgba(cable, 0.28), 4);
    stroke(ctx, e0, e1, rgba(cable, 0.6), 1.5);
    for (let gx = gxMin + 1; gx < gxMax; gx++) {
      const p = iso(gx, gyMax - 0.12);
      ctx.fillStyle = rgba(cable, 0.8);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRack(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, tileW: number, tileH: number,
  tier: number, density: number, scale: number,
  blink: number, workPulse: number, active: boolean, powerOn: number,
  skin?: string,
  rig?: RigSlotView[] | null,
  t = 0,
  reducedMotion = false,
): void {
  const base = skinTint(tierBase(tier), skin);
  const led = shade(base, 2.0);
  const hw = (tileW / 2) * 0.64 * scale;
  const hh = (tileH / 2) * 0.64 * scale;
  const ph = tileH * (1.1 + tier * 0.5) * (0.72 + 0.28 * density) * scale;
  const detail = hw > 8.5;

  const bRight: Pt = { x: sx + hw, y: sy };
  const bBottom: Pt = { x: sx, y: sy + hh };
  const bLeft: Pt = { x: sx - hw, y: sy };
  const tTop: Pt = { x: sx, y: sy - hh - ph };
  const tRight: Pt = { x: sx + hw, y: sy - ph };
  const tBottom: Pt = { x: sx, y: sy + hh - ph };
  const tLeft: Pt = { x: sx - hw, y: sy - ph };

  if (detail) {
    const spill = (active ? 0.18 : 0.08) + 0.5 * powerOn + 0.12 * workPulse;
    const pool = ctx.createRadialGradient(sx, sy + hh * 0.2, 0, sx, sy + hh * 0.2, hw * 2.2);
    pool.addColorStop(0, rgba(led, clamp(spill, 0, 0.6)));
    pool.addColorStop(1, rgba(base, 0));
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(sx, sy + hh * 0.2, hw * 2.2, hh * 2.0, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.beginPath();
  ctx.ellipse(sx, sy + hh * 0.32, hw * 1.05, hh * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();

  if (detail) {
    gradFace(ctx, bLeft, bBottom, ph, shade(base, 0.92), shade(base, 0.5));
    gradFace(ctx, bBottom, bRight, ph, shade(base, 0.64), shade(base, 0.34));
    const topG = ctx.createLinearGradient(tTop.x, tTop.y, tBottom.x, tBottom.y);
    topG.addColorStop(0, rgb(shade(base, 1.42)));
    topG.addColorStop(1, rgb(shade(base, 1.08)));
    poly(ctx, [tLeft, tTop, tRight, tBottom], topG);
  } else {
    poly(ctx, [bLeft, bBottom, { x: bBottom.x, y: bBottom.y - ph }, { x: bLeft.x, y: bLeft.y - ph }], rgb(shade(base, 0.7)));
    poly(ctx, [bBottom, bRight, { x: bRight.x, y: bRight.y - ph }, { x: bBottom.x, y: bBottom.y - ph }], rgb(shade(base, 0.48)));
    poly(ctx, [tLeft, tTop, tRight, tBottom], rgb(shade(base, 1.25)));
    // Keep the fleet ALIVE at scale: below the detail threshold (huge floors, where
    // the LED strip and component bays are too small to draw) each rack still shows one
    // emissive LED, so a 300-rack hall twinkles instead of collapsing to flat dots.
    const lit = active ? 1 : ((blink * 0.8 + tier * 0.3) % 1 > 0.5 ? 0.9 : 0.3);
    const glow = Math.max(lit, powerOn * 0.8);
    ctx.fillStyle = rgba(led, clamp(glow, 0.22, 1));
    ctx.beginPath();
    ctx.ellipse(sx, sy - ph * 0.55, Math.max(0.9, hw * 0.2), Math.max(0.9, hw * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const rfp = (u: number, v: number): Pt => ({
    x: bBottom.x + (bRight.x - bBottom.x) * u,
    y: bBottom.y + (bRight.y - bBottom.y) * u - v * ph,
  });
  if (detail) {
    const units = clamp(3 + tier * 2 + Math.round(density * 2), 3, 9);
    for (let r = 0; r < units; r++) {
      const v0 = r / units;
      stroke(ctx, rfp(0.06, v0), rfp(0.94, v0), "rgba(0,0,0,0.22)", 1);
      const lit = (blink + r * 0.37) % 1 > 0.4;
      const aa = active ? Math.max(0.5, workPulse) : lit ? 0.95 : 0.22;
      const p = rfp(0.2, v0 + 0.5 / units);
      ctx.fillStyle = rgba(led, Math.max(aa, powerOn));
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Math.max(0.8, hw * 0.07), Math.max(0.8, hw * 0.07), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const colA = rfp(0.82, 0.06), colB = rfp(0.82, 0.94);
    const pcol = (active ? 0.55 : 0.3) + 0.4 * workPulse + 0.4 * powerOn;
    stroke(ctx, colA, colB, rgba(led, clamp(pcol, 0, 1)), Math.max(1, hw * 0.08));

    // ---- Bare Metal: component bays on the left face. Once the Rig Bay is
    // open every rack shows its sockets — an EMPTY bay is a dark open hole
    // (the fleet visibly wants parts), a fitted bay grows real geometry per
    // class: heatsink fins (accelerator), a spinning rack fan (cooling), or a
    // lit cable trunk dropping to the floor (interconnect). Grade = flair. ----
    if (rig && rig.length > 0) {
      const lfp = (u: number, v: number): Pt => ({
        x: bLeft.x + (bBottom.x - bLeft.x) * u,
        y: bLeft.y + (bBottom.y - bLeft.y) * u - v * ph,
      });
      for (let k = 0; k < rig.length; k++) {
        const slot = rig[k]!;
        const vTop = 0.8 - k * 0.27;
        const vBot = vTop - 0.19;
        const u0 = 0.14, u1 = 0.86;
        const quad: Pt[] = [lfp(u0, vBot), lfp(u1, vBot), lfp(u1, vTop), lfp(u0, vTop)];
        if (slot.grade === 0) {
          poly(ctx, quad, "rgba(8,10,16,0.55)");
          stroke(ctx, quad[3]!, quad[2]!, "rgba(255,255,255,0.16)", 1);
          stroke(ctx, quad[0]!, quad[1]!, "rgba(0,0,0,0.4)", 1);
          continue;
        }
        const glow = gradeGlow(slot.grade);
        poly(ctx, quad, rgba(shade(base, 0.5), 0.9));
        if (slot.cls === "accelerator") {
          for (let f = 0; f < 3; f++) {
            const v = vBot + ((f + 0.5) / 3) * (vTop - vBot);
            stroke(ctx, lfp(u0 + 0.07, v), lfp(u1 - 0.07, v), rgba(glow, clamp(0.5 + 0.4 * workPulse, 0, 1)), Math.max(1, hw * 0.06));
          }
        } else if (slot.cls === "cooling") {
          const c = lfp(0.5, (vTop + vBot) / 2);
          const r = Math.max(1.5, hw * 0.15);
          ctx.strokeStyle = rgba(glow, 0.75);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
          const rot = reducedMotion ? 0.6 : (t / 170) % (Math.PI * 2);
          for (let f = 0; f < 3; f++) {
            const ang = rot + (f * Math.PI * 2) / 3;
            stroke(ctx, c, { x: c.x + Math.cos(ang) * r * 0.8, y: c.y + Math.sin(ang) * r * 0.8 }, rgba(glow, 0.85), 1);
          }
        } else {
          // interconnect — cable trunk from the bay down to the floor.
          const from = lfp(0.5, vBot);
          const to: Pt = { x: sx - hw * 0.45, y: sy + hh * 0.8 };
          stroke(ctx, from, to, rgba(glow, 0.4), Math.max(1, hw * 0.07));
          if (!reducedMotion) {
            const tt = ((t / 900) % 1 + k * 0.37) % 1;
            const p = lerp(from, to, tt);
            ctx.fillStyle = rgba(glow, 0.9);
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, hw * 0.07), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  } else {
    const p = rfp(0.5, 0.5);
    ctx.fillStyle = rgba(led, active ? Math.max(0.5, workPulse) : 0.6);
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }

  stroke(ctx, tLeft, tTop, "rgba(255,255,255,0.28)", 1);
  stroke(ctx, tTop, tRight, "rgba(255,255,255,0.18)", 1);
  stroke(ctx, tLeft, tBottom, rgba(shade(base, 1.7), 0.5), 1);
  stroke(ctx, tRight, tBottom, rgba(shade(base, 1.3), 0.4), 1);
  stroke(ctx, bBottom, tBottom, rgba(shade(base, 1.4), 0.35), 1);

  if (powerOn > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * powerOn;
    ctx.fillStyle = rgb(led);
    ctx.beginPath();
    ctx.ellipse(sx, sy - ph * 0.55, hw * 2.4, ph * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function gradFace(ctx: CanvasRenderingContext2D, BL: Pt, BR: Pt, ph: number, top: RGB, bot: RGB): void {
  const tl: Pt = { x: BL.x, y: BL.y - ph };
  const tr: Pt = { x: BR.x, y: BR.y - ph };
  const midTop = lerp(tl, tr, 0.5);
  const midBot = lerp(BL, BR, 0.5);
  const g = ctx.createLinearGradient(midTop.x, midTop.y, midBot.x, midBot.y);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(bot));
  poly(ctx, [BL, BR, tr, tl], g);
}

function poly(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string | CanvasGradient): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function stroke(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string, w: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawClaimBurst(ctx: CanvasRenderingContext2D, W: number, H: number, originY: number, burst: number): void {
  const n = 30;
  const progress = 1 - burst;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const seed = ((i * 2654435761) % 1000) / 1000;
    const seed2 = ((i * 40503) % 997) / 997;
    const x = W * 0.5 + (seed - 0.5) * W * 0.6;
    const y = originY + H * 0.22 - progress * H * 0.55 * (0.6 + seed2 * 0.8);
    const a = burst * 0.95 * (1 - seed2 * 0.25);
    const col: RGB = i % 2 === 0 ? [50, 230, 145] : [185, 135, 255];
    const sz = 1.6 + seed * 2.2;
    ctx.fillStyle = rgba(col, a);
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Bright packets streaming along the front floor cable — the look of data
 *  moving through a running business. Cheap: a handful of dots along one segment. */
function drawDataFlow(ctx: CanvasRenderingContext2D, L: Layout, t: number, active: boolean): void {
  const { iso, gxMin, gxMax, gyMax } = L;
  const e0 = iso(gxMin, gyMax - 0.12), e1 = iso(gxMax, gyMax - 0.12);
  const span = Math.max(1, gxMax - gxMin);
  const n = Math.min(10, Math.max(3, Math.round(span * 1.4)));
  const col: RGB = [120, 230, 255];
  const speed = active ? 1600 : 2600;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const phase = (t / speed + i / n) % 1;
    const x = e0.x + (e1.x - e0.x) * phase;
    const y = e0.y + (e1.y - e0.y) * phase;
    // Fade in/out at the ends so packets don't pop at the edges.
    const a = Math.sin(phase * Math.PI) * (active ? 0.9 : 0.55);
    if (a <= 0.02) continue;
    ctx.fillStyle = rgba(col, a);
    ctx.beginPath();
    ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    ctx.fill();
    // Short comet trail.
    ctx.strokeStyle = rgba(col, a * 0.4);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - (e1.x - e0.x) * 0.03, y - (e1.y - e0.y) * 0.03);
    ctx.stroke();
  }
  ctx.restore();
}

/** Power load (draw/capacity) at which the thermal-stress overlay begins. */
const THERMAL_KNEE = 0.85;

/** C2 — a red thermal wash over the rack band, with rising heat-haze bands when
 *  motion is on. `intensity` 0..1 scales opacity. Reduced-motion → a static tint. */
function drawThermalStress(
  ctx: CanvasRenderingContext2D, W: number, H: number, originY: number,
  t: number, intensity: number, reducedMotion: boolean,
): void {
  const hot: RGB = [255, 92, 56];
  const bandTop = originY - H * 0.18;
  const bandH = H * 0.5;
  ctx.save();
  // Base red bloom over the rack band.
  const g = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandH);
  g.addColorStop(0, rgba(hot, 0));
  g.addColorStop(0.6, rgba(hot, 0.06 + 0.16 * intensity));
  g.addColorStop(1, rgba(hot, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, bandTop, W, bandH);
  // Rising heat-haze bands (skipped under reduced motion).
  if (!reducedMotion) {
    ctx.globalCompositeOperation = "lighter";
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const seed = ((i * 40503) % 97) / 97;
      const prog = ((t / (1400 + seed * 900)) + seed) % 1;
      const y = bandTop + bandH - prog * bandH;
      const wob = Math.sin(t / 220 + i) * 6;
      const a = Math.sin(prog * Math.PI) * 0.10 * intensity;
      if (a <= 0.005) continue;
      ctx.fillStyle = rgba(hot, a);
      ctx.fillRect(W * (0.2 + seed * 0.1) + wob, y, W * 0.5, 2.5);
    }
  }
  ctx.restore();
}

/** C2 — product uplink beams. One translucent gradient column per live product,
 *  rising from a back-floor anchor; height/alpha scale with the product's revenue
 *  share. Tier-cycled colours; a soft top bloom. Reduced-motion → no flicker. */
function drawBeams(ctx: CanvasRenderingContext2D, L: Layout, beams: number[], buzz: number[], t: number, reducedMotion: boolean): void {
  const cols: RGB[] = [[63, 134, 240], [155, 81, 224], [52, 210, 126], [245, 180, 10], [255, 99, 132]];
  const n = beams.length;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    // A product in its launch/viral "buzz" window surges: brighter, a touch taller, and
    // livelier — self-limiting (buzzSec decays to 0 over ~45s), so the room celebrates a
    // launch/viral spike then settles. `b` is 0 for a steady product → identical to before.
    const b = buzz[i] ?? 0;
    const intensity = Math.min(1.1, beams[i]! * (1 + 0.45 * b));
    // Anchor along the OPEN front edge (high gy) so beams rise over the room and read
    // clearly instead of hiding among the back racks. Spread left→right.
    const gx = L.gxMin + ((i + 0.5) / n) * (L.gxMax - L.gxMin);
    const base = L.iso(gx, L.gyMax - 0.35);
    const col = cols[i % cols.length]!;
    const h = (L.tileH * 9 + L.tileH * 26 * intensity);
    // Base flicker + a faster, stronger shimmer while buzzing (both off under reduced motion).
    const flick = reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t / 260 + i * 1.3) + (b > 0 ? b * 0.22 * (0.5 + 0.5 * Math.sin(t / 110 + i)) : 0);
    const w = Math.max(4, L.tileW * 0.2);
    const g = ctx.createLinearGradient(base.x, base.y, base.x, base.y - h);
    g.addColorStop(0, rgba(col, 0.55 * flick));
    g.addColorStop(0.45, rgba(col, 0.28 * flick));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(base.x - w / 2, base.y - h, w, h);
    // Base node + top bloom.
    ctx.fillStyle = rgba(col, 0.95 * flick);
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, w * 0.8, w * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(base.x, base.y - h, w * 0.6 * flick, 0, Math.PI * 2);
    ctx.fill();
    // Buzz: a few motes rising up the beam and fading — reads as "energy surging" during a
    // launch/viral moment. Only while buzzing and not reduced-motion; 3 dots, no allocations.
    if (b > 0.04 && !reducedMotion) {
      for (let s = 0; s < 3; s++) {
        const phase = ((t / 900) + s / 3 + i * 0.37) % 1; // 0 (base) → 1 (top)
        const sy = base.y - phase * h;
        const sx = base.x + Math.sin(phase * 6 + i) * w * 0.35;
        ctx.fillStyle = rgba(col, b * (1 - phase) * 0.75);
        ctx.beginPath();
        ctx.arc(sx, sy, w * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/** IDEAS #5 — a manifested incident: smoke puffs rising off the afflicted rack
 *  plus a red warn blink at its base. Worked incidents smoke at half intensity
 *  (you contained it; it still has to burn out). Reduced motion → static haze. */
function drawIncident(ctx: CanvasRenderingContext2D, x: number, topY: number, tileW: number, t: number, worked: boolean, reducedMotion: boolean): void {
  const strength = worked ? 0.4 : 1;
  ctx.save();
  if (reducedMotion) {
    // A static smudge + steady warn dot — state without motion.
    ctx.fillStyle = `rgba(30,26,34,${0.4 * strength})`;
    ctx.beginPath();
    ctx.ellipse(x, topY - tileW * 0.28, tileW * 0.3, tileW * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,90,70,${0.8 * strength})`;
    ctx.beginPath();
    ctx.arc(x + tileW * 0.2, topY + 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  // Three rising, growing, fading puffs (pure function of the clock).
  for (let k = 0; k < 3; k++) {
    const phase = ((t / 1400 + k / 3) % 1 + 1) % 1;
    const py = topY - phase * tileW * 0.85;
    const r = tileW * (0.1 + phase * 0.22);
    const a = (1 - phase) * 0.4 * strength;
    ctx.fillStyle = `rgba(34,30,40,${a})`;
    ctx.beginPath();
    ctx.ellipse(x + Math.sin((t / 600 + k) * 1.7) * tileW * 0.08, py, r, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Warn blink at the rack top edge.
  const blink = 0.4 + 0.6 * (Math.sin(t / 160) > 0 ? 1 : 0.2);
  ctx.fillStyle = `rgba(255,90,70,${blink * strength})`;
  ctx.beginPath();
  ctx.arc(x + tileW * 0.2, topY + 2, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** IDEAS #5 — hype made visible: a small crowd of onlookers pressed against the
 *  open front edge while a good-tone event runs. */
function drawCrowd(ctx: CanvasRenderingContext2D, L: Layout, n: number, t: number, reducedMotion: boolean): void {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const seed = ((i * 48271) % 997) / 997;
    const p = L.iso(L.gxMin + 1 + seed * (L.gxMax - L.gxMin - 2), L.gyMax + 0.7 + (i % 2) * 0.3);
    // Excited bob — faster than staff; still under reduced motion.
    const bob = reducedMotion ? 0 : Math.abs(Math.sin(t / 210 + i * 1.9)) * 2.2;
    const s = Math.max(2.6, L.tileW * 0.08);
    const body: RGB = i % 2 === 0 ? [200, 205, 220] : [170, 180, 205];
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.4, s, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(body, 0.9);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - s - bob, s * 0.8, s * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(shade(body, 1.2), 0.9);
    ctx.beginPath();
    ctx.arc(p.x, p.y - s * 2.3 - bob, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** IDEAS #3 — unmarked black crates stacked just outside the front-left floor
 *  lip. Count ∝ regulatory Heat, so a hot lab has a visibly un-audited pile by
 *  the door that melts away as it cools ("cold racks, cold trail"). */
function drawHeatCrates(ctx: CanvasRenderingContext2D, L: Layout, count: number, t: number, reducedMotion: boolean): void {
  // Size floor so a big hall's small tiles can't shrink the pile into noise
  // (QA finding: at 12×11 floors the crates vanished into the marker zone).
  const s = Math.max(7, L.tileW * 0.26);
  ctx.save();
  for (let i = 0; i < count; i++) {
    // Two columns of three ON the floor's front-left corner — racks fill
    // back-to-front, so this ground stays open until the room is truly full
    // (and the pile is drawn before racks, so a full floor occludes naturally).
    const row = i < 3 ? 0 : 1;
    const p = L.iso(L.gxMin + 0.35 + row * 0.6, L.gyMax - 0.4 - (i % 3) * 0.75);
    const h = s * (0.8 + ((i * 37) % 5) * 0.06);
    // Shadow + body + lid seam. Deliberately unbranded and slightly wrong-looking.
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + s * 0.18, s * 0.85, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgb(44,48,62)";
    ctx.fillRect(p.x - s * 0.6, p.y - h, s * 1.2, h);
    ctx.fillStyle = "rgb(64,69,88)";
    ctx.fillRect(p.x - s * 0.6, p.y - h, s * 1.2, h * 0.22);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - s * 0.6, p.y - h, s * 1.2, h);
    // A faint hazard blink on the pile's newest crate while it settles.
    if (i === count - 1) {
      const blink = reducedMotion ? 0.5 : 0.35 + 0.35 * Math.sin(t / 420);
      ctx.fillStyle = rgba([255, 120, 90], blink);
      ctx.fillRect(p.x + s * 0.28, p.y - h * 0.75, Math.max(1.2, s * 0.12), Math.max(1.2, s * 0.12));
    }
  }
  ctx.restore();
}

/** IDEAS #3 — a component purchase arriving: a pale crate slides in along the
 *  open front edge and fades as it "reaches the racks". Pure juice; the buy is
 *  already applied. */
function drawDelivery(ctx: CanvasRenderingContext2D, L: Layout, remaining: number): void {
  const done = 1 - remaining; // 0 → 1 across the slide
  const eased = easeOut(done);
  const from = L.iso(L.gxMax + 0.8, L.gyMax + 0.5);
  const to = L.iso(L.gxMin + (L.gxMax - L.gxMin) * 0.55, L.gyMax + 0.3);
  const p = lerp(from, to, eased);
  const s = L.tileW * 0.26;
  const alpha = remaining < 0.25 ? remaining / 0.25 : 1; // fade at arrival
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + s * 0.2, s * 0.9, s * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(214,206,192)"; // pale shipping crate
  ctx.fillRect(p.x - s * 0.65, p.y - s * 0.95, s * 1.3, s * 0.95);
  ctx.strokeStyle = "rgba(120,110,95,0.8)";
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - s * 0.65, p.y - s * 0.95, s * 1.3, s * 0.95);
  // Tape stripe + a little motion dust behind the dolly.
  ctx.fillStyle = "rgba(150,140,120,0.9)";
  ctx.fillRect(p.x - s * 0.08, p.y - s * 0.95, s * 0.16, s * 0.95);
  ctx.fillStyle = `rgba(255,255,255,${0.25 * alpha * (1 - eased)})`;
  ctx.beginPath();
  ctx.ellipse(p.x + s * 1.1, p.y, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A staff agent's ground position this frame — shared by the draw pass and the
 *  tap hit-test so the person you touch is the person whose card opens. */
export interface AgentSpot {
  x: number;
  y: number; // ground (shadow) y
  bob: number;
  s: number; // body half-width
  index: number;
}

/** IDEAS #7 — deterministic per-frame agent positions. Product-assigned people
 *  cluster at the base of THEIR product's uplink beam; the rest roam the open
 *  front strip. Pure function of (model, layout, clock). */
export function agentSpots(model: HallModel, W: number, H: number, t: number, reducedMotion: boolean): AgentSpot[] {
  const L = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);
  const beamsN = model.beams.length;
  const out: AgentSpot[] = [];
  for (let i = 0; i < model.agents.length; i++) {
    const a = model.agents[i]!;
    const seed = ((i * 2654435761) % 1000) / 1000;
    const seed2 = ((i * 40503) % 997) / 997;
    let gx: number, gy: number;
    if (a.beam !== null && a.beam < beamsN) {
      // Cluster at the assigned product's beam base (the org chart, spatially).
      const bgx = L.gxMin + ((a.beam + 0.5) / beamsN) * (L.gxMax - L.gxMin);
      gx = bgx + (seed - 0.5) * 0.9;
      gy = L.gyMax - 0.55 - seed2 * 0.5;
    } else {
      // Bias roamers to the OPEN front strip (high gy) so they read in the
      // clear foreground rather than vanishing between the back racks.
      gx = L.gxMin + 0.4 + seed * (L.gxMax - L.gxMin - 0.8);
      gy = L.gyMax - 0.4 - seed2 * 1.3;
    }
    const drift = reducedMotion ? 0 : Math.sin(t / 1500 + i * 2.1) * 0.18;
    const p = L.iso(gx + drift, gy);
    const bob = reducedMotion ? 0 : Math.sin(t / 380 + i) * 1.2;
    out.push({ x: p.x, y: p.y, bob, s: Math.max(3.2, L.tileW * 0.1), index: i });
  }
  return out;
}

/** C2/#7 — staff agents: small parametric figures working the floor, now with
 *  identity: team-tinted bodies (infra blue / product green), a golden sparkle
 *  for a 10× hire. Capped upstream (model.agents ≤ 14) for a clean read. */
function drawStaffAgents(ctx: CanvasRenderingContext2D, agents: AgentView[], spots: AgentSpot[], t: number, reducedMotion: boolean): void {
  ctx.save();
  for (const spot of spots) {
    const a = agents[spot.index];
    if (!a) continue;
    const { x: cx, s } = spot;
    const cy = spot.y - spot.bob;
    // Soft shadow.
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(spot.x, spot.y + s * 0.5, s * 1.1, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body (rounded) + head. Team colours; the 10× wears gold.
    const body: RGB = a.tenx
      ? [255, 208, 110]
      : a.team === "infra"
        ? (spot.index % 2 === 0 ? [120, 180, 255] : [150, 190, 250])
        : (spot.index % 2 === 0 ? [150, 220, 180] : [180, 150, 255]);
    ctx.fillStyle = rgb(body);
    ctx.beginPath();
    ctx.ellipse(cx, cy - s, s, s * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(shade(body, 1.25));
    ctx.beginPath();
    ctx.arc(cx, cy - s * 2.6, s * 0.78, 0, Math.PI * 2);
    ctx.fill();
    if (a.tenx) {
      // A tiny twinkle over the golden hire — insufferable, as documented.
      const tw = reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(t / 220 + spot.index);
      ctx.fillStyle = rgba([255, 240, 180], 0.5 + 0.5 * tw);
      const sy = cy - s * 3.8;
      ctx.beginPath();
      ctx.moveTo(cx, sy - s * 0.5);
      ctx.lineTo(cx + s * 0.18, sy);
      ctx.lineTo(cx, sy + s * 0.5);
      ctx.lineTo(cx - s * 0.18, sy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** IDEAS #2 — Supervisor Chen's position: a slow patrol along the open front
 *  edge (still, mid-front, under reduced motion). Null when the lab is clean. */
export function chenSpot(model: HallModel, W: number, H: number, t: number, reducedMotion: boolean): { x: number; y: number; s: number } | null {
  if (!model.regulator) return null;
  const L = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);
  const u = reducedMotion ? 0.5 : 0.5 + 0.42 * Math.sin(t / 2600);
  const p = L.iso(L.gxMin + u * (L.gxMax - L.gxMin), L.gyMax - 0.18);
  return { x: p.x, y: p.y, s: Math.max(3.8, L.tileW * 0.115) };
}

/** IDEAS #2 — the inspector herself: dark suit, pale head, a clipboard she is
 *  definitely writing your name on. Distinct from staff so she reads as an
 *  outsider in the room. */
function drawChen(ctx: CanvasRenderingContext2D, spot: { x: number; y: number; s: number }, t: number, reducedMotion: boolean): void {
  const { x: cx, y, s } = spot;
  const bob = reducedMotion ? 0 : Math.sin(t / 520) * 0.8;
  const cy = y - bob;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, y + s * 0.5, s * 1.2, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // Suit (near-black slate — nobody else in the room wears one).
  const suit: RGB = [58, 64, 82];
  ctx.fillStyle = rgb(suit);
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 1.1, s * 1.05, s * 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgb([224, 200, 180]);
  ctx.beginPath();
  ctx.arc(cx, cy - s * 2.9, s * 0.8, 0, Math.PI * 2);
  ctx.fill();
  // The clipboard: a small pale slate held at reading angle, with two lines.
  const bx = cx + s * 1.15, by = cy - s * 1.35;
  ctx.fillStyle = "rgba(235,238,245,0.92)";
  ctx.fillRect(bx - s * 0.5, by - s * 0.7, s, s * 1.3);
  ctx.strokeStyle = "rgba(90,100,120,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx - s * 0.3, by - s * 0.3); ctx.lineTo(bx + s * 0.3, by - s * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx - s * 0.3, by + s * 0.05); ctx.lineTo(bx + s * 0.3, by + s * 0.05); ctx.stroke();
  ctx.restore();
}

/** C2 — faction tint: a faint full-room wash. Doomer (−) cools toward blue; accel (+)
 *  warms toward amber. Alpha scales with |alignment|, capped low so it never fights
 *  the racks. Static (no motion) so reduced-motion needs no special case. */
function drawAlignmentTint(ctx: CanvasRenderingContext2D, W: number, H: number, alignment: number): void {
  const col: RGB = alignment < 0 ? [60, 120, 240] : [255, 150, 60];
  const a = Math.min(0.12, Math.abs(alignment) * 0.12);
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = rgba(col, a);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** C2e — the Post-Singularity transformation (era 5). An iridescent ceiling bloom +
 *  a vortex of data spiralling up into a bright singularity point near the ceiling.
 *  Reduced-motion → the bloom + a static halo, no spinning particles. */
function drawSingularityVortex(
  ctx: CanvasRenderingContext2D, W: number, H: number, originY: number,
  t: number, reducedMotion: boolean,
): void {
  const cx = W / 2;
  const cy = originY - H * 0.08; // the singularity, high in the room
  const iris: RGB = [180, 140, 255];
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Ceiling bloom.
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.4);
  bloom.addColorStop(0, rgba([220, 200, 255], 0.5));
  bloom.addColorStop(0.4, rgba(iris, 0.16));
  bloom.addColorStop(1, rgba(iris, 0));
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, W, originY + H * 0.4);
  // Bright core.
  const corePulse = reducedMotion ? 0.8 : 0.7 + 0.3 * Math.sin(t / 320);
  ctx.fillStyle = rgba([255, 250, 255], 0.85 * corePulse);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(3, W * 0.012), 0, Math.PI * 2);
  ctx.fill();
  // Rising vortex particles spiralling toward the core (motion only).
  if (!reducedMotion) {
    const n = 40;
    for (let i = 0; i < n; i++) {
      const seed = ((i * 2654435761) % 1000) / 1000;
      const prog = ((t / (2600 + seed * 1800)) + seed) % 1; // 0 (bottom) → 1 (core)
      const ease = prog * prog;
      const radius = (W * 0.34) * (1 - ease);
      const ang = seed * Math.PI * 2 + prog * 7.5; // spiral inward as it rises
      const x = cx + Math.cos(ang) * radius;
      const y = (originY + H * 0.22) - ease * (H * 0.3) + Math.sin(ang) * radius * 0.32;
      const a = Math.sin(prog * Math.PI) * 0.6;
      if (a <= 0.02) continue;
      const col: RGB = i % 2 === 0 ? [200, 170, 255] : [150, 210, 255];
      ctx.fillStyle = rgba(col, a);
      ctx.beginPath();
      ctx.arc(x, y, 1 + seed * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawMotes(
  ctx: CanvasRenderingContext2D, W: number, H: number, originY: number,
  t: number, active: boolean, total: number, reducedMotion: boolean, layer: number,
): void {
  if (reducedMotion || total === 0) return;
  const n = Math.round((active ? 22 : 10) * layer);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) {
    const seed = ((i * 2654435761) % 1000) / 1000;
    const seed2 = ((i * 40503) % 997) / 997;
    const speed = 5200 + seed * 5200;
    const prog = ((t / speed) + seed2) % 1;
    const x = W * 0.5 + (seed - 0.5) * W * 0.7;
    const y = originY + H * 0.16 - prog * H * 0.42;
    const a = Math.sin(prog * Math.PI) * (active ? 0.5 : 0.3) * layer;
    if (a <= 0.01) continue;
    const col: RGB = i % 2 === 0 ? [155, 120, 255] : [120, 180, 255];
    const sz = 0.8 + seed2 * 1.6;
    ctx.fillStyle = rgba(col, a);
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
