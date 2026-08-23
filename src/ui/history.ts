import type { Big } from "../engine/math/Big";

/**
 * Session-only rate history for the Lab Stats sparklines (UI layer — the engine
 * stores no time series and never reads this). App samples the derived rates
 * every few seconds; the buffers hold the last ~3 minutes. Values are stored as
 * base-10 magnitudes (Big.log10) so the buffers stay finite and the line shape
 * stays readable at any endgame scale; a zero rate clamps to just under the
 * window so it reads as "the floor", not -Infinity.
 */
export const HISTORY_LEN = 90;
export const SAMPLE_MS = 2000;

export const history: { compute: number[]; data: number[]; money: number[] } = {
  compute: [],
  data: [],
  money: [],
};

function push(arr: number[], v: number): void {
  arr.push(v);
  if (arr.length > HISTORY_LEN) arr.shift();
}

/** Clamp a magnitude so a zero/dust rate draws as a floor line, not -∞. */
function mag(b: Big): number {
  const v = b.log10();
  return Number.isFinite(v) ? v : -1;
}

export function sampleHistory(computePerSec: Big, dataPerSec: Big, moneyPerSec: Big): void {
  push(history.compute, mag(computePerSec));
  push(history.data, mag(dataPerSec));
  push(history.money, mag(moneyPerSec));
}

/** Prestige resets the run's rates to zero — restart the trace so the sparkline
 *  tells this generation's story instead of a cliff from the old one. */
export function resetHistory(): void {
  history.compute.length = 0;
  history.data.length = 0;
  history.money.length = 0;
}
