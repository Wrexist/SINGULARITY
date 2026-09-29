import { useSyncExternalStore } from "react";
import { hasPro, onProChange } from "../state/premium";

/**
 * Is Pro active? Re-renders on a purchase / restore / lapse the store reports. The
 * snapshot is also re-read on every render, so an expiry that passes while the app is
 * open takes effect on the next frame (the App renders at 10Hz).
 */
export function useHasPro(): boolean {
  return useSyncExternalStore(onProChange, () => hasPro(), () => false);
}
