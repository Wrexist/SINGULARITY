import type { ShipReport } from "./Celebration";
import type { Big } from "../engine/math/Big";
import { fmt, m$ } from "./format";
import { shipHeadline } from "./headlines";
import { eraName } from "../engine/eras";

/**
 * Prestige share card (IMPROVEMENTS #2) — a canvas-rendered Generation Report
 * image handed to the native share sheet. Everything is drawn at runtime (no
 * image assets, matching the parametric philosophy) and nothing touches the
 * network: Web Share API where available, clipboard text as the last resort.
 * "Data Not Collected" stays true — sharing is the OS sheet, not an upload.
 */

const W = 1080;
const H = 1350;
const ACCENT = "#9b51e0";
const CONFETTI = ["#ff385c", "#2f7bf6", "#9b51e0", "#16b364", "#ff9f0a"];

const SYS_FONT = "-apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif";

function font(weight: number, px: number): string {
  return `${weight} ${px}px ${SYS_FONT}`;
}

/** Greedy word-wrap for one canvas font; returns the drawn line count. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): number {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(probe).width > maxWidth) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
      line = word;
      if (lines >= maxLines - 1) break;
    } else {
      line = probe;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y + lines * lineHeight);
    lines++;
  }
  return lines;
}

/** Draw the Generation Report card. Deterministic apart from the confetti seed,
 *  which is derived from the gen number so the same run renders the same card. */
export function renderShareCard(report: ShipReport, weightsGained: Big, totalWeights: Big): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ---- Backdrop: the app's deep-space gradient with a faint grid ----
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b0d14");
  bg.addColorStop(0.6, "#121524");
  bg.addColorStop(1, "#181231");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= W; gx += 72) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
  }
  for (let gy = 0; gy <= H; gy += 72) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }

  // ---- Confetti dots (seeded by gen so re-renders are identical) ----
  let seed = report.gen * 2654435761 % 4294967296;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 42; i++) {
    ctx.fillStyle = CONFETTI[i % CONFETTI.length]!;
    ctx.globalAlpha = 0.25 + rand() * 0.5;
    const r = 4 + rand() * 8;
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H * 0.35, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const PAD = 84;

  // ---- Masthead ----
  ctx.fillStyle = ACCENT;
  ctx.font = font(700, 34);
  ctx.fillText("S I N G U L A R I T Y   I N C .", PAD, 150);

  ctx.fillStyle = "#ffffff";
  ctx.font = font(800, 92);
  ctx.fillText(`Generation ${report.gen}`, PAD, 268);
  ctx.font = font(800, 92);
  ctx.fillStyle = "#c9b8ff";
  ctx.fillText("shipped.", PAD, 372);

  // ---- Run headline (the same satirical line the player saw) ----
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = font(500, 44);
  const headlineLines = wrapText(ctx, `“${shipHeadline(report)}”`, PAD, 470, W - PAD * 2, 58, 3);

  // ---- Stats grid (2×2 cards) ----
  const stats: { label: string; value: string }[] = [
    { label: "PEAK COMPUTE / S", value: fmt(report.peakCompute) },
    { label: "PEAK REVENUE", value: report.peakMrr > 0 ? `${m$(report.peakMrr)}/s` : "—" },
    { label: "MARKET RANK", value: report.rank != null ? `#${report.rank}` : "—" },
    { label: "LEGACY BANKED", value: `+${fmt(weightsGained)}` },
  ];
  // Follow the headline (1–3 lines) so a short one doesn't leave a hole.
  const gridTop = 470 + headlineLines * 58 + 56;
  const cellW = (W - PAD * 2 - 36) / 2;
  const cellH = 190;
  stats.forEach((s, i) => {
    const cx = PAD + (i % 2) * (cellW + 36);
    const cy = gridTop + Math.floor(i / 2) * (cellH + 32);
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    ctx.beginPath();
    roundedRect(ctx, cx, cy, cellW, cellH, 26);
    ctx.fill();
    ctx.strokeStyle = "rgba(155,81,224,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = font(700, 27);
    ctx.fillText(s.label, cx + 34, cy + 62);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(800, 62);
    ctx.fillText(s.value, cx + 34, cy + 142);
  });

  // ---- Era + totals footer ----
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = font(600, 40);
  ctx.fillText(`Reached the ${eraName(report.era)} era`, PAD, 1170);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = font(500, 34);
  ctx.fillText(`${fmt(totalWeights)} Legacy Weights and counting`, PAD, 1225);

  ctx.fillStyle = ACCENT;
  ctx.font = font(700, 30);
  ctx.fillText("How far can one lab go?", PAD, 1292);

  return canvas;
}

/** One-line text fallback used when the platform can't share an image. */
export function shareText(report: ShipReport, weightsGained: Big): string {
  const rank = report.rank != null ? ` · market rank #${report.rank}` : "";
  return `Shipped Generation ${report.gen} of my AI lab — peak ${fmt(report.peakCompute)} compute/s${rank} · +${fmt(weightsGained)} Legacy. Singularity Inc.`;
}

/** roundRect with a manual-arc fallback (roundRect needs iOS 16 / Chrome 99). */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * Render + hand the card to the platform share surface. Ladder:
 * 1. navigator.share with the PNG file (iOS 15+/modern Android)
 * 2. navigator.share with text only
 * 3. PNG download (desktop dev) → 4. clipboard text
 * Returns a short status for a toast, or null when the user cancelled / shared.
 */
export async function shareRunCard(report: ShipReport, weightsGained: Big, totalWeights: Big): Promise<string | null> {
  const text = shareText(report, weightsGained);
  let blob: Blob | null = null;
  try {
    blob = await canvasToBlob(renderShareCard(report, weightsGained, totalWeights));
  } catch {
    blob = null;
  }

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (blob && typeof nav.share === "function" && typeof nav.canShare === "function") {
      const file = new File([blob], `singularity-gen-${report.gen}.png`, { type: "image/png" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text });
        return null;
      }
    }
    if (typeof nav.share === "function") {
      await nav.share({ text });
      return null;
    }
  } catch (err) {
    // User closed the sheet — not an error, and not worth a fallback either.
    if ((err as DOMException | null)?.name === "AbortError") return null;
  }

  if (blob && typeof document !== "undefined") {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `singularity-gen-${report.gen}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return "Card saved as an image.";
    } catch {
      /* fall through to clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "Run summary copied — paste it anywhere.";
  } catch {
    return "Sharing isn't available here.";
  }
}
