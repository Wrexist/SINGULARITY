/**
 * Opt-in switch for the 3D hall (Phase 0 spike — WORLD_3D_PLAN.md). OFF for every
 * player: there is no Settings row. A tester turns it on with `?hall3d=1` (or
 * `localStorage["singularity.hall3d.v1"] = "1"` from Safari Web Inspector on a
 * device) and off with `?hall3d=0`. Storage is hostile/absent-tolerant: any failure
 * reads as off, so the shipped 2D hall is always the fallback.
 */
export const HALL3D_KEY = "singularity.hall3d.v1";

export function hall3dEnabled(): boolean {
  try {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("hall3d") : null;
    if (q === "1") localStorage.setItem(HALL3D_KEY, "1");
    else if (q === "0") localStorage.removeItem(HALL3D_KEY);
    return localStorage.getItem(HALL3D_KEY) === "1";
  } catch {
    return false;
  }
}
