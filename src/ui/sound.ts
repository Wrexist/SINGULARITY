import { useSettings } from "./settings";

/**
 * Synthesized sound layer — Web Audio oscillators, NO audio asset files (matches
 * the parametric / lean-bundle philosophy). Tiny, gesture-initialized tones for
 * tap / purchase / claim / ship. Respects the Sound setting; always a safe no-op
 * if Web Audio is unavailable.
 */
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, dur: number, type: OscillatorType, peak: number): void {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const on = () => useSettings.getState().sound;

export const sound = {
  tap: () => on() && tone(420, 0, 0.07, "triangle", 0.045),
  purchase: () => {
    if (!on()) return;
    tone(523.25, 0, 0.09, "triangle", 0.055);
    tone(783.99, 0.06, 0.1, "triangle", 0.045);
  },
  success: () => {
    if (!on()) return;
    tone(659.25, 0, 0.1, "sine", 0.06);
    tone(987.77, 0.08, 0.14, "sine", 0.05);
  },
  ship: () => {
    if (!on()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.32, "sine", 0.06));
  },
  /** Negative beat (a raid, a fine) — a harsh descending two-tone "uh-oh". */
  alert: () => {
    if (!on()) return;
    tone(311.13, 0, 0.16, "sawtooth", 0.05);
    tone(207.65, 0.12, 0.24, "square", 0.045);
  },
};
