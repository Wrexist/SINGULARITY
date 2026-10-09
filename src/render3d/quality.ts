/**
 * Battery and heat guards for the 3D Lab (WORLD_3D_PLAN.md §4C). An idle game stays
 * open for long sessions, so the 3D view must cost as little as it can:
 *
 *  - Adaptive resolution: if a device can't hold the ~30fps target, step the pixel
 *    ratio cap down (2 → 1.75 → 1.5 → 1.25). It never steps back up in a session —
 *    a device that ran hot once will run hot again, and flip-flopping is visible.
 *  - Still lab: under reduced motion nothing in the card animates, so it repaints
 *    only when something changed (or at most twice a second, for live colours like an
 *    expansion plot becoming affordable). Explore mode always renders: the player is
 *    moving the camera.
 *
 * Pure functions so the rules are tested, not just hoped for.
 */

export const DPR_STEPS = [2, 1.75, 1.5, 1.25] as const;
/** Average frame interval (ms) above which the device isn't holding ~30fps. */
export const SLOW_FRAME_MS = 45;

export function nextDprCap(cap: number, avgFrameMs: number): number {
  if (!(avgFrameMs > SLOW_FRAME_MS)) return cap;
  const lower = DPR_STEPS.find((s) => s < cap - 1e-6);
  return lower ?? cap;
}

export function shouldRender(o: { reducedMotion: boolean; explore: boolean; changed: boolean; sinceLastMs: number }): boolean {
  if (!o.reducedMotion || o.explore || o.changed) return true;
  return o.sinceLastMs >= 500;
}
