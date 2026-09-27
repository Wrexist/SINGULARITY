/**
 * Trailer score: an original cue synthesised from scratch (no samples, no licensing),
 * so it can ship anywhere the trailer does. 100 BPM, A minor, 42 s, 48 kHz stereo.
 * Deterministic: a seeded PRNG drives every noise source, so it renders identically.
 *
 *   node scripts/trailer/score.mjs <out.wav>
 *
 * Structure (bar = 2.4 s):
 *   0-1   intro     drone + glassy bells
 *   2-3   arrive    chord pad + soft arpeggio
 *   4-7   build     kick, sub bass, hats, claps (from bar 6)
 *   8-9   rise      arp opens up, riser + snare roll, drums drop the last beats of bar 9
 *   10-13 drop      impact on the downbeat (the Ship), full groove, wide pad
 *   14    breathe   drums out, pad swell
 *   15    logo      final impact, reverb tail to 42 s
 */
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "trailer-score.wav";
const SR = 48000;
const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const DUR = 42;
const N = Math.round(SR * DUR);

const L = new Float32Array(N), R = new Float32Array(N);
const sendL = new Float32Array(N), sendR = new Float32Array(N); // reverb bus

// ---- deterministic noise ----
let seed = 0x5eed1234;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296 * 2 - 1; };

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const at = (bar, beat = 0) => bar * BAR + beat * BEAT;

function add(i, l, r, send = 0) {
  if (i < 0 || i >= N) return;
  L[i] += l; R[i] += r;
  if (send) { sendL[i] += l * send; sendR[i] += r * send; }
}

// ---- harmony: Am | F | C | G, with an Em turn before the drop ----
// Each bar: root (bass) and chord tones (pad), MIDI numbers.
const CHORDS = {
  Am: { root: 45, tones: [57, 60, 64, 69] },
  F: { root: 41, tones: [53, 57, 60, 65] },
  C: { root: 48, tones: [55, 60, 64, 67] },
  G: { root: 43, tones: [55, 59, 62, 67] },
  Em: { root: 40, tones: [55, 59, 64, 67] },
  Fmaj7: { root: 41, tones: [57, 60, 64, 65] },
};
const PROG = ["Am", "Am", "Am", "F", "Am", "F", "C", "G", "Am", "Em", "F", "C", "Am", "G", "Fmaj7", "Am", "Am"];

// ---- instruments ----
function pad(t0, dur, notes, gain, bright, spread = 1) {
  const a = 1.2, r = 1.6;
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, Math.floor((t0 + dur + r) * SR));
  const voices = [];
  for (const m of notes) for (const det of [-0.11, 0, 0.13]) voices.push({ f: mtof(m) * Math.pow(2, det / 12), ph: Math.abs(rnd()), pan: det * 4 * spread });
  let lp = 0, lpR = 0;
  const cutoff = 0.02 + bright * 0.12;
  for (let i = n0; i < n1; i++) {
    const t = i / SR - t0;
    const env = t < a ? t / a : t < dur ? 1 : Math.max(0, 1 - (t - dur) / r);
    let sl = 0, sr = 0;
    for (const v of voices) {
      v.ph += v.f / SR; if (v.ph >= 1) v.ph -= 1;
      const s = 2 * v.ph - 1; // saw
      sl += s * (0.5 - v.pan * 0.5); sr += s * (0.5 + v.pan * 0.5);
    }
    lp += cutoff * (sl - lp); lpR += cutoff * (sr - lpR);
    const g = env * gain / voices.length;
    add(i, lp * g, lpR * g, 0.55);
  }
}

function pluck(t0, m, gain, pan = 0, decay = 0.28, bright = 0.5) {
  const f = mtof(m);
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(SR * decay * 4));
  let ph = 0, lp = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    ph += f / SR; if (ph >= 1) ph -= 1;
    const sq = ph < 0.5 ? 1 : -1;
    const tri = 1 - 4 * Math.abs(ph - 0.5);
    const env = Math.exp(-t / decay) * Math.min(1, t * 400);
    const c = 0.05 + bright * 0.35 * Math.exp(-t * 6);
    lp += c * ((sq * 0.35 + tri * 0.65) - lp);
    const s = lp * env * gain;
    add(i, s * (0.5 - pan * 0.5), s * (0.5 + pan * 0.5), 0.45);
  }
}

function bell(t0, m, gain, pan = 0) {
  const f = mtof(m);
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + SR * 4);
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const env = Math.exp(-t / 1.1) * Math.min(1, t * 200);
    const s = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 2) + 0.2 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 4)) * env * gain;
    add(i, s * (0.5 - pan * 0.5), s * (0.5 + pan * 0.5), 0.8);
  }
}

const kicks = [];
function kick(t0, gain = 1) {
  kicks.push(t0);
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(SR * 0.5));
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const f = 45 + 105 * Math.exp(-t * 28);
    ph += f / SR;
    const s = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.22) * gain + (t < 0.004 ? rnd() * 0.3 * gain : 0);
    add(i, s * 0.9, s * 0.9);
  }
}

function hat(t0, gain = 0.12, open = false) {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(SR * (open ? 0.25 : 0.05)));
  let hp = 0, prev = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const x = rnd();
    hp = 0.9 * (hp + x - prev); prev = x;
    const s = hp * Math.exp(-t / (open ? 0.08 : 0.012)) * gain;
    add(i, s * 0.8, s * 1.0, 0.1);
  }
}

function clap(t0, gain = 0.28) {
  for (const off of [0, 0.011, 0.023]) {
    const n0 = Math.floor((t0 + off) * SR), n1 = Math.min(N, n0 + Math.floor(SR * 0.18));
    let bp1 = 0, bp2 = 0;
    for (let i = n0; i < n1; i++) {
      const t = (i - n0) / SR;
      const x = rnd();
      bp1 += 0.25 * (x - bp1); bp2 += 0.25 * (bp1 - bp2);
      const s = (bp1 - bp2) * Math.exp(-t / (off === 0.023 ? 0.09 : 0.012)) * gain * 3;
      add(i, s, s, 0.35);
    }
  }
}

function snare(t0, gain = 0.25) {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(SR * 0.2));
  let hp = 0, prev = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const x = rnd();
    hp = 0.7 * (hp + x - prev); prev = x;
    const s = (hp * 0.8 + Math.sin(2 * Math.PI * 190 * t) * 0.5) * Math.exp(-t / 0.06) * gain;
    add(i, s, s, 0.3);
  }
}

function sub(t0, dur, m, gain) {
  const f = mtof(m);
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, Math.floor((t0 + dur) * SR));
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    ph += f / SR;
    const env = Math.min(1, t * 60) * Math.min(1, (n1 - i) / (SR * 0.03));
    const s = (Math.sin(2 * Math.PI * ph) + 0.18 * Math.sin(4 * Math.PI * ph)) * env * gain;
    add(i, s, s);
  }
}

function riser(t0, dur, gain) {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, Math.floor((t0 + dur) * SR));
  let lp = 0, ph = 0;
  for (let i = n0; i < n1; i++) {
    const p = (i - n0) / (n1 - n0);
    const c = 0.02 + 0.5 * p * p;
    lp += c * (rnd() - lp);
    ph += (200 + 1800 * p * p) / SR;
    const s = (lp * 0.7 + Math.sin(2 * Math.PI * ph) * 0.12) * p * p * gain;
    add(i, s * (1 - p * 0.3), s * (0.7 + p * 0.3), 0.6);
  }
}

function impact(t0, gain) {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + SR * 5);
  let ph = 0, lp = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const f = 38 + 60 * Math.exp(-t * 9);
    ph += f / SR;
    const boom = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 1.1);
    lp += (0.03 + 0.4 * Math.exp(-t * 3)) * (rnd() - lp);
    const crash = lp * Math.exp(-t / 1.4) * 0.8;
    const s = (boom * 1.1 + crash) * gain;
    add(i, s, s * 0.97, 0.7);
  }
}

// ---- arrangement ----
PROG.forEach((name, bar) => {
  const c = CHORDS[name];
  const t = at(bar);
  // pad: from bar 2; bigger and brighter in the drop
  if (bar >= 2 && bar <= 15) {
    const drop = bar >= 10 && bar <= 13;
    pad(t, BAR, bar === 14 ? CHORDS.Fmaj7.tones : c.tones, drop ? 0.34 : bar === 14 ? 0.3 : 0.24, drop ? 0.9 : bar >= 8 ? 0.6 : 0.35, drop ? 1.4 : 1);
    if (drop || bar === 14) pad(t, BAR, c.tones.map((m) => m + 12), 0.1, 0.8, 1.6);
  }
  // arpeggio: 16ths from bar 2 through 13
  if (bar >= 2 && bar <= 13) {
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    const bright = bar < 4 ? 0.25 : bar < 8 ? 0.45 : bar < 10 ? 0.55 + (bar - 8) * 0.2 : 0.8;
    const gain = bar < 4 ? 0.1 : bar < 10 ? 0.14 : 0.16;
    for (let s = 0; s < 16; s++) {
      const m = c.tones[pattern[s % 8]] + (s % 8 >= 4 ? 12 : 0);
      pluck(t + s * BEAT / 4, m, gain * (s % 4 === 0 ? 1.15 : 1), ((s % 2) ? 0.35 : -0.35), 0.18 + bright * 0.12, bright);
    }
  }
  // drums + bass
  const drums = (bar >= 4 && bar <= 9) || (bar >= 10 && bar <= 13);
  if (drums) {
    for (let b = 0; b < 4; b++) {
      if (bar === 9 && b >= 2) continue; // hold the breath before the drop
      kick(t + b * BEAT, bar >= 10 ? 1 : 0.8);
      if (bar >= 6) { hat(t + (b + 0.5) * BEAT, bar >= 10 ? 0.14 : 0.1); hat(t + (b + 0.25) * BEAT, 0.05); hat(t + (b + 0.75) * BEAT, 0.05); }
      if (bar >= 6 && (b === 1 || b === 3)) clap(t + b * BEAT, bar >= 10 ? 0.3 : 0.22);
    }
    if (bar >= 10 && bar % 2 === 1) hat(t + 3.5 * BEAT, 0.12, true);
    for (let b = 0; b < 4; b++) {
      if (bar === 9 && b >= 2) continue;
      sub(t + b * BEAT + BEAT * 0.08, BEAT * 0.82, c.root + (b === 3 && bar >= 10 ? 7 : 0), bar >= 10 ? 0.42 : 0.32);
    }
  } else if (bar === 2 || bar === 3 || bar === 14) {
    sub(t, BAR, c.root, 0.2);
  }
});

// intro: drone + bells
sub(0, at(2), 33, 0.12);
pad(0.2, at(2) - 0.4, [45, 52], 0.22, 0.15);
[[0.6, 76, -0.4], [2.4, 79, 0.4], [3.6, 84, 0], [4.2, 81, -0.2]].forEach(([t, m, p]) => bell(t, m, 0.09, p));
// growth-montage accents on each cut (bars 4-5, every half bar)
for (let k = 0; k < 4; k++) bell(at(4) + k * BAR / 2, 88 - (k % 2) * 3, 0.05, k % 2 ? 0.5 : -0.5);
// rise into the drop
riser(at(8, 2), at(10) - at(8, 2), 0.5);
for (let k = 0; k < 16; k++) { const tt = at(9) + k * BEAT / 8 + (k >= 8 ? 0 : 0); if (tt < at(10) - 0.02) snare(tt, 0.06 + k * 0.012); }
// the Ship
impact(at(10), 0.9);
// breathe → logo
riser(at(14, 1), at(15) - at(14, 1), 0.3);
impact(at(15), 1.0);
pad(at(15), 3.2, [45, 57, 60, 64, 69, 76], 0.3, 0.5, 1.5);
bell(at(15) + 0.02, 81, 0.12, 0); bell(at(15) + 0.62, 88, 0.07, 0.3);

// ---- sidechain: duck everything but kick/sub under each kick in the groove ----
// (applied as gain on the pad/arp bus is not separated; a gentle global pump reads fine)
const duck = new Float32Array(N).fill(1);
for (const k of kicks) {
  const n0 = Math.floor(k * SR);
  for (let i = n0; i < Math.min(N, n0 + SR * 0.25); i++) duck[i] = Math.min(duck[i], 0.72 + 0.28 * ((i - n0) / (SR * 0.25)));
}
for (let i = 0; i < N; i++) { sendL[i] *= duck[i]; sendR[i] *= duck[i]; }

// ---- reverb (Freeverb-style) on the send bus ----
function reverb(input, out, stereoOffset) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => Math.round((d + stereoOffset) * SR / 44100) * 2);
  const aps = [556, 441, 341, 225].map((d) => Math.round((d + stereoOffset) * SR / 44100) * 2);
  const cb = combs.map((d) => ({ buf: new Float32Array(d), i: 0, lp: 0 }));
  const ab = aps.map((d) => ({ buf: new Float32Array(d), i: 0 }));
  const fb = 0.86, damp = 0.3;
  for (let n = 0; n < N; n++) {
    const x = input[n] * 0.02;
    let s = 0;
    for (const c of cb) {
      const y = c.buf[c.i];
      c.lp = y * (1 - damp) + c.lp * damp;
      c.buf[c.i] = x + c.lp * fb;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    for (const a of ab) {
      const y = a.buf[a.i];
      a.buf[a.i] = s + y * 0.5;
      s = y - s;
      a.i = (a.i + 1) % a.buf.length;
    }
    out[n] += s * 0.9;
  }
}
reverb(sendL, L, 0);
reverb(sendR, R, 23);

// ---- master: gentle glue, soft clip, fade the tail, normalise ----
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = t > DUR - 3 ? Math.max(0, (DUR - t) / 3) : 1;
  L[i] = Math.tanh(L[i] * 1.1) * fade;
  R[i] = Math.tanh(R[i] * 1.1) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;

// ---- 24-bit WAV ----
const bytes = 3, header = 44;
const buf = Buffer.alloc(header + N * 2 * bytes);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 2 * bytes, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2 * bytes, 28); buf.writeUInt16LE(2 * bytes, 32); buf.writeUInt16LE(24, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 2 * bytes, 40);
let o = header;
for (let i = 0; i < N; i++) {
  for (const ch of [L, R]) {
    const v = Math.max(-8388608, Math.min(8388607, Math.round(ch[i] * norm * 8388607)));
    buf.writeIntLE(v, o, 3); o += 3;
  }
}
writeFileSync(OUT, buf);
console.log(`wrote ${OUT}: ${DUR}s, ${SR} Hz, 24-bit stereo`);
