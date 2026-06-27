import type { HallModel, SideMarker } from "./hallModel";

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
  // Fans are frozen in the cached layer (a tiny detail); the room itself is static.
  drawRoom(ctx, L, model.era, H, 0, true, model.coolingUnits);
  drawFloor(ctx, L, model.era);
  drawPartitions(ctx, L, model);
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

/** The full hall (static + animated) in one pass. Kept for any non-cached use. */
export function drawHall(ctx: CanvasRenderingContext2D, model: HallModel, o: DrawOpts): void {
  drawHallStatic(ctx, model, o.width, o.height);
  drawHallDynamic(ctx, model, o);
}

/** The ANIMATED layer: drifting motes, racks, claim burst, expansion markers. */
export function drawHallDynamic(ctx: CanvasRenderingContext2D, model: HallModel, o: DrawOpts): void {
  const { width: W, height: H } = o;

  const L = computeLayout(model.cols, model.rows, model.gxMin, model.gyMin, W, H);
  const { iso, tileW, tileH, originY, gxMin, gyMin, gxMax, gyMax } = L;

  drawMotes(ctx, W, H, originY, o.timeMs, model.active, model.total, o.reducedMotion, 0.6);

  // Place racks in orderly rows, back-to-front (valid iso paint order). Leave the
  // partition column/row empty as a walkway so the rooms read as separate.
  const tiles: Pt[] = [];
  for (let gy = gyMin; gy < gyMax; gy++) {
    if (gy === model.splitGy) continue;
    for (let gx = gxMin; gx < gxMax; gx++) {
      if (gx === model.splitGx) continue;
      tiles.push(iso(gx + 0.5, gy + 0.5));
    }
  }

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
    const workPulse = model.active && !o.reducedMotion ? 0.5 + 0.5 * Math.sin(t / 150 + i) : 0;
    drawRack(ctx, c.x, c.y, tileW, tileH, rack.tier, rack.density, scale, blink, workPulse, model.active, powerOn);
  }

  if (model.active || !o.reducedMotion) {
    drawMotes(ctx, W, H, originY, o.timeMs, model.active, model.total, o.reducedMotion, 1);
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

function drawRoom(ctx: CanvasRenderingContext2D, L: Layout, era: number, H: number, t: number, reducedMotion: boolean, units: number): void {
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

  const wallPt = (p0: Pt, p1: Pt, u: number, v: number): Pt => {
    const bp = lerp(p0, p1, u);
    return { x: bp.x, y: bp.y - v * wallH };
  };
  for (const [p0, p1] of [[a, b] as const, [a, d] as const]) {
    for (let k = 0; k < units; k++) {
      // Evenly space within the open (0,1) interval so the last unit never runs
      // off the wall edge (3 units → 0.25 / 0.5 / 0.75).
      const u = (k + 1) / (units + 1);
      drawCoolingUnit(ctx, wallPt(p0, p1, u - 0.06, 0.66), wallPt(p0, p1, u + 0.06, 0.66), wallH * 0.3, t, reducedMotion);
    }
  }
}

function drawCoolingUnit(ctx: CanvasRenderingContext2D, topL: Pt, topR: Pt, h: number, t: number, reducedMotion: boolean): void {
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
  const rot = reducedMotion ? 0 : (t / 240) % (Math.PI * 2);
  ctx.strokeStyle = "rgba(180,210,255,0.55)";
  ctx.lineWidth = Math.max(1, r * 0.18);
  for (let i = 0; i < 3; i++) {
    const ang = rot + (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * r * 0.82, cy + Math.sin(ang) * r * 0.82);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(120,255,180,0.85)";
  ctx.beginPath();
  ctx.arc(topL.x + (br.x - topL.x) * 0.16, topL.y + h * 0.22, Math.max(0.8, r * 0.12), 0, Math.PI * 2);
  ctx.fill();
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
): void {
  const base = tierBase(tier);
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
