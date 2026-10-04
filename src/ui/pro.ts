import { useSyncExternalStore } from "react";
import { hasPro, onProChange, proLapseConfirmed } from "../state/premium";

/**
 * Is Pro active? Re-renders on a purchase / restore / lapse the store reports. The
 * snapshot is also re-read on every render, so an expiry that passes while the app is
 * open takes effect on the next frame (the App renders at 10Hz).
 */
export function useHasPro(): boolean {
  return useSyncExternalStore(onProChange, () => hasPro(), () => hasPro());
}

/**
 * Has the store confirmed Pro is over (see proLapseConfirmed)? False while a stored
 * subscription expiry has only passed on the device clock and the store has not said
 * whether it renewed — anything taken away on a lapse waits for this to turn true.
 */
export function useProLapseConfirmed(): boolean {
  return useSyncExternalStore(onProChange, () => proLapseConfirmed(), () => proLapseConfirmed());
}
