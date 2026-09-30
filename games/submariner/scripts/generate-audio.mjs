// Generates every Submariner sound effect as a WAV file in public/audio/ (44.1 kHz, 16-bit, mono).
// Run from the game dir:  node scripts/generate-audio.mjs   (or: npm run audio)
//
// Everything is synthesised here: no third-party audio, no npm dependencies, and a seeded RNG so a
// re-run produces byte-identical files. One-shots are mastered to about -1 dBFS peak with enough body
// (tens of milliseconds at least) and mostly mid-range energy so they carry on laptop/phone speakers.
// Loops are built to wrap seamlessly (periodic tones + modular event placement + an equal-power
// crossfade of the noise layers) and mastered to a target RMS.
//
// After writing, the script prints per file: duration, peak/RMS dBFS, the share of energy above
// 250 Hz, and for loops the seam discontinuity. It exits non-zero if any file is broken
// (NaN/Infinity, silent, or clipped).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44_100;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/audio");
const TAU = 2 * Math.PI;
const PEAK = 0.891; // -1 dBFS

const buffer = (seconds) => new Float32Array(Math.round(seconds * SR));
const dbToAmp = (db) => Math.pow(10, db / 20);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

/** Deterministic xorshift32 RNG returning uniform values in [-1, 1). */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0x100000000) * 2 - 1;
  };
}

/** Write a sample; with `wrap` the index folds around the buffer (used to build seamless loops). */
function put(out, index, value, wrap) {
  if (wrap) out[((index % out.length) + out.length) % out.length] += value;
  else if (index >= 0 && index < out.length) out[index] += value;
}

/**
 * General oscillator voice. `freq(t)` and `env(t)` are functions of seconds since `at`.
 * `harmonics` lists partial gains (1 = fundamental); `ratios` may make them inharmonic.
 */
function voice(out, { at, dur, freq, env, harmonics = [1], ratios, wrap = false, phase0 = 0 }) {
  const start = Math.round(at * SR);
  const n = Math.round(dur * SR);
  const rs = ratios ?? harmonics.map((_, h) => h + 1);
  let phase = phase0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    phase += (TAU * freq(t)) / SR;
    let s = 0;
    for (let h = 0; h < harmonics.length; h++) s += harmonics[h] * Math.sin(phase * rs[h]);
    put(out, start + i, env(t) * s, wrap);
  }
}

/** Percussive tone: glide f0 → f1, short attack, exponential decay `tau`, 4 ms fade at the end. */
function tone(out, { at, dur, f0, f1 = f0, amp, tau, attack = 0.001, harmonics = [1], ratios, wrap = false }) {
  voice(out, {
    at, dur, harmonics, ratios, wrap,
    freq: (t) => f0 * Math.pow(f1 / f0, t / dur),
    env: (t) => amp * (t < attack ? t / attack : Math.exp(-(t - attack) / tau)) * clamp01((dur - t) / 0.004),
  });
}

/** Small bell / coin: slightly inharmonic partials with shorter decays on the upper ones. */
function bell(out, at, f, amp, length = 0.7, wrap = false) {
  for (const [ratio, gain, tau] of [[1, 1, 0.55], [2, 0.5, 0.3], [2.76, 0.35, 0.2], [4.07, 0.2, 0.12], [5.4, 0.1, 0.08]]) {
    tone(out, { at, dur: length, f0: f * ratio, amp: amp * gain, tau: length * tau, wrap });
  }
}

/** Water bubble (Minnaert resonance): a sine whose pitch rises as the bubble detaches, fast decay. */
function bubble(out, at, f, amp, dur = 0.06, rise = 0.6, wrap = false) {
  voice(out, {
    at, dur, wrap,
    freq: (t) => f * (1 + (rise * t) / dur),
    env: (t) => amp * Math.min(1, t / 0.0015) * Math.exp(-t / (dur * 0.3)) * clamp01((dur - t) / 0.003),
  });
}

/** High-passed noise burst: the hard "t" at the front of a click or impact. */
function snap(out, at, dur, amp, seed, wrap = false) {
  const rand = rng(seed);
  const start = Math.round(at * SR);
  const n = Math.round(dur * SR);
  let low = 0;
  for (let i = 0; i < n; i++) {
    const x = rand();
    low += 0.2 * (x - low);
    put(out, start + i, amp * Math.exp(-i / (n * 0.3)) * (x - low), wrap);
  }
}

/** RBJ biquad band-pass (0 dB peak); call with a new f/q per sample for sweeps. */
function bandpass() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, cf = -1, cq = -1, b0 = 0, b2 = 0, a1 = 0, a2 = 0;
  return (x, f, q) => {
    if (f !== cf || q !== cq) {
      const w = (TAU * Math.min(f, SR * 0.45)) / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
      b0 = al / a0; b2 = -al / a0; a1 = (-2 * Math.cos(w)) / a0; a2 = (1 - al) / a0; cf = f; cq = q;
    }
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** RBJ biquad low-pass. */
function lowpass() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, cf = -1, b0 = 0, b1 = 0, a1 = 0, a2 = 0;
  return (x, f, q = 0.707) => {
    if (f !== cf) {
      const w = (TAU * f) / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al, c = Math.cos(w);
      b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; a1 = (-2 * c) / a0; a2 = (1 - al) / a0; cf = f;
    }
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** One-pole high-pass (DC blocker / tilt). */
function highpass1(fc) {
  const a = 1 / (1 + (TAU * fc) / SR);
  let px = 0, py = 0;
  return (x) => (py = a * (py + x - px), px = x, py);
}

/**
 * Filtered noise layer: white noise → band-pass with centre `f(t)` and `q` → gain `env(t)`.
 * Used for water rush, swirls and hiss.
 */
function noiseBand(out, { at = 0, dur, f, q, env, seed, wrap = false }) {
  const rand = rng(seed);
  const bp = bandpass();
  const start = Math.round(at * SR);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    put(out, start + i, env(t) * bp(rand(), f(t), q), wrap);
  }
}

/**
 * Stressed-metal friction: a jittery impulse train (stick-slip) at `rate(t)` Hz exciting a bank of
 * high-Q resonant modes whose frequencies bend by `bend(t)`. Low rates give separate creaks, higher
 * rates fuse into a groan; high modes and rates give a shriek.
 */
function metalFriction(out, { at = 0, dur, rate, modes, bend = () => 1, env, seed, jitter = 0.25, hiss = 0.15, drive = 1 }) {
  const rand = rng(seed);
  const bank = modes.map(() => bandpass());
  const start = Math.round(at * SR);
  const n = Math.round(dur * SR);
  let phase = 0, next = 1, pulse = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    phase += rate(t) / SR;
    let x = hiss * rand() * 0.3;
    if (phase >= next) {
      phase -= next;
      next = 1 + jitter * rand(); // irregular spacing: each slip lands a little early or late
      pulse = 0.6 + 0.4 * Math.abs(rand());
    }
    x += pulse;
    pulse *= 0.55; // a few-sample decaying kick rather than a single-sample spike
    const b = bend(t);
    let y = 0;
    for (let m = 0; m < modes.length; m++) {
      const [f, q, g] = modes[m];
      y += g * bank[m](x, f * b, q);
    }
    put(out, start + i, env(t) * Math.tanh(y * drive), false);
  }
}

// ---------------------------------------------------------------------------------------------
// Mastering
// ---------------------------------------------------------------------------------------------

/** One-shot mastering: DC-block, end fade, soft-clip (tanh) with `drive`, normalise to -1 dBFS peak. */
function master(out, drive = 1.6, peak = PEAK) {
  const hp = highpass1(20);
  for (let i = 0; i < out.length; i++) out[i] = hp(out[i]);
  const fade = Math.round(0.01 * SR);
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  let max = 0;
  for (const s of out) max = Math.max(max, Math.abs(s));
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh((out[i] / max) * drive);
  max = 0;
  for (const s of out) max = Math.max(max, Math.abs(s));
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / max) * peak;
  return out;
}

/**
 * Loop mastering: remove DC, scale to a target RMS, soft-limit anything above `ceiling`.
 * Every step is a per-sample continuous map, so the loop seam stays seamless.
 */
function masterLoop(out, rmsDb, ceiling = PEAK) {
  let mean = 0;
  for (const s of out) mean += s;
  mean /= out.length;
  for (let i = 0; i < out.length; i++) out[i] -= mean;
  const knee = ceiling * 0.7;
  const limit = (x) => {
    const a = Math.abs(x);
    if (a <= knee) return x;
    const room = ceiling - knee;
    return Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
  };
  const src = Float32Array.from(out);
  let gain = 1;
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < out.length; i++) out[i] = limit(src[i] * gain);
    const r = rms(out);
    gain *= dbToAmp(rmsDb) / r;
  }
  for (let i = 0; i < out.length; i++) out[i] = limit(src[i] * gain);
  mean = 0;
  for (const s of out) mean += s;
  mean /= out.length;
  for (let i = 0; i < out.length; i++) out[i] -= mean;
  return out;
}

/**
 * Seamless-loop helper for noise-like layers: `fill` writes `len + xf` seconds of continuous signal
 * (using envelopes periodic in `len`); the overhang is equal-power crossfaded into the head.
 */
function seamless(len, xf, fill) {
  const L = Math.round(len * SR), X = Math.round(xf * SR);
  const long = new Float32Array(L + X);
  fill(long);
  const out = long.slice(0, L);
  for (let i = 0; i < X; i++) {
    const w = (i / X) * (Math.PI / 2);
    out[i] = long[i] * Math.sin(w) + long[L + i] * Math.cos(w);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------------------------

const SOUNDS = {
  // Deep-sea bed (12 s seamless loop): low rumble, muffled water movement, a distant whale-ish swell, a few soft bubble clusters.
  "ambience-loop": {
    loop: true,
    build() {
      const LEN = 12;
      const lfo = (t, period, ph = 0) => Math.sin((TAU * t) / period + ph); // periods divide 12 s
      // Noise layers (crossfaded seam): rumble + mid-range water movement + faint high fizz.
      const bed = seamless(LEN, 1.5, (buf) => {
        const rand = rng(101);
        const lpR = lowpass(), lpR2 = lowpass();
        const bpW = bandpass(), bpW2 = bandpass(), lpW = lowpass();
        const bpF = bandpass();
        let brown = 0;
        for (let i = 0; i < buf.length; i++) {
          const t = i / SR;
          brown = brown * 0.998 + rand() * 0.06;
          const rumble = lpR2(lpR(brown, 110), 110) * (0.8 + 0.2 * lfo(t, 6));
          // Water movement: a band that drifts between ~300 and ~800 Hz, swelling and ebbing.
          const c1 = 480 + 170 * lfo(t, 12) + 90 * lfo(t, 4, 1.3);
          const c2 = 820 + 220 * lfo(t, 6, 2.1);
          const surge = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * lfo(t, 12, -1.2), 2) + 0.15 * lfo(t, 3, 0.4);
          const water = lpW(bpW(rand(), c1, 1.1) * 1.0 + bpW2(rand(), c2, 2.2) * 0.55 * (0.6 + 0.4 * lfo(t, 4)), 1400) * surge;
          const fizz = bpF(rand(), 2200 + 300 * lfo(t, 3), 3) * 0.1 * (0.5 + 0.5 * lfo(t, 2, 0.7));
          buf[i] = 0.07 * rumble + 1.0 * water + fizz;
        }
      });
      // Event layers placed modulo the loop length (they wrap around the seam).
      const ev = new Float32Array(bed.length);
      // Distant whale-ish swells: slow gliding tones, soft harmonics, a faint echo.
      const swell = (at, dur, fA, fB, fC, amp) => {
        for (const [dt, g] of [[0, 1], [0.38, 0.35]]) {
          voice(ev, {
            at: at + dt, dur, wrap: true, harmonics: [1, 0.45, 0.22, 0.1],
            freq: (t) => {
              const u = t / dur;
              const base = u < 0.5 ? fA + (fB - fA) * Math.sin(Math.PI * u) : fB + (fC - fB) * (2 * u - 1);
              return base * (1 + 0.006 * Math.sin(TAU * 4.3 * t));
            },
            env: (t) => amp * g * Math.pow(Math.sin((Math.PI * t) / dur), 2) * (0.85 + 0.15 * Math.sin(TAU * 0.9 * t)),
          });
        }
      };
      swell(1.4, 4.6, 300, 470, 290, 0.055);
      swell(7.6, 3.9, 520, 560, 380, 0.04); // wraps past 12 s into the head
      // Soft bubble clusters drifting up.
      const rand = rng(202);
      for (const [at, count] of [[3.1, 9], [6.8, 6], [10.3, 11], [11.7, 5]]) {
        for (let k = 0; k < count; k++) {
          const t = at + k * 0.07 + (rand() + 1) * 0.05;
          bubble(ev, t, 650 + (rand() + 1) * 550, 0.035 + 0.02 * rand(), 0.05 + 0.02 * (rand() + 1), 0.5, true);
        }
      }
      for (let i = 0; i < bed.length; i++) bed[i] += ev[i];
      return masterLoop(bed, -22);
    },
  },

  // Submarine motor + propeller (4 s seamless loop): steady harmonic hum, 6 Hz propeller chug, gear whine, water flow.
  "engine-loop": {
    loop: true,
    build() {
      const LEN = 4;
      const CHUG = 6; // Hz: 24 chugs per loop
      // Propeller beat envelope: smooth 12 ms rise, decay, and exactly 0 at both ends of each beat (no clicks).
      const TAIL = Math.exp(-1 / 0.22);
      const chugEnv = (t) => {
        const p = (t * CHUG) % 1; // 0..1 within each propeller beat
        return ((1 - Math.exp(-p / 0.012)) * (Math.exp(-p / 0.22) - TAIL)) / (1 - TAIL);
      };
      // Water flow past the hull (crossfaded noise), pulsing with the propeller.
      const out = seamless(LEN, 0.5, (buf) => {
        const rand = rng(303);
        const bp1 = bandpass(), bp2 = bandpass();
        for (let i = 0; i < buf.length; i++) {
          const t = i / SR;
          const pulse = 0.5 + 0.5 * chugEnv(t);
          buf[i] = (bp1(rand(), 420, 1.4) * 0.5 + bp2(rand(), 1100, 2) * 0.12) * pulse;
        }
      });
      // Motor hum: periodic in 4 s (all frequencies are multiples of 0.25 Hz), energy centred 180-700 Hz.
      const hum = new Float32Array(out.length);
      const F0 = 60;
      const humGains = [0.1, 0.18, 0.55, 0.55, 0.48, 0.4, 0.32, 0.25, 0.2, 0.15, 0.11, 0.08, 0.06];
      for (let i = 0; i < hum.length; i++) {
        const t = i / SR;
        let s = 0;
        for (let k = 0; k < humGains.length; k++) s += humGains[k] * Math.sin(TAU * F0 * (k + 1) * t + k * 0.7);
        // Second rotor slightly off-ratio for a live, beating texture (97 Hz = 388 cycles per loop).
        s += 0.1 * Math.sin(TAU * 97 * t) + 0.14 * Math.sin(TAU * 194 * t + 1) + 0.1 * Math.sin(TAU * 291 * t + 2);
        const gearWhine = 0.05 * Math.sin(TAU * 742 * t) * (0.7 + 0.3 * Math.sin(TAU * CHUG * t));
        hum[i] = Math.tanh(1.3 * s * (0.6 + 0.4 * chugEnv(t))) * 0.5 + gearWhine;
      }
      // Propeller chug: one thump + band-passed wash per blade pass, 3-blade accent pattern.
      const chug = new Float32Array(out.length);
      const rand = rng(404);
      const accent = [1, 0.78, 0.88];
      for (let k = 0; k < LEN * CHUG; k++) {
        const at = k / CHUG + 0.002 * rand();
        const a = accent[k % 3] * (0.92 + 0.08 * rand());
        tone(chug, { at, dur: 0.12, f0: 210, f1: 135, amp: 0.55 * a, tau: 0.035, attack: 0.004, harmonics: [1, 0.6, 0.35, 0.2], wrap: true });
        noiseBand(chug, {
          at, dur: 0.12, seed: 500 + k, q: 1.6, wrap: true,
          f: (t) => 650 - 1800 * t,
          env: (t) => 1.3 * a * Math.min(1, t / 0.006) * Math.exp(-t / 0.035),
        });
        // Small mechanical rattle half-way between blades.
        snap(chug, at + 0.5 / CHUG, 0.012, 0.12 * a, 900 + k, true);
      }
      for (let i = 0; i < out.length; i++) out[i] += hum[i] + chug[i];
      return masterLoop(out, -18);
    },
  },

  // Classic sonar ping: clean ~1.2 kHz ping, sharp onset, long tail, three fading echoes.
  sonar: {
    build() {
      const out = buffer(1.8);
      const ping = (at, amp, tau, bright) => {
        tone(out, { at, dur: 1.8 - at, f0: 1210, f1: 1195, amp, tau, attack: 0.002, harmonics: [1, 0.12 * bright, 0.04 * bright] });
        tone(out, { at, dur: 1.8 - at, f0: 1214, f1: 1199, amp: amp * 0.35, tau: tau * 0.8, attack: 0.002 }); // slow beating shimmer
        tone(out, { at, dur: 0.25, f0: 2420, amp: amp * 0.12 * bright, tau: 0.03, attack: 0.001 }); // bright strike
      };
      snap(out, 0, 0.004, 0.4, 61);
      ping(0, 1, 0.42, 1);
      for (const [at, amp, tau] of [[0.42, 0.36, 0.3], [0.84, 0.19, 0.28], [1.26, 0.1, 0.25]]) ping(at, amp, tau, 0.3);
      return master(out, 1.25);
    },
  },

  // Ballast tanks flooding: a heavy hull clunk, then a rush of bubbles and swirling water.
  "dive-start": {
    build() {
      const out = buffer(1.3);
      // Hull clunk: low thud paired with resonant metal body so it reads on small speakers.
      snap(out, 0, 0.012, 1.1, 71);
      tone(out, { at: 0, dur: 0.4, f0: 110, f1: 70, amp: 0.9, tau: 0.09, attack: 0.002, harmonics: [1, 0.5, 0.3] });
      tone(out, { at: 0, dur: 0.5, f0: 1, amp: 0.55, tau: 0.16, ratios: [310, 527, 868, 1342], harmonics: [1, 0.8, 0.55, 0.3] });
      tone(out, { at: 0.035, dur: 0.3, f0: 1, amp: 0.3, tau: 0.08, ratios: [405, 690, 1150], harmonics: [1, 0.6, 0.35] }); // latch rebound
      // Water rush: swirling band of noise that surges in and fades.
      noiseBand(out, {
        at: 0.1, dur: 1.2, seed: 72, q: 1.3,
        f: (t) => 500 + 900 * Math.sin(Math.min(1, t / 0.9) * Math.PI * 0.9) + 150 * Math.sin(TAU * 3.5 * t),
        env: (t) => 1.25 * Math.min(1, t / 0.12) * Math.exp(-t / 0.45) * (0.8 + 0.2 * Math.sin(TAU * 7 * t)),
      });
      noiseBand(out, { at: 0.08, dur: 1.0, seed: 73, q: 0.8, f: () => 260, env: (t) => 0.6 * Math.min(1, t / 0.08) * Math.exp(-t / 0.3) });
      // Bubbles: a dense burst that thins out.
      const rand = rng(74);
      for (let k = 0; k < 70; k++) {
        const t = 0.12 + Math.pow((rand() + 1) / 2, 1.8) * 1.05;
        bubble(out, t, 380 + (rand() + 1) * 700, 0.28 * (1 - (t - 0.12) / 1.2) + 0.05, 0.04 + 0.03 * (rand() + 1), 0.7);
      }
      return master(out, 2.3);
    },
  },

  // Bet placed: satisfying chip / lever clack (short "chk" then a bright latch).
  bet: {
    build() {
      const out = buffer(0.2);
      snap(out, 0, 0.008, 1.0, 81);
      tone(out, { at: 0, dur: 0.09, f0: 760, f1: 640, amp: 0.8, tau: 0.03, harmonics: [1, 0.5, 0.25] });
      snap(out, 0.048, 0.01, 1.3, 82);
      tone(out, { at: 0.048, dur: 0.15, f0: 1650, f1: 1480, amp: 1, tau: 0.04, harmonics: [1, 0.45, 0.2], ratios: [1, 2.3, 3.9] });
      tone(out, { at: 0.048, dur: 0.12, f0: 830, amp: 0.45, tau: 0.035 });
      return master(out, 2.2);
    },
  },

  // Bet cancelled: softer, lower, descending two-step click.
  cancel: {
    build() {
      const out = buffer(0.2);
      for (const [at, f, a] of [[0, 900, 1], [0.07, 620, 0.9]]) {
        snap(out, at, 0.006, 0.45 * a, 91 + at * 1000);
        tone(out, { at, dur: 0.12, f0: f, f1: f * 0.85, amp: a, tau: 0.035, attack: 0.002, harmonics: [1, 0.3, 0.1] });
        tone(out, { at, dur: 0.08, f0: f / 2, amp: 0.4 * a, tau: 0.03, attack: 0.002 });
      }
      return master(out, 2.2, dbToAmp(-2));
    },
  },

  // Countdown tick: clear metallic tick with a short ring.
  tick: {
    build() {
      const out = buffer(0.12);
      snap(out, 0, 0.006, 1.2, 101);
      tone(out, { at: 0, dur: 0.12, f0: 2350, amp: 1, tau: 0.03, harmonics: [1, 0.35, 0.15], ratios: [1, 2.76, 5.4] });
      tone(out, { at: 0, dur: 0.08, f0: 1180, f1: 1100, amp: 0.7, tau: 0.022, harmonics: [1, 0.3] });
      return master(out, 2.3);
    },
  },

  // Cash-out success: bright coin/bell chime cluster, warm body and a bubbly upward swirl.
  cashout: {
    build() {
      const out = buffer(1.1);
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(out, i * 0.06, f, 1 - i * 0.08, 0.95)); // C6 E6 G6 C7
      tone(out, { at: 0, dur: 0.8, f0: 523.25, amp: 0.38, tau: 0.28, attack: 0.004, harmonics: [1, 0.3] }); // C5 body
      const rand = rng(111);
      for (let i = 0; i < 9; i++) bell(out, 0.18 + i * 0.055 + (rand() + 1) * 0.012, 2600 + (rand() + 1) * 650, 0.32, 0.3); // coin clinks
      // Bubbly upward swirl: an ascending run of bubbles over a rising noise swoosh.
      for (let k = 0; k < 16; k++) {
        const t = 0.04 + k * 0.042 + 0.01 * rand();
        bubble(out, t, 480 * Math.pow(2, k / 7) * (1 + 0.05 * rand()), 0.3, 0.05, 0.8);
      }
      noiseBand(out, {
        at: 0.02, dur: 0.9, seed: 112, q: 3,
        f: (t) => 600 * Math.pow(5, Math.min(1, t / 0.7)),
        env: (t) => 0.45 * Math.min(1, t / 0.2) * Math.exp(-t / 0.3),
      });
      return master(out, 1.9);
    },
  },

  // Depth milestone (2x / 5x / 10x): small rising "blip-blip".
  milestone: {
    build() {
      const out = buffer(0.5);
      for (const [at, f] of [[0, 880], [0.13, 1318.5]]) {
        tone(out, { at, dur: 0.34, f0: f * 0.94, f1: f * 1.04, amp: 1, tau: 0.1, attack: 0.003, harmonics: [1, 0.25, 0.12] });
        tone(out, { at, dur: 0.3, f0: f * 1.004, amp: 0.3, tau: 0.08, attack: 0.003 });
      }
      bubble(out, 0.02, 700, 0.25, 0.05, 1);
      bubble(out, 0.16, 1000, 0.25, 0.05, 1);
      return master(out, 1.8);
    },
  },

  // Hull creak 1: stick-slip creaks that tighten into a rising, bending metal groan.
  "creak-1": {
    build() {
      const out = buffer(1.5);
      metalFriction(out, {
        dur: 1.5, seed: 121, jitter: 0.3,
        rate: (t) => (t < 0.45 ? 14 + 60 * t : 41 + 45 * Math.sin(Math.min(1, (t - 0.45) / 0.9) * Math.PI * 0.8)),
        modes: [[235, 30, 0.9], [412, 45, 1], [688, 55, 0.8], [1042, 70, 0.55], [1376, 80, 0.35]],
        bend: (t) => 1 - 0.06 * Math.sin((Math.PI * t) / 1.5),
        env: (t) => Math.min(1, t / 0.05) * (0.75 + 0.25 * Math.sin(TAU * 2.2 * t)) * clamp01((1.5 - t) / 0.35),
        drive: 3,
      });
      return master(out, 1.8);
    },
  },

  // Hull creak 2: deeper slow groan bending downward, ending in a thin high squeal.
  "creak-2": {
    build() {
      const out = buffer(1.7);
      metalFriction(out, {
        dur: 1.7, seed: 131, jitter: 0.18,
        rate: (t) => 30 + 28 * Math.sin(Math.min(1, t / 1.3) * Math.PI) - 6 * t,
        modes: [[205, 25, 1], [330, 40, 0.9], [560, 50, 0.85], [790, 60, 0.6], [1180, 90, 0.4]],
        bend: (t) => 1.02 - 0.1 * (t / 1.7),
        env: (t) => Math.min(1, t / 0.18) * (0.8 + 0.2 * Math.sin(TAU * 1.3 * t + 1)) * clamp01((1.7 - t) / 0.4),
        drive: 3,
      });
      metalFriction(out, {
        at: 0.95, dur: 0.6, seed: 132, jitter: 0.06, hiss: 0.05,
        rate: (t) => 380 - 90 * t,
        modes: [[1150, 120, 1], [1490, 140, 0.5]],
        bend: (t) => 1 + 0.03 * Math.sin(TAU * 5 * t),
        env: (t) => 0.45 * Math.sin((Math.PI * t) / 0.6),
        drive: 2,
      });
      return master(out, 1.8);
    },
  },

  // Hull implosion: crunch/tear transient, metal shriek, huge muffled boom, then a fading rush of bubbles.
  implode: {
    build() {
      const out = buffer(2.4);
      const rand = rng(141);
      // 1. Crunch / tear: a broadband crack plus a crackle of metal ruptures over the first ~0.35 s.
      snap(out, 0, 0.03, 1.4, 142);
      noiseBand(out, { dur: 0.35, seed: 143, q: 0.7, f: (t) => 1500 - 2500 * t, env: (t) => 1.4 * Math.exp(-t / 0.07) });
      for (let k = 0; k < 45; k++) {
        const t = Math.pow((rand() + 1) / 2, 1.6) * 0.4;
        const f = 600 + (rand() + 1) * 1200;
        tone(out, { at: t, dur: 0.06, f0: f, f1: f * 0.8, amp: 0.45 * (1 - t / 0.5), tau: 0.012, ratios: [1, 1.53, 2.31], harmonics: [1, 0.6, 0.35] });
        snap(out, t, 0.005, 0.5 * (1 - t / 0.5), 150 + k);
      }
      // 2. Metal shriek: a high, fast friction tone sliding down.
      metalFriction(out, {
        at: 0.02, dur: 0.75, seed: 144, jitter: 0.08, hiss: 0.2,
        rate: (t) => 330 - 220 * t,
        modes: [[980, 50, 1], [1420, 70, 0.8], [2130, 90, 0.5], [650, 40, 0.5]],
        bend: (t) => 1 - 0.28 * t,
        env: (t) => 0.9 * Math.min(1, t / 0.02) * Math.exp(-t / 0.28),
        drive: 3,
      });
      // 3. Boom: sub drop for weight, saturated so its harmonics land at 150-600 Hz, plus a muffled mid body.
      const boom = new Float32Array(out.length);
      tone(boom, { at: 0.03, dur: 2.2, f0: 72, f1: 28, amp: 1, tau: 0.55, attack: 0.006 });
      tone(boom, { at: 0.03, dur: 1.2, f0: 150, f1: 70, amp: 0.5, tau: 0.3, attack: 0.004 });
      for (let i = 0; i < boom.length; i++) out[i] += 0.4 * Math.tanh(2.8 * boom[i]);
      noiseBand(out, { at: 0.02, dur: 1.4, seed: 145, q: 0.6, f: (t) => 420 - 150 * t, env: (t) => 1.1 * Math.min(1, t / 0.01) * Math.exp(-t / 0.3) });
      tone(out, { at: 0.03, dur: 0.9, f0: 1, amp: 0.45, tau: 0.22, ratios: [196, 311, 463, 702], harmonics: [1, 0.8, 0.6, 0.4] }); // hull body
      // 4. Rush of bubbles fading out.
      noiseBand(out, {
        at: 0.3, dur: 2.1, seed: 146, q: 1.1,
        f: (t) => 700 + 500 * Math.sin(TAU * 0.6 * t) + 200 * Math.sin(TAU * 2.7 * t),
        env: (t) => 1.1 * Math.min(1, t / 0.25) * Math.exp(-t / 0.6),
      });
      for (let k = 0; k < 160; k++) {
        const t = 0.3 + Math.pow((rand() + 1) / 2, 2) * 2.0;
        bubble(out, t, 300 + (rand() + 1) * 750, 0.35 * Math.exp(-(t - 0.3) / 0.7) + 0.03, 0.04 + 0.04 * (rand() + 1), 0.6);
      }
      return master(out, 2.4);
    },
  },

  // UI button click: short crisp click with a little body.
  click: {
    build() {
      const out = buffer(0.06);
      snap(out, 0, 0.005, 1.0, 161);
      tone(out, { at: 0, dur: 0.06, f0: 1500, f1: 1350, amp: 1, tau: 0.02, harmonics: [1, 0.3], ratios: [1, 2.1] });
      tone(out, { at: 0, dur: 0.05, f0: 620, amp: 0.55, tau: 0.018, attack: 0.002 });
      return master(out, 2.2);
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Output + verification
// ---------------------------------------------------------------------------------------------

function rms(samples) {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}

/** Measurements: peak, RMS, energy share above 250 Hz (one-pole HP), DC, loop seam jump. */
function analyse(samples, loop) {
  let peak = 0, bad = 0, mean = 0;
  for (const s of samples) {
    if (!Number.isFinite(s)) bad++;
    peak = Math.max(peak, Math.abs(s));
    mean += s;
  }
  mean /= samples.length;
  const hp = highpass1(250);
  if (loop) for (let i = samples.length - 2000; i < samples.length; i++) hp(samples[i]); // prime state across the wrap
  let eAll = 0, eHigh = 0;
  for (const s of samples) {
    const h = hp(s);
    eAll += s * s;
    eHigh += h * h;
  }
  const diffs = [];
  for (let i = 1; i < samples.length; i++) diffs.push(Math.abs(samples[i] - samples[i - 1]));
  diffs.sort((a, b) => a - b);
  return {
    peak, bad, mean,
    rms: rms(samples),
    highShare: eHigh / eAll,
    seam: Math.abs(samples[0] - samples[samples.length - 1]),
    diffP50: diffs[Math.floor(diffs.length * 0.5)],
    diffP99: diffs[Math.floor(diffs.length * 0.99)],
  };
}

mkdirSync(OUT, { recursive: true });
const db = (v) => (20 * Math.log10(v)).toFixed(1).padStart(6);
let failed = false;
for (const [name, { build, loop = false }] of Object.entries(SOUNDS)) {
  const samples = build();
  writeFileSync(resolve(OUT, `${name}.wav`), wav(samples));
  const a = analyse(samples, loop);
  const problems = [];
  if (a.bad) problems.push(`${a.bad} NaN/Inf samples`);
  if (a.rms < dbToAmp(-40)) problems.push("near-silent");
  if (a.peak > 0.999) problems.push("clipping");
  if (loop && a.seam > Math.max(a.diffP99, 0.01)) problems.push("audible seam");
  if (problems.length) failed = true;
  const seam = loop ? `  seam |Δ| ${a.seam.toFixed(4)} (typ Δ ${a.diffP50.toFixed(4)}, p99 ${a.diffP99.toFixed(4)})  DC ${a.mean.toExponential(1)}` : "";
  console.log(
    `${(name + ".wav").padEnd(18)} ${(samples.length / SR).toFixed(3)}s  peak ${db(a.peak)} dBFS  rms ${db(a.rms)} dBFS  >250Hz ${(a.highShare * 100).toFixed(0).padStart(3)}%${seam}` +
      (problems.length ? `  !! ${problems.join(", ")}` : ""),
  );
}
if (failed) process.exitCode = 1;
