import type { HallModel } from "./hallModel";

/**
 * Pure Canvas 2D renderer for the 2.5D hall. No React, no DOM beyond the passed
 * 2D context. Parametric boxes + lights (no image assets) on an isometric floor.
 * Deterministic given (model, opts) so it's easy to reason about and cheap to
 * batch — racks are capped upstream, so this draws a few dozen boxes per frame.
 */

export interface DrawOpts {
  width: number; // CSS px
  height: number;
  timeMs: number;
  reducedMotion: boolean;
  /** Racks at index >= spawnFrom animate in (scale up) over spawnT. */
  spawnFrom: number;
  spawnT: number; // 0..1
  dpr: number;
}

const COLS = 8;
const ROWS = 6;

interface TierStyle {
  top: string;
  left: string;
  right: string;
  light: string;
}

const TIER_STYLES: TierStyle[] = [
  { top: "#6ee7a8", left: "#3fb579", right: "#2b8a5b", light: "#d6ffe9" }, // consumer
  { top: "#7db4ff", left: "#3f86f0", right: "#2b60c0", light: "#dcebff" }, // server
  { top: "#c79bff", left: "#9b51e0", right: "#7636bd", light: "#f0e2ff" }, // TPU
];

// Era palettes tint the room so it visibly evolves (re-skin).
const ERA_BG: [string, string][] = [
  ["#0d1124", "#11162e"], // garage closet — cool, dim
  ["#0c1430", "#102046"], // startup — bluer
  ["#141029", "#241a44"], // scale-up — warmer violet
];
const ERA_FLOOR = ["#1a2140", "#1b2750", "#241d49"];

const FALLBACK_STYLE = TIER_STYLES[0]!;
const eraBg = (era: number): [string, string] => ERA_BG[era] ?? ERA_BG[0]!;
const eraFloor = (era: number): string => ERA_FLOOR[era] ?? ERA_FLOOR[0]!;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function drawHall(ctx: CanvasRenderingContext2D, model: HallModel, o: DrawOpts): void {
  const { width: W, height: H } = o;

  // ---- Room background ----
  const [bg0, bg1] = eraBg(model.era);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, bg0);
  sky.addColorStop(1, bg1);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // ---- Isometric layout ----
  // Fit the floor diamond comfortably in the card with headroom for rack height.
  const tileW = Math.min(W / (COLS + ROWS) * 1.7, 64);
  const tileH = tileW / 2;
  const originX = W / 2;
  const originY = H * 0.34;

  const iso = (gx: number, gy: number) => ({
    x: originX + (gx - gy) * (tileW / 2),
    y: originY + (gx + gy) * (tileH / 2),
  });

  // ---- Floor ----
  drawFloor(ctx, iso, model.era);

  // ---- Place racks in orderly rows, back-to-front ----
  // Row-major with both axes ascending is a valid iso painter's order (every
  // tile that can occlude another is drawn after it), so no sort is needed and
  // racks read as tidy data-center rows rather than a diagonal pile.
  const tiles: { gx: number; gy: number }[] = [];
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) tiles.push({ gx, gy });
  }

  const t = o.timeMs;
  for (let i = 0; i < model.racks.length && i < tiles.length; i++) {
    const rack = model.racks[i]!;
    const tile = tiles[i]!;
    const c = iso(tile.gx + 0.5, tile.gy + 0.5);

    let scale = 1;
    let powerOn = 0; // spawn flash: bright at appear, fades as it settles
    if (!o.reducedMotion && i >= o.spawnFrom && o.spawnT < 1) {
      scale = easeOut(Math.max(0.0001, o.spawnT)); // pop in
      powerOn = 1 - o.spawnT;
    }

    // A working run makes racks pulse; idle racks breathe gently.
    const blink = o.reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(t / 280 + i * 1.7);
    const workPulse = model.active && !o.reducedMotion ? 0.5 + 0.5 * Math.sin(t / 140 + i) : 0;
    drawRack(ctx, c.x, c.y, tileW, tileH, rack.tier, rack.density, scale, blink, workPulse, model.active, powerOn);
  }

  // ---- Empty-state hint (the rented closet) ----
  if (model.total === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 13px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Your empty server closet. Buy a rack to fill it.", W / 2, H - 16);
  }
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  iso: (gx: number, gy: number) => { x: number; y: number },
  era: number,
): void {
  // Floor slab
  const a = iso(0, 0), b = iso(COLS, 0), c = iso(COLS, ROWS), d = iso(0, ROWS);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = eraFloor(era);
  ctx.fill();

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= COLS; gx++) {
    const p0 = iso(gx, 0), p1 = iso(gx, ROWS);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
  for (let gy = 0; gy <= ROWS; gy++) {
    const p0 = iso(0, gy), p1 = iso(COLS, gy);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  }
}

function drawRack(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tileW: number,
  tileH: number,
  tier: number,
  density: number,
  scale: number,
  blink: number,
  workPulse: number,
  active: boolean,
  powerOn: number,
): void {
  const style = TIER_STYLES[tier] ?? FALLBACK_STYLE;
  const hw = (tileW / 2) * 0.62 * scale; // footprint half-width
  const hh = (tileH / 2) * 0.62 * scale;
  // Height grows with tier and density (bigger hardware = taller cabinet).
  const baseH = tileH * (1.1 + tier * 0.5);
  const ph = baseH * (0.7 + 0.3 * density) * scale;

  // Base diamond corners (on floor) — back corner is hidden, so not drawn.
  const bRight = { x: sx + hw, y: sy };
  const bBottom = { x: sx, y: sy + hh };
  const bLeft = { x: sx - hw, y: sy };
  // Raised top corners
  const tTop = { x: sx, y: sy - hh - ph };
  const tRight = { x: sx + hw, y: sy - ph };
  const tBottom = { x: sx, y: sy + hh - ph };
  const tLeft = { x: sx - hw, y: sy - ph };

  // Contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(sx, sy + hh * 0.3, hw * 1.15, hh * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Left face (front-left)
  quad(ctx, bLeft, bBottom, tBottom, tLeft, style.left);
  // Right face (front-right)
  quad(ctx, bBottom, bRight, tRight, tBottom, style.right);
  // Top face
  quad(ctx, tLeft, tTop, tRight, tBottom, style.top);

  // Server lights on the right face — small glowing rungs that blink.
  const rows = 3 + tier;
  for (let r = 0; r < rows; r++) {
    const f = (r + 1) / (rows + 1);
    const lx = bBottom.x + (bRight.x - bBottom.x) * 0.5;
    const ly = bBottom.y - ph * f + (bRight.y - bBottom.y) * 0.5;
    const lit = ((blink + r * 0.33) % 1) > 0.45;
    let a = active ? Math.max(blink, workPulse) : (lit ? 0.9 : 0.25);
    if (powerOn > 0) a = Math.max(a, powerOn); // racks light up as they boot
    ctx.fillStyle = withAlpha(style.light, a * scale);
    ctx.fillRect(lx - hw * 0.42, ly, hw * 0.7, Math.max(1, ph * 0.045));
  }

  // Active glow halo
  if (active && workPulse > 0) {
    ctx.save();
    ctx.globalAlpha = 0.10 + 0.12 * workPulse;
    ctx.fillStyle = style.light;
    ctx.beginPath();
    ctx.ellipse(sx, sy - ph * 0.5, hw * 1.8, ph * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Power-on flash: a bright additive bloom the instant a rack manifests.
  if (powerOn > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * powerOn;
    ctx.fillStyle = style.light;
    ctx.beginPath();
    ctx.ellipse(sx, sy - ph * 0.55, hw * 2.4, ph * 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function quad(
  ctx: CanvasRenderingContext2D,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  fill: string,
): void {
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
