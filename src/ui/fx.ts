/**
 * Tiny screen-space juice engine (UI-only). A module singleton holds live
 * particles + floating texts; <FxCanvas> owns the canvas and the rAF loop and
 * drains this state each frame. Any component can fire feedback at a screen point
 * via burst()/floatText() — the dopamine layer for claims, buys, and unlocks.
 *
 * Parametric (dots + text), no image assets, one canvas, rAF sleeps when idle.
 */

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; grav: number;
}
export interface Floater {
  x: number; y: number; vy: number; life: number; max: number; text: string; color: string; size: number;
}

const particles: Particle[] = [];
const floaters: Floater[] = [];
let wakers: Array<() => void> = [];

const PALETTE = ["#ff385c", "#2f7bf6", "#9b51e0", "#16b364", "#ff9f0a"];

/** Radial spray of particles at a screen point. */
export function burst(x: number, y: number, opts?: { count?: number; colors?: string[]; power?: number }) {
  const n = opts?.count ?? 16;
  const colors = opts?.colors ?? PALETTE;
  const power = opts?.power ?? 1;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const sp = (1.6 + Math.random() * 3.2) * power;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1.4,
      life: 0, max: 600 + Math.random() * 500,
      size: 2.5 + Math.random() * 3.5,
      color: colors[i % colors.length]!,
      grav: 0.045,
    });
  }
  wake();
}

/** A rising, fading "+X" text at a screen point. */
export function floatText(x: number, y: number, text: string, color = "#16b364", size = 16) {
  floaters.push({ x, y, vy: -0.55, life: 0, max: 1100, text, color, size });
  wake();
}

/**
 * A one-shot "purchase punch" on an element via the Web Animations API.
 * Deliberately NOT a CSS class: toggling a class that owns the `animation`
 * property fights the card's entrance/breathe animations and snaps the element
 * back to its start position when the class is removed. WAA composes on top of
 * the element's own transform and cleanly reverts (fill: none) with no snap.
 */
export function punch(el: Element | null) {
  if (!el || typeof (el as HTMLElement).animate !== "function") return;
  // Respect reduced-motion (the app sets this class on the root).
  if (document.querySelector(".app.reduce-motion")) return;
  (el as HTMLElement).animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.96)", offset: 0.28 },
      { transform: "scale(1.03)", offset: 0.55 },
      { transform: "scale(1)" },
    ],
    { duration: 460, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)" },
  );
}

/** Internal: live arrays for the renderer. */
export function _fxState() { return { particles, floaters }; }
/** Internal: register a wake callback so the renderer can restart its idle rAF. */
export function _onFxWake(fn: () => void) { wakers.push(fn); return () => { wakers = wakers.filter((w) => w !== fn); }; }
function wake() { for (const w of wakers) w(); }
