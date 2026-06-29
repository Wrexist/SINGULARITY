/**
 * Local telemetry RECORDER (R8.1) — the impure half.
 *
 * Owns the wall clock + localStorage; the pure summarizer lives in
 * `src/engine/telemetry.ts`. Mirrors `daily.ts`/`settings.ts`: its OWN localStorage
 * keys, separate from the versioned game save (`SAVE_KEY`), so telemetry can never
 * corrupt a save. Every access is try/catch-guarded (private mode / quota).
 *
 * PRIVACY CONTRACT: 100% on-device. There is intentionally NO network code in this
 * file — events are written to localStorage and read back for the in-app Diagnostics
 * panel only. This is what keeps the App Store "Data Not Collected" label true. If a
 * future feature wants to SEND this data, that is a separate, owner-greenlit decision
 * with a privacy-label change — do not add transmission here.
 */
import type { TelemetryEvent } from "../engine/telemetry";

const KEY = "singularity.telemetry.v1";
const ENABLED_KEY = "singularity.telemetry.enabled.v1";
/** Ring-buffer cap: keep the most recent N events (bounds localStorage footprint). */
const CAP = 500;

/** Opt-out switch. Default ON because it is local-only and the data is the whole point;
 *  the Settings panel exposes the toggle + a one-tap Clear. */
export function telemetryEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return false;
  }
}

export function setTelemetryEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
    if (!on) localStorage.removeItem(KEY); // opting out clears what was collected
  } catch {
    /* ignore */
  }
}

export function getTelemetryEvents(): TelemetryEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
}

/** Append one event (the store supplies `t` from the wall clock). No-op when opted out. */
export function recordTelemetry(evt: TelemetryEvent): void {
  if (!telemetryEnabled()) return;
  try {
    const events = getTelemetryEvents();
    events.push(evt);
    const trimmed = events.length > CAP ? events.slice(events.length - CAP) : events;
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function clearTelemetry(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
