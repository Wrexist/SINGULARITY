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
const musicOn = () => useSettings.getState().music;

/* ---------- Ambient bed (GDD §6: a quiet, evolving pad, not a loop file) ----------
   A warm drone of open fifths through a slow-breathing low-pass filter. Pure
   synthesis (no assets), very low gain. Gated on the Music setting + a user
   gesture (autoplay policy). Stops fully when music is off. */
interface Ambient { oscs: OscillatorNode[]; master: GainNode; lfo: OscillatorNode; }
let ambient: Ambient | null = null;
let wantMusic = false;
let unlockBound = false;

function startAmbient(): void {
  const c = getCtx();
  if (!c || ambient || c.state !== "running") return;
  const t0 = c.currentTime;
  const master = c.createGain();
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(0.04, t0 + 3); // gentle fade-in
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.Q.value = 0.6;
  // A1 · E2 · A2 · E3 — open fifths/octaves, warm and unobtrusive.
  const freqs = [55, 82.41, 110, 164.81];
  const oscs = freqs.map((f, i) => {
    const o = c.createOscillator();
    o.type = i % 2 ? "sine" : "triangle";
    o.frequency.value = f;
    o.detune.value = (i - 1.5) * 4; // slight chorus spread
    const g = c.createGain();
    g.gain.value = 0.22 / (i + 1);
    o.connect(g).connect(filter);
    o.start(t0);
    return o;
  });
  filter.connect(master).connect(c.destination);
  // Slow LFO breathing the cutoff — the "evolving" part, no melody to grate.
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 200;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start(t0);
  ambient = { oscs, master, lfo };
}

function stopAmbient(): void {
  if (!ambient) return;
  const c = getCtx();
  const t = c ? c.currentTime : 0;
  const { oscs, master, lfo } = ambient;
  try {
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    oscs.forEach((o) => o.stop(t + 1.3));
    lfo.stop(t + 1.3);
  } catch {
    /* ignore */
  }
  ambient = null;
}

/** Reflect the Music setting: start the pad (once audio is unlocked) or stop it. */
function setMusic(want: boolean): void {
  wantMusic = want;
  if (!want) { stopAmbient(); return; }
  const c = getCtx();
  if (c && c.state === "running") { startAmbient(); return; }
  // No gesture yet → arm a one-time unlock that starts the pad on first input.
  if (!unlockBound && typeof window !== "undefined") {
    unlockBound = true;
    const kick = () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      unlockBound = false; // allow re-arming if this attempt doesn't take
      const c = getCtx();
      if (!c) return;
      // resume() is async — wait for it to actually run before starting the pad,
      // or startAmbient()'s "running" guard would no-op on this first gesture.
      const go = () => { if (wantMusic && c.state === "running") startAmbient(); };
      c.resume().then(go).catch(go);
    };
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
  }
}

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
  /** Achievement unlock — a bright, sparkly major triad "ta-da" (distinct from a buy). */
  achievement: () => {
    if (!on()) return;
    [659.25, 830.61, 1318.51].forEach((f, i) => tone(f, i * 0.05, 0.18, "triangle", 0.05));
    tone(1661.22, 0.16, 0.12, "sine", 0.035);
  },
  /** AGI ascension — the grandest beat: a long rising run into a shimmering held chord. */
  ascend: () => {
    if (!on()) return;
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => tone(f, i * 0.08, 0.5, "sine", 0.055));
    [1046.5, 1318.51, 1567.98].forEach((f) => tone(f, 0.5, 0.6, "triangle", 0.04));
  },
  /** Era transition — a warm, swelling major chord stinger under the Music toggle
   *  (the "music swells" tentpole moment from GDD §6). Distinct from SFX so it
   *  plays even if you've muted taps, as long as Music is on. */
  era: () => {
    if (!musicOn()) return;
    // Low swell → bright triad bloom.
    tone(130.81, 0, 1.1, "sine", 0.05);
    tone(196, 0.05, 1.0, "sine", 0.045);
    [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.18 + i * 0.07, 0.9, "triangle", 0.045));
    tone(1046.5, 0.4, 0.7, "sine", 0.03);
  },
  /** Start/stop the ambient music bed to match the Music setting. */
  setMusic: (want: boolean) => setMusic(want),
};
